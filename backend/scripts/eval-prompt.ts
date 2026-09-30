/**
 * Score an extraction prompt against hand-labelled TORs.
 *
 * Each gold file (eval/gold/<projectNumber>.json) is what a person read out of
 * one TOR. This fetches the same PDF from e-GP, runs the prompt, and compares
 * field by field, so a prompt change can be judged by numbers instead of by
 * eyeballing one output.
 *
 * The model's replies are saved to eval/runs/<version>/<projectNumber>.json.
 * `--cached` re-scores those saved replies without calling Vertex again —
 * use it when changing the scorer or the gold files. PDFs are never saved.
 *
 * Usage (in container):
 *   docker compose --profile tools run --rm tools npx tsx scripts/eval-prompt.ts
 *   ... npx tsx scripts/eval-prompt.ts --prompt=v2 --only=69049097411
 *   ... npx tsx scripts/eval-prompt.ts --cached          # no API calls
 *   ... npx tsx scripts/eval-prompt.ts --verbose         # every mismatch
 */

import { config } from "dotenv";
config({ path: ".env" });

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import mongoose from "mongoose";

import { prompts, type ExtractionContext } from "../src/services/ai/prompts";
import type { TorExtractionV2, QualificationV2 } from "../src/services/ai/prompts/v2";
import type { TorExtractionV3 } from "../src/services/ai/prompts/v3";
import type { TorExtractionV4 } from "../src/services/ai/prompts/v4";
import { validateExtraction, type ValidationIssue } from "../src/services/ai/validate-extraction";
import { callModel, prepareDocuments } from "../src/services/ai/tor-parser";
import { resolvePrices } from "../src/services/ai/resolve-prices";
import { fetchProjectArchive } from "../src/services/ingestion/egp-client";
import type { ArchiveFacts } from "../src/services/ingestion/archive-facts";
import TORRecord from "../src/db/models/tor-record";

/* ─── Args ──────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const PROMPT_VERSION = arg("prompt") ?? "v3";
const VERSION_NUM = Number(PROMPT_VERSION.replace(/\D/g, ""));
const ONLY = arg("only");
const CACHED = argv.includes("--cached");
const VERBOSE = argv.includes("--verbose");

const GOLD_DIR = path.resolve("eval/gold");
const RUN_DIR = path.resolve("eval/runs", PROMPT_VERSION);

/* ─── Gold format ───────────────────────────────────────────────────── */

interface GoldQualification {
  criterion: string;
  type: string;
  minimumNumber: number | null;
  unit: string | null;
  normalizedNames: string[];
  isMandatory: boolean;
  isBoilerplate: boolean;
  alternativeGroup: string | null;
  requiresGovernment: boolean | null;
  sameTypeRequired: boolean | null;
  requiredCerts: string[];
  sourcePage: number | null;
}

interface Gold {
  projectNumber: string;
  fileName?: string;
  workType: string;
  contractDurationDays: number | null;
  qualifications: GoldQualification[];
  evaluationMethod: string | null;
  evaluationWeights: Array<{ criterion: string; weight: number }>;
  /** The price figure the TOR states, as printed — see priceKind. */
  medianPrice: number | null;
  /**
   * The NAME the TOR gives that figure: "budget" = it says วงเงินงบประมาณ,
   * "median_price" = ราคากลาง. What the TOR says, not what the figure is:
   * BMA TORs call the reference price วงเงินงบประมาณ (the e-GP announcement
   * shows it). Prices users see come from egp2 via resolve-prices.ts.
   */
  priceKind?: "budget" | "median_price" | null;
  /** Bidding day, ISO date — null when the announcement leaves it blank. */
  submissionDate?: string | null;
  /** @deprecated old name of submissionDate. */
  submissionDeadline?: string | null;
  warrantyMonths: number | null;
  riskClauses: Array<{ rawText: string; category: string; sourcePage: number | null }>;
  /** Topics on which the TOR and the bidding document disagree (v3+). Shown, not scored. */
  documentConflicts?: Array<{ topic: string; note?: string }>;
  notes?: string;
}

/* ─── Text matching ─────────────────────────────────────────────────── */

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** Normalise for fuzzy comparison: Thai digits, list numbering, spacing, punctuation. */
function norm(s: string): string {
  return s
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/^\s*[(\[]?\d+(\.\d+)*[)\].]?\s*/, "")
    .replace(/[\s"'“”‘’(),.:;\-–—/]/g, "");
}

/**
 * Dice coefficient over character bigrams — tolerant of small copy differences.
 *
 * Clauses run to a paragraph, and a labeller and the model rarely cut them at
 * the same place. So when the shorter text is substantial and almost entirely
 * contained in the longer one, that counts as a match too.
 */
function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let overlap = 0;
  for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) ?? 0);
  const dice = (2 * overlap) / (x.length - 1 + (y.length - 1));
  const shorter = Math.min(x.length, y.length) - 1;
  const containment = shorter >= 30 ? (overlap / shorter) * 0.9 : 0;
  return Math.max(dice, containment);
}

const MATCH_THRESHOLD = 0.55;

/** Greedy one-to-one pairing by best similarity. */
function pair<G, P>(gold: G[], pred: P[], gText: (g: G) => string, pText: (p: P) => string) {
  const candidates: Array<{ gi: number; pi: number; s: number }> = [];
  gold.forEach((g, gi) =>
    pred.forEach((p, pi) => {
      const s = similarity(gText(g), pText(p));
      if (s >= MATCH_THRESHOLD) candidates.push({ gi, pi, s });
    }),
  );
  candidates.sort((a, b) => b.s - a.s);
  const usedG = new Set<number>();
  const usedP = new Set<number>();
  const pairs: Array<{ g: G; p: P; s: number }> = [];
  for (const c of candidates) {
    if (usedG.has(c.gi) || usedP.has(c.pi)) continue;
    usedG.add(c.gi);
    usedP.add(c.pi);
    pairs.push({ g: gold[c.gi], p: pred[c.pi], s: c.s });
  }
  return {
    pairs,
    missed: gold.filter((_, i) => !usedG.has(i)),
    extra: pred.filter((_, i) => !usedP.has(i)),
  };
}

/* ─── Field comparison ──────────────────────────────────────────────── */

// Near-exact: a 1% tolerance once hid 23,388,000 read for 23,398,000 (๙ as ๘).
const numEq = (a: number | null, b: number | null) =>
  a === b || (a != null && b != null && Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.0001));

const setEq = (a: string[], b: string[]) => {
  const x = new Set(a.map((s) => s.trim().toLowerCase()));
  const y = new Set(b.map((s) => s.trim().toLowerCase()));
  return x.size === y.size && [...x].every((v) => y.has(v));
};

const dateEq = (a: string | null, b: string | null) =>
  a === b || (a != null && b != null && a.slice(0, 10) === b.slice(0, 10));

/** Tallies correct/total per field name across every TOR. */
class Tally {
  private counts = new Map<string, { ok: number; n: number }>();
  readonly mismatches: string[] = [];

  add(field: string, ok: boolean, detail?: () => string) {
    const c = this.counts.get(field) ?? { ok: 0, n: 0 };
    c.n++;
    if (ok) c.ok++;
    this.counts.set(field, c);
    if (!ok && detail) this.mismatches.push(`${field}: ${detail()}`);
  }

  rows() {
    return [...this.counts.entries()].map(([field, c]) => ({ field, ...c, pct: c.n ? c.ok / c.n : 0 }));
  }
}

const QUAL_FIELDS: Array<{
  name: keyof GoldQualification & keyof QualificationV2;
  eq: (g: any, p: any) => boolean;
}> = [
  { name: "type", eq: (g, p) => g === p },
  { name: "minimumNumber", eq: numEq },
  { name: "unit", eq: (g, p) => g === p },
  { name: "isMandatory", eq: (g, p) => g === p },
  { name: "isBoilerplate", eq: (g, p) => g === p },
  // Group labels are arbitrary ("A" vs "1"); only whether one exists is compared.
  { name: "alternativeGroup", eq: (g, p) => (g == null) === (p == null) },
  { name: "requiresGovernment", eq: (g, p) => g === p },
  { name: "sameTypeRequired", eq: (g, p) => g === p },
  { name: "requiredCerts", eq: setEq },
  { name: "normalizedNames", eq: setEq },
  { name: "sourcePage", eq: (g, p) => g === p },
];

interface TorScore {
  projectNumber: string;
  qual: { gold: number; pred: number; matched: number; goldCore: number; matchedCore: number };
  risk: { gold: number; pred: number; matched: number };
  /** Scalar fields the gold marks null (not in the document) but the model filled. */
  invented: string[];
  missedCriteria: string[];
  extraCriteria: string[];
}

function scoreOne(gold: Gold, pred: TorExtractionV2, tally: Tally, facts?: ArchiveFacts): TorScore {
  const id = gold.projectNumber;
  const show = (v: unknown) => JSON.stringify(v);

  /* scalars */
  // v4 reports budget and reference price separately, so it must put the
  // figure in the field the document names; earlier versions had one field.
  const predPrice =
    "budget" in pred
      ? gold.priceKind === "budget"
        ? (pred as unknown as TorExtractionV4).budget.value
        : pred.medianPrice.value
      : pred.medianPrice.value;
  // v4 reads the submission date and the bidding document's duration in
  // code (archive-facts.ts); the pipeline uses those over the model's.
  const predDuration = facts?.contractDuration?.days ?? pred.scopeOfWork.contractDurationDays;
  const goldSubmission = gold.submissionDate !== undefined ? gold.submissionDate : (gold.submissionDeadline ?? null);
  const predSubmission = facts
    ? facts.submissionDate.date
    : ((pred.keyDates as Partial<TorExtractionV2["keyDates"]>).submissionDeadline?.value ?? null);
  const scalars: Array<[string, unknown, unknown, boolean]> = [
    ["workType", gold.workType, pred.workType, gold.workType === pred.workType],
    [
      "contractDurationDays",
      gold.contractDurationDays,
      predDuration,
      numEq(gold.contractDurationDays, predDuration),
    ],
    ["price", gold.medianPrice, predPrice, numEq(gold.medianPrice, predPrice)],
    [
      "submissionDate",
      goldSubmission,
      predSubmission,
      dateEq(goldSubmission, predSubmission),
    ],
    [
      "warrantyMonths",
      gold.warrantyMonths,
      pred.keyDates.warrantyMonths.value,
      numEq(gold.warrantyMonths, pred.keyDates.warrantyMonths.value),
    ],
    [
      "evaluationMethod",
      gold.evaluationMethod,
      pred.evaluationCriteria.method,
      gold.evaluationMethod === pred.evaluationCriteria.method,
    ],
    [
      "evaluationWeights",
      gold.evaluationWeights.map((w) => w.weight).sort(),
      pred.evaluationCriteria.weights.map((w) => w.weight).sort(),
      show(gold.evaluationWeights.map((w) => w.weight).sort((a, b) => a - b)) ===
        show(pred.evaluationCriteria.weights.map((w) => w.weight).sort((a, b) => a - b)),
    ],
  ];
  const invented: string[] = [];
  for (const [field, g, p, ok] of scalars) {
    tally.add(field, ok, () => `${id} เฉลย ${show(g)} | ได้ ${show(p)}`);
    if (g == null && p != null) invented.push(field);
  }

  /* qualifications */
  const q = pair(gold.qualifications, pred.qualifications, (g) => g.criterion, (p) => p.criterion);
  for (const { g, p } of q.pairs) {
    for (const f of QUAL_FIELDS) {
      // An empty gold list here means "no single right name" (e.g. a dealer
      // authorisation letter), not "the model must return nothing".
      if (f.name === "normalizedNames" && g.normalizedNames.length === 0) continue;
      tally.add(`qual.${f.name}`, f.eq(g[f.name], p[f.name]), () =>
        `${id} "${g.criterion.slice(0, 40)}" เฉลย ${show(g[f.name])} | ได้ ${show(p[f.name])}`,
      );
    }
  }
  const core = (g: GoldQualification) => !g.isBoilerplate;

  /* risk clauses */
  const r = pair(gold.riskClauses, pred.riskClauses, (g) => g.rawText, (p) => p.rawText);
  for (const { g, p } of r.pairs) {
    tally.add("risk.category", g.category === p.category, () =>
      `${id} "${g.rawText.slice(0, 40)}" เฉลย ${g.category} | ได้ ${p.category}`,
    );
  }

  return {
    projectNumber: id,
    qual: {
      gold: gold.qualifications.length,
      pred: pred.qualifications.length,
      matched: q.pairs.length,
      goldCore: gold.qualifications.filter(core).length,
      matchedCore: q.pairs.filter(({ g }) => core(g)).length,
    },
    risk: { gold: gold.riskClauses.length, pred: pred.riskClauses.length, matched: r.pairs.length },
    invented,
    missedCriteria: q.missed.map((g) => `${g.isBoilerplate ? "(boilerplate) " : ""}${g.criterion}`),
    extraCriteria: q.extra.map((p) => p.criterion),
  };
}

/* ─── Running the model ─────────────────────────────────────────────── */

async function contextFor(gold: Gold, fileName: string, kind: string): Promise<ExtractionContext> {
  const rec =
    mongoose.connection.readyState === 1
      ? await TORRecord.findOne({ "metadata.projectId": gold.projectNumber }).lean()
      : null;
  return {
    title: rec?.title ?? `(โครงการ ${gold.projectNumber})`,
    agencyName: rec?.agencyName ?? "กรุงเทพมหานคร",
    medianPriceFromSource: rec?.medianPrice ?? null,
    budget: rec?.budget ?? null,
    fileName,
    documentKind: kind,
  };
}

interface RunRecord {
  promptVersion: string;
  model: string;
  durationMs: number;
  usage?: { input?: number; output?: number; thoughts?: number; total?: number };
  fileName: string;
  /** Bidding document sent alongside (v3+), with how much of it was kept. */
  biddingDoc?: { fileName: string; chars: number; originalChars: number; sections: string[] } | null;
  /** Budget figures the validator needs, kept so --cached can re-validate. */
  validationContext?: { budget: number | null; medianPriceFromSource: number | null };
  /** What the e-GP forms state, read in code (v4+). */
  facts?: ArchiveFacts | null;
  /** The model's reply, before validation. */
  output: TorExtractionV2 | TorExtractionV3 | TorExtractionV4;
}

/** v3+ replies carry documentConflicts and are run through the validator. */
const isV3 = (o: TorExtractionV2 | TorExtractionV3 | TorExtractionV4): o is TorExtractionV3 | TorExtractionV4 =>
  "documentConflicts" in o;

async function runModel(gold: Gold): Promise<RunRecord> {
  const prompt = prompts[PROMPT_VERSION];
  if (!prompt) throw new Error(`ไม่มี prompt ${PROMPT_VERSION}`);

  const archive = await fetchProjectArchive(gold.projectNumber);
  if (!archive) throw new Error("e-GP ไม่มีชุดเอกสารของโครงการนี้");
  // Same preparation as the pipeline; score the file the labeller read.
  const prepared = await prepareDocuments(archive.zip, {
    pdfFileName: gold.fileName,
    withBiddingDoc: VERSION_NUM >= 3,
  });
  if (prepared.skipReason) throw new Error(prepared.skipReason);

  const ctx = await contextFor(gold, prepared.pdf?.entry.name ?? "", prepared.pdf ? "tor" : "none");
  const call = await callModel<TorExtractionV2>(prompt, prepared, ctx, (attempt, waitMs, e) =>
    process.stdout.write(`(${String(e).match(/d{3}|fetch failed/)?.[0] ?? "error"} รอ ${waitMs / 1000} วินาที) `),
  );
  return {
    promptVersion: PROMPT_VERSION,
    model: call.model,
    durationMs: call.durationMs,
    usage: call.usage,
    fileName: prepared.pdf?.entry.name ?? "(ไม่มี PDF)",
    biddingDoc: prepared.biddingDoc && {
      fileName: prepared.biddingDoc.fileName,
      chars: prepared.biddingDoc.chars,
      originalChars: prepared.biddingDoc.originalChars,
      sections: prepared.biddingDoc.sections,
    },
    validationContext: { budget: ctx.budget ?? null, medianPriceFromSource: ctx.medianPriceFromSource ?? null },
    facts: VERSION_NUM >= 4 ? prepared.facts : null,
    output: call.output,
  };
}

/** Validated output for v3+ (what the pipeline would store); v2 as-is. */
function finalOutput(run: RunRecord): {
  output: TorExtractionV2 | TorExtractionV3 | TorExtractionV4;
  issues: ValidationIssue[];
} {
  if (!isV3(run.output)) return { output: run.output, issues: [] };
  const v = validateExtraction(run.output, run.validationContext ?? {});
  if (!run.facts || !("budget" in v.output)) return { output: v.output, issues: v.issues };
  const out = v.output as TorExtractionV4;
  const prices = resolvePrices({
    egp2Budget: run.validationContext?.budget,
    egp2MedianPrice: run.validationContext?.medianPriceFromSource,
    facts: run.facts,
    documentFigures: [out.budget.value, out.medianPrice.value],
  });
  return { output: v.output, issues: [...v.issues, ...prices.issues] };
}

/* ─── Main ──────────────────────────────────────────────────────────── */

const pct = (a: number, b: number) => (b === 0 ? "  -  " : `${((a / b) * 100).toFixed(0).padStart(3)}%`);

async function main() {
  if (!existsSync(GOLD_DIR)) {
    console.error(`ไม่พบโฟลเดอร์เฉลย ${GOLD_DIR}`);
    process.exit(1);
  }
  const goldFiles = readdirSync(GOLD_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .filter((f) => !ONLY || f.startsWith(ONLY));
  if (goldFiles.length === 0) {
    console.error("ยังไม่มีไฟล์เฉลย — คัดลอก eval/gold/_template.json เป็น <projectNumber>.json แล้วกรอก");
    process.exit(1);
  }

  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI).catch(() => {
      console.log("! ต่อ MongoDB ไม่ได้ — ส่ง context แบบไม่มีชื่อโครงการ/ราคากลาง");
    });
  }
  mkdirSync(RUN_DIR, { recursive: true });

  console.log(`[eval] prompt ${PROMPT_VERSION} | ${goldFiles.length} ฉบับ${CACHED ? " | ใช้ผลที่บันทึกไว้" : ""}\n`);

  const tally = new Tally();
  const scores: TorScore[] = [];
  const notes: string[] = [];

  for (const file of goldFiles) {
    const gold = JSON.parse(readFileSync(path.join(GOLD_DIR, file), "utf-8")) as Gold;
    const runPath = path.join(RUN_DIR, `${gold.projectNumber}.json`);
    let run: RunRecord;
    try {
      if (CACHED) {
        if (!existsSync(runPath)) throw new Error("ยังไม่มีผลที่บันทึกไว้ — รันแบบไม่ใส่ --cached ก่อน");
        run = JSON.parse(readFileSync(runPath, "utf-8")) as RunRecord;
      } else {
        process.stdout.write(`  ${gold.projectNumber} ... `);
        run = await runModel(gold);
        writeFileSync(runPath, JSON.stringify(run, null, 2));
        const u = run.usage;
        const doc = run.biddingDoc
          ? ` | +doc_ ${run.biddingDoc.chars}/${run.biddingDoc.originalChars} ตัวอักษร`
          : VERSION_NUM >= 3 ? " | ไม่มี doc_" : "";
        console.log(
          `${(run.durationMs / 1000).toFixed(1)} s | in ${u?.input} / out ${u?.output} / think ${u?.thoughts ?? 0}${doc}`,
        );
      }
    } catch (e) {
      console.log(`  ✗ ${gold.projectNumber}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const { output, issues } = finalOutput(run);
    scores.push(scoreOne(gold, output as TorExtractionV2, tally, run.facts ?? undefined));

    for (const i of issues) notes.push(`${gold.projectNumber} [${i.severity}] ${i.message}`);
    if (isV3(output)) {
      const got = output.documentConflicts.map((c) => c.topic).join(" / ") || "-";
      const want = gold.documentConflicts?.map((c) => c.topic).join(" / ") || "-";
      notes.push(`${gold.projectNumber} ขัดกัน: ได้ [${got}] | เฉลย [${want}]`);
    }
  }

  if (scores.length === 0) {
    await mongoose.disconnect();
    process.exit(1);
  }

  /* per-TOR */
  console.log("\n── ต่อฉบับ ─────────────────────────────────────────────");
  console.log("projectNumber   คุณสมบัติ(พบ/เฉลย)  เฉพาะงาน   เกิน   risk(พบ/เฉลย/ให้มา)  เดาเอง");
  for (const s of scores) {
    console.log(
      `${s.projectNumber.padEnd(15)} ${`${s.qual.matched}/${s.qual.gold}`.padStart(6)} ${pct(s.qual.matched, s.qual.gold)}` +
        `   ${pct(s.qual.matchedCore, s.qual.goldCore)}   ${String(s.qual.pred - s.qual.matched).padStart(4)}` +
        `   ${`${s.risk.matched}/${s.risk.gold}/${s.risk.pred}`.padStart(10)}` +
        `          ${s.invented.join(", ") || "-"}`,
    );
  }

  /* totals */
  const sum = (f: (s: TorScore) => number) => scores.reduce((a, s) => a + f(s), 0);
  console.log("\n── ภาพรวม ──────────────────────────────────────────────");
  console.log(`คุณสมบัติ   recall ${pct(sum((s) => s.qual.matched), sum((s) => s.qual.gold))}` +
    ` | เฉพาะข้อที่ไม่ใช่ boilerplate ${pct(sum((s) => s.qual.matchedCore), sum((s) => s.qual.goldCore))}` +
    ` | precision ${pct(sum((s) => s.qual.matched), sum((s) => s.qual.pred))}`);
  console.log(`risk        recall ${pct(sum((s) => s.risk.matched), sum((s) => s.risk.gold))}` +
    ` | ติดธงเกิน ${sum((s) => s.risk.pred - s.risk.matched)} ข้อ`);
  console.log(`เดาเอง      ${sum((s) => s.invented.length)} ช่อง (เฉลยว่าไม่มีในเอกสาร แต่ model ใส่ค่ามา)`);

  console.log("\n── ความถูกต้องรายช่อง ───────────────────────────────────");
  for (const row of tally.rows().sort((a, b) => a.pct - b.pct)) {
    console.log(`  ${row.field.padEnd(26)} ${pct(row.ok, row.n)}  (${row.ok}/${row.n})`);
  }

  /* what to look at */
  const missed = scores.flatMap((s) => s.missedCriteria.map((c) => `${s.projectNumber}: ${c}`));
  const extra = scores.flatMap((s) => s.extraCriteria.map((c) => `${s.projectNumber}: ${c}`));
  if (missed.length) {
    console.log(`\n── คุณสมบัติที่ model ไม่เจอ (${missed.length}) ──`);
    missed.slice(0, VERBOSE ? undefined : 10).forEach((m) => console.log(`  - ${m.slice(0, 120)}`));
  }
  if (extra.length) {
    console.log(`\n── คุณสมบัติที่ model ให้มาแต่ไม่อยู่ในเฉลย (${extra.length}) — แยกข้อต่างกัน หรือแต่งขึ้น ──`);
    extra.slice(0, VERBOSE ? undefined : 10).forEach((m) => console.log(`  + ${m.slice(0, 120)}`));
  }
  if (tally.mismatches.length) {
    console.log(`\n── ค่าที่ไม่ตรง (${tally.mismatches.length}) ──`);
    tally.mismatches.slice(0, VERBOSE ? undefined : 15).forEach((m) => console.log(`  • ${m.slice(0, 160)}`));
  }
  if (notes.length) {
    console.log(`\n── validator และเอกสารขัดกัน (${notes.length}) ──`);
    notes.forEach((n) => console.log(`  ▸ ${n.slice(0, 180)}`));
  }
  if (!VERBOSE && (missed.length > 10 || extra.length > 10 || tally.mismatches.length > 15)) {
    console.log("\n(ใส่ --verbose เพื่อดูทั้งหมด)");
  }
  console.log(`\nผลของ model อยู่ที่ ${path.relative(process.cwd(), RUN_DIR)}/ — สรุปขอบเขตงานให้อ่านเทียบด้วยตา`);

  writeFileSync(
    path.join(RUN_DIR, "_report.json"),
    JSON.stringify({ promptVersion: PROMPT_VERSION, at: new Date().toISOString(), scores, fields: tally.rows() }, null, 2),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("\n[fatal]", e);
  process.exit(1);
});
