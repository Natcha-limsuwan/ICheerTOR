/**
 * Admin review of what the model read: find the uncertain parts, let a
 * person correct them like filling in a form, and keep a record of every
 * change.
 *
 *   uncertainItems   which fields need a look, with the reason and TOR page
 *   parseChanges     the edit body → validated changes (only editable fields)
 *   applyChanges     write them, log each to usercorrections, recompute the
 *                    derived fields (red flags, data checks), mark verified
 *
 * Edited values get confidence 1: a person checked them against the TOR.
 */

import type { HydratedDocument, Types } from "mongoose";
import TORRecord, {
  QUALIFICATION_TYPES,
  WORK_TYPES,
  type IDocumentConflict,
  type IQualification,
  type ITORRecord,
} from "../db/models/tor-record";
import UserCorrection from "../db/models/user-correction";
import { analyzeRedFlags } from "./ai/red-flag-analyzer";
import { computeDataChecks } from "./ingestion/data-checks";

/* ─── What needs a look ─────────────────────────────────────────────── */

export interface UncertainItem {
  /** Path in the record, e.g. "parsedData.qualifications.3". */
  field: string;
  label: string;
  value: unknown;
  confidence: number | null;
  /** TOR page to check, when known. */
  sourcePage?: number | null;
  reason: string;
}

type Readable = Pick<ITORRecord, "parsedData" | "extraction" | "summary">;

export function uncertainItems(r: Readable, threshold: number): UncertainItem[] {
  const items: UncertainItem[] = [];
  const p = r.parsedData;
  const low = (c: number | undefined | null) => c != null && c < threshold;

  for (const i of r.extraction?.issues ?? []) {
    if (i.severity !== "review") continue;
    items.push({ field: i.field, label: "ตัวตรวจสอบให้คนดู", value: null, confidence: null, reason: i.message });
  }
  (p?.qualifications ?? []).forEach((q, idx) => {
    if (!low(q.confidence)) return;
    items.push({
      field: `parsedData.qualifications.${idx}`,
      label: `คุณสมบัติ ${q.clauseNumber ?? idx + 1}`,
      value: { criterion: q.criterion, type: q.type, minimumValue: q.minimumValue },
      confidence: q.confidence,
      sourcePage: q.sourcePage ?? null,
      reason: `AI ไม่มั่นใจ (${q.confidence})`,
    });
  });
  const scalar = (field: string, label: string, value: unknown, confidence: number | undefined, sourcePage?: number | null) => {
    if (low(confidence)) items.push({ field, label, value, confidence: confidence!, sourcePage, reason: `AI ไม่มั่นใจ (${confidence})` });
  };
  scalar("parsedData.scopeOfWork", "ขอบเขตงาน", p?.scopeOfWork?.content, p?.scopeOfWork?.confidence);
  scalar("parsedData.evaluationCriteria", "เกณฑ์การพิจารณา", p?.evaluationCriteria?.method, p?.evaluationCriteria?.confidence);
  scalar("parsedData.keyDates.warrantyMonths", "รับประกัน (เดือน)", p?.keyDates?.warrantyMonths?.value, p?.keyDates?.warrantyMonths?.confidence);
  if (p?.keyDates?.contractDurationDays?.source === "ai") {
    scalar("parsedData.keyDates.contractDurationDays", "ระยะเวลา (วัน)", p.keyDates.contractDurationDays.value, p.keyDates.contractDurationDays.confidence);
  }
  scalar("parsedData.documentPrices.budget", "วงเงินตาม TOR", p?.documentPrices?.budget?.value, p?.documentPrices?.budget?.confidence, p?.documentPrices?.budget?.sourcePage);
  return items;
}

/** Records with something uncertain that no admin has verified yet. */
export function needsReviewFilter(threshold: number): Record<string, unknown> {
  return {
    extractionStatus: "completed",
    "review.status": { $ne: "verified" },
    $or: [
      { "extraction.needsReview": true },
      { "parsedData.qualifications.confidence": { $lt: threshold } },
      { "parsedData.scopeOfWork.confidence": { $lt: threshold } },
      { "parsedData.evaluationCriteria.confidence": { $lt: threshold } },
    ],
  };
}

/* ─── What may be edited ────────────────────────────────────────────── */

/**
 * The editable fields, by the name used in the request body. Everything else
 * — egp2 metadata, extraction bookkeeping, red flags, data checks — is either
 * owned by ingest or recomputed here, so it cannot be set directly.
 */
export interface ReviewChanges {
  title?: string;
  agencyName?: string;
  budget?: number | null;
  medianPrice?: number | null;
  workType?: (typeof WORK_TYPES)[number];
  scopeOfWork?: string;
  summary?: { overview?: string; keyPoints?: string[]; deliverables?: string[] };
  /** Replaces the whole list — send every item, corrected. */
  qualifications?: IQualification[];
  evaluationCriteria?: {
    method?: "lowest_price" | "price_performance" | "other" | null;
    weights?: Array<{ criterion: string; weight: number }>;
    content?: string;
  };
  warrantyMonths?: number | null;
  contractDurationDays?: number | null;
  /** Bid day and window, Bangkok time; null clears it back to "not announced". */
  submissionDate?: { date: string; startTime: string; endTime: string } | null;
  documentConflicts?: IDocumentConflict[];
}

export const EDITABLE_FIELDS: Array<keyof ReviewChanges> = [
  "title", "agencyName", "budget", "medianPrice", "workType", "scopeOfWork", "summary",
  "qualifications", "evaluationCriteria", "warrantyMonths", "contractDurationDays",
  "submissionDate", "documentConflicts",
];

export class ReviewInputError extends Error {}

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isStr = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const isStrArray = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");

/** Validate the body's `changes`. Throws ReviewInputError with a Thai message. */
export function parseChanges(body: unknown): ReviewChanges {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ReviewInputError("changes ต้องเป็น object");
  const c = body as Record<string, unknown>;
  const unknown = Object.keys(c).filter((k) => !EDITABLE_FIELDS.includes(k as keyof ReviewChanges));
  if (unknown.length) throw new ReviewInputError(`แก้ไม่ได้: ${unknown.join(", ")} — แก้ได้เฉพาะ ${EDITABLE_FIELDS.join(", ")}`);

  const bad = (field: string, why: string) => {
    throw new ReviewInputError(`${field}: ${why}`);
  };
  for (const k of ["title", "agencyName", "scopeOfWork"] as const) if (k in c && !isStr(c[k])) bad(k, "ต้องเป็นข้อความ");
  for (const k of ["budget", "medianPrice", "warrantyMonths", "contractDurationDays"] as const) {
    if (k in c && c[k] !== null && !isNum(c[k])) bad(k, "ต้องเป็นตัวเลข ≥ 0 หรือ null");
  }
  if ("workType" in c && !WORK_TYPES.includes(c.workType as never)) bad("workType", `ต้องเป็น ${WORK_TYPES.join(" / ")}`);
  if ("summary" in c) {
    const s = c.summary as Record<string, unknown>;
    if (!s || typeof s !== "object") bad("summary", "ต้องเป็น object");
    if ("overview" in s && !isStr(s.overview)) bad("summary.overview", "ต้องเป็นข้อความ");
    for (const k of ["keyPoints", "deliverables"]) if (k in s && !isStrArray(s[k])) bad(`summary.${k}`, "ต้องเป็น array ของข้อความ");
  }
  if ("qualifications" in c) {
    if (!Array.isArray(c.qualifications)) bad("qualifications", "ต้องเป็น array (ส่งทุกข้อ)");
    (c.qualifications as Array<Record<string, unknown>>).forEach((q, i) => {
      if (!q || !isStr(q.criterion)) bad(`qualifications[${i}].criterion`, "ต้องมีข้อความ");
      if (q.type != null && !QUALIFICATION_TYPES.includes(q.type as never)) bad(`qualifications[${i}].type`, `ต้องเป็น ${QUALIFICATION_TYPES.join(" / ")}`);
      if (q.minimumValue != null && typeof q.minimumValue !== "number" && typeof q.minimumValue !== "string") {
        bad(`qualifications[${i}].minimumValue`, "ต้องเป็นตัวเลขหรือข้อความ");
      }
    });
  }
  if ("evaluationCriteria" in c) {
    const e = c.evaluationCriteria as Record<string, unknown>;
    if (!e || typeof e !== "object") bad("evaluationCriteria", "ต้องเป็น object");
    if ("method" in e && e.method !== null && !["lowest_price", "price_performance", "other"].includes(e.method as string)) {
      bad("evaluationCriteria.method", "ต้องเป็น lowest_price / price_performance / other");
    }
    if ("weights" in e) {
      const w = e.weights as Array<Record<string, unknown>>;
      if (!Array.isArray(w) || w.some((x) => !isStr(x?.criterion) || !isNum(x?.weight))) bad("evaluationCriteria.weights", "ต้องเป็น [{ criterion, weight }]");
      const total = w.reduce((sum, x) => sum + (x.weight as number), 0);
      if (w.length && Math.abs(total - 100) > 0.5) bad("evaluationCriteria.weights", `น้ำหนักรวมต้องเท่ากับ 100 (ได้ ${total})`);
    }
  }
  if ("submissionDate" in c && c.submissionDate !== null) {
    const d = c.submissionDate as Record<string, unknown>;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d?.date))) bad("submissionDate.date", "ต้องเป็น YYYY-MM-DD (ค.ศ.)");
    for (const k of ["startTime", "endTime"]) if (!/^\d{2}:\d{2}$/.test(String(d?.[k]))) bad(`submissionDate.${k}`, "ต้องเป็น HH:MM");
  }
  if ("documentConflicts" in c) {
    const list = c.documentConflicts as Array<Record<string, unknown>>;
    if (!Array.isArray(list) || list.some((x) => !isStr(x?.topic) || !isStr(x?.torText) || !isStr(x?.biddingDocText))) {
      bad("documentConflicts", "ต้องเป็น [{ topic, torText, biddingDocText, torPage? }]");
    }
  }
  return c as ReviewChanges;
}

/* ─── Writing ───────────────────────────────────────────────────────── */

type TorDoc = HydratedDocument<ITORRecord>;

/** Apply changes to the document in memory; returns [path, before, after] per change. */
function setChanges(doc: TorDoc, c: ReviewChanges): Array<[string, unknown, unknown]> {
  const log: Array<[string, unknown, unknown]> = [];
  const set = (path: string, value: unknown) => {
    const before = doc.get(path);
    doc.set(path, value);
    log.push([path, before === undefined ? null : before, value]);
  };

  if (c.title !== undefined) set("title", c.title.trim());
  if (c.agencyName !== undefined) set("agencyName", c.agencyName.trim());
  if (c.budget !== undefined) set("budget", c.budget ?? undefined);
  if (c.medianPrice !== undefined) {
    set("medianPrice", c.medianPrice ?? undefined);
    set("parsedData.medianPrice", { value: c.medianPrice, confidence: c.medianPrice != null ? 1 : 0, source: c.medianPrice != null ? "document" : null });
  }
  if (c.workType !== undefined) set("parsedData.workType", c.workType);
  if (c.scopeOfWork !== undefined) set("parsedData.scopeOfWork", { content: c.scopeOfWork, confidence: 1 });
  if (c.summary !== undefined) {
    for (const [k, v] of Object.entries(c.summary)) set(`summary.${k}`, v);
    set("summary.confidence", 1);
  }
  if (c.qualifications !== undefined) {
    set("parsedData.qualifications", c.qualifications.map((q) => ({ ...q, confidence: 1 })));
  }
  if (c.evaluationCriteria !== undefined) {
    for (const [k, v] of Object.entries(c.evaluationCriteria)) set(`parsedData.evaluationCriteria.${k}`, v);
    set("parsedData.evaluationCriteria.confidence", 1);
  }
  if (c.warrantyMonths !== undefined) set("parsedData.keyDates.warrantyMonths", { value: c.warrantyMonths, confidence: 1 });
  if (c.contractDurationDays !== undefined) {
    set("parsedData.keyDates.contractDurationDays", { value: c.contractDurationDays, confidence: 1, rawText: "แก้ไขโดย admin", source: null });
  }
  if (c.submissionDate !== undefined) {
    const d = c.submissionDate;
    const closesAt = d ? new Date(`${d.date}T${d.endTime}:00+07:00`) : null;
    set("parsedData.keyDates.submissionDate", d
      ? { date: d.date, startTime: d.startTime, endTime: d.endTime, closesAt, status: "confirmed", rawText: "แก้ไขโดย admin", source: "admin" }
      : { date: null, startTime: null, endTime: null, closesAt: null, status: "pending", rawText: null, source: null });
    set("submissionDeadline", closesAt ?? undefined);
  }
  if (c.documentConflicts !== undefined) set("parsedData.documentConflicts", c.documentConflicts);
  return log;
}

export interface ApplyResult {
  changedFields: string[];
  record: ITORRecord;
}

/**
 * Apply an admin's corrections. `verify` (default true) marks the record
 * verified even with no changes — "checked, it was right".
 */
export async function applyChanges(
  id: string | Types.ObjectId,
  changes: ReviewChanges,
  admin: { id: string },
  options: { note?: string | null; verify?: boolean; dryRun?: boolean } = {},
): Promise<ApplyResult | null> {
  const doc = (await TORRecord.findById(id)) as TorDoc | null;
  if (!doc) return null;

  const log = setChanges(doc, changes);
  const changedFields = [...new Set(log.map(([path]) => path))];

  // Derived from what was just corrected.
  const plain = doc.toObject() as ITORRecord;
  doc.set("redFlags", analyzeRedFlags(plain.parsedData, { phase: plain.phase, budget: plain.budget }));
  if (options.verify !== false) {
    doc.set("extraction.needsReview", false);
    doc.set("review", {
      status: "verified",
      reviewedBy: admin.id,
      reviewedAt: new Date(),
      note: options.note ?? null,
      editedFields: [...new Set([...(plain.review?.status === "verified" ? plain.review.editedFields : []), ...changedFields])],
    });
  }
  doc.set("dataChecks", computeDataChecks(doc.toObject() as never));

  if (options.dryRun) {
    await doc.validate(); // same checks as save, nothing written
    return { changedFields, record: doc.toObject() as ITORRecord };
  }
  await doc.save(); // schema validators (enums, required) run here

  if (log.length) {
    await UserCorrection.insertMany(
      log.map(([fieldPath, originalValue, correctedValue]) => ({
        userId: admin.id,
        torRecordId: doc._id,
        fieldPath,
        // usercorrections requires both values; an empty field is stored as such.
        originalValue: originalValue ?? "(ว่าง)",
        correctedValue: correctedValue ?? "(ว่าง)",
        status: "accepted",
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      })),
    );
  }
  return { changedFields, record: doc.toObject() as ITORRecord };
}
