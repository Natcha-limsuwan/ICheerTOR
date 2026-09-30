/**
 * Read one project's e-GP documents and turn them into a TORRecord update.
 *
 *   archive ─┬─ TOR (usually a scan) ──────────────┐
 *            ├─ doc_ bidding document (text) ─ slice ─┤→ Gemini (prompt v4) → validate ┐
 *            │                                  └─ facts ────────────────────────────┤→ record update
 *            └─ annoudoc_ announcement (text) ──── facts ─────────────────────────────┘
 *
 * The model reads scope, qualifications, criteria, prices, conflicts and
 * risk evidence. Code reads what the e-GP forms state exactly (submission
 * date, contract duration — archive-facts.ts), checks the model's numbers
 * (validate-extraction.ts) and decides red flags (red-flag-analyzer.ts).
 *
 * Nothing here writes to the database or stores a PDF; the caller saves the
 * returned update. prepareDocuments and callModel are also what
 * scripts/eval-prompt.ts runs, so eval scores the production path.
 */

import { createHash } from "crypto";
import type { Part } from "@google/genai";

import { env } from "../../config/env";
import type {
  IExtractionMeta,
  IMedianPrice,
  IParsedData,
  IQualification,
  IRedFlag,
  ISourceDocument,
  ISummary,
} from "../../db/models/tor-record";
import { fetchProjectArchive } from "../ingestion/egp-client";
import { listEntries, readEntry, type ZipEntry } from "../ingestion/zip-reader";
import { pickDocument, type PickedDocument } from "../ingestion/document-picker";
import { extractPdfText } from "../ingestion/pdf-text";
import { sliceBiddingDoc } from "../ingestion/bidding-doc";
import { readArchiveFacts, type ArchiveFacts, type TextDocument } from "../ingestion/archive-facts";
import { aiCircuitBreaker } from "./circuit-breaker";
import { getModelId, getVertexClient } from "./vertex-client";
import { activePrompt, type ExtractionContext, type ExtractionPrompt } from "./prompts";
import type { TorExtractionV4, QualificationV4 } from "./prompts/v4";
import { validateExtraction, type ValidationIssue } from "./validate-extraction";
import { resolvePrices } from "./resolve-prices";
import { analyzeRedFlags } from "./red-flag-analyzer";

/* ─── Preparing the documents ───────────────────────────────────────── */

export interface PreparedDocuments {
  /** PDF sent to the model as an attachment — the TOR. */
  pdf: { entry: ZipEntry; bytes: Buffer } | null;
  /** Sliced text of the bidding document, sent alongside the PDF. */
  biddingDoc: {
    fileName: string;
    text: string;
    chars: number;
    originalChars: number;
    sections: string[];
  } | null;
  /** What the e-GP forms state, read in code. */
  facts: ArchiveFacts;
  /** Every file read, for the record — hashes only, never the bytes. */
  sourceDocuments: ISourceDocument[];
  /** Set when there is nothing to send to the model. */
  skipReason?: string;
}

export interface PrepareOptions {
  /** Force this file as the PDF (eval: the file the labeller read). */
  pdfFileName?: string;
  /** Send the bidding document as text (prompt v3+). Default true. */
  withBiddingDoc?: boolean;
  zipFileName?: string | null;
}

function describe(entry: ZipEntry, bytes: Buffer, kind: string, zipFileName?: string | null): ISourceDocument {
  return {
    fileName: entry.name,
    kind,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
    zipFileName: zipFileName ?? null,
  };
}

export async function prepareDocuments(zip: Buffer, opts: PrepareOptions = {}): Promise<PreparedDocuments> {
  const withBiddingDoc = opts.withBiddingDoc ?? true;
  const entries = listEntries(zip);
  const pick = pickDocument(entries);
  const find = (p: PickedDocument | null) => (p ? entries.find((e) => e.rawName === p.rawName) ?? null : null);

  const sourceDocuments: ISourceDocument[] = [];

  // The TOR as a PDF. Without a bidding document to read instead, fall back to
  // the picker's best guess, as prompt v2 did.
  const pdfEntry = opts.pdfFileName
    ? entries.find((e) => e.name === opts.pdfFileName || e.name.endsWith(`/${opts.pdfFileName}`)) ?? null
    : find(pick.tor) ?? (withBiddingDoc && pick.biddingDoc ? null : find(pick.best));
  let pdf: PreparedDocuments["pdf"] = null;
  if (pdfEntry) {
    const bytes = readEntry(zip, pdfEntry);
    pdf = { entry: pdfEntry, bytes };
    sourceDocuments.push(describe(pdfEntry, bytes, pick.tor?.rawName === pdfEntry.rawName ? "tor" : "other", opts.zipFileName));
  }

  // Text-layer documents: the announcement first, as the official source of
  // the submission date, then the bidding document.
  const textDocs: TextDocument[] = [];
  let biddingDoc: PreparedDocuments["biddingDoc"] = null;
  const announcement = pick.ranked.find((d) => d.kind === "announcement") ?? null;
  for (const [picked, kind] of [[announcement, "announcement"], [pick.biddingDoc, "bidding_doc"]] as const) {
    const entry = find(picked);
    if (!entry) continue;
    const bytes = readEntry(zip, entry);
    const text = await extractPdfText(bytes);
    if (!text.hasTextLayer) continue;
    const full = text.pages.join("\n");
    textDocs.push({ fileName: entry.name, text: full });
    sourceDocuments.push(describe(entry, bytes, kind, opts.zipFileName));
    if (kind === "bidding_doc" && withBiddingDoc) {
      const sliced = sliceBiddingDoc(full);
      biddingDoc = {
        fileName: entry.name,
        text: sliced.text,
        chars: sliced.text.length,
        originalChars: sliced.originalChars,
        sections: sliced.sections,
      };
    }
  }

  return {
    pdf,
    biddingDoc,
    facts: readArchiveFacts(textDocs),
    sourceDocuments,
    skipReason: pdf || biddingDoc ? undefined : pick.skipReason ?? "ไม่มี TOR หรือเอกสารประกวดราคาที่อ่านได้",
  };
}

/* ─── Calling the model ─────────────────────────────────────────────── */

export interface ModelCall<T> {
  output: T;
  model: string;
  durationMs: number;
  usage: { input?: number; output?: number; thoughts?: number; total?: number };
}

const MAX_ATTEMPTS = 3;
/** Quota, server-side and network errors are worth waiting out; others are not. */
// "aborted" is our own timeout (AbortSignal.timeout) firing on a slow reply.
const RETRYABLE =
  /\b(429|500|502|503|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|fetch failed|ECONNRESET|ETIMEDOUT|aborted/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CircuitOpenError extends Error {
  constructor() {
    super("Vertex AI พักการเรียกชั่วคราว (circuit breaker เปิดอยู่)");
  }
}

/** Short code for ExtractionLog, so failures can be counted by cause. */
export function errorCode(e: unknown): string {
  const text = String(e);
  if (e instanceof CircuitOpenError) return "circuit_open";
  if (/429|RESOURCE_EXHAUSTED/.test(text)) return "rate_limited";
  if (/aborted|timeout/i.test(text)) return "timeout";
  if (e instanceof SyntaxError) return "invalid_json";
  if (/fetch failed|ECONNRESET|ETIMEDOUT|WAF/.test(text)) return "network";
  return "error";
}

export async function callModel<T = TorExtractionV4>(
  prompt: ExtractionPrompt,
  prepared: PreparedDocuments,
  ctx: ExtractionContext,
  onRetry?: (attempt: number, waitMs: number, error: unknown) => void,
): Promise<ModelCall<T>> {
  if (!prompt.responseSchema || !prompt.buildUserPrompt) {
    throw new Error(`prompt ${prompt.version} ไม่มี responseSchema/buildUserPrompt`);
  }
  const parts: Part[] = [];
  if (prepared.pdf) {
    parts.push({ inlineData: { mimeType: "application/pdf", data: prepared.pdf.bytes.toString("base64") } });
  }
  parts.push({
    text: prompt.buildUserPrompt({
      ...ctx,
      fileName: prepared.pdf?.entry.name ?? "",
      hasPdf: Boolean(prepared.pdf),
      biddingDocText: prepared.biddingDoc?.text ?? null,
      biddingDocFileName: prepared.biddingDoc?.fileName ?? null,
    }),
  });

  const ai = getVertexClient();
  const model = getModelId();
  for (let attempt = 1; ; attempt++) {
    if (aiCircuitBreaker.isOpen()) throw new CircuitOpenError();
    const t0 = Date.now();
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: prompt.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: prompt.responseSchema,
          ...prompt.generationConfig,
          abortSignal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
        },
      });
      if (!res.text) throw new Error(`Vertex AI ตอบว่างเปล่า (finishReason: ${res.candidates?.[0]?.finishReason})`);
      const output = JSON.parse(res.text) as T;
      aiCircuitBreaker.onSuccess();
      const u = res.usageMetadata;
      return {
        output,
        model,
        durationMs: Date.now() - t0,
        usage: {
          input: u?.promptTokenCount,
          output: u?.candidatesTokenCount,
          thoughts: u?.thoughtsTokenCount,
          total: u?.totalTokenCount,
        },
      };
    } catch (e) {
      const retryable = RETRYABLE.test(String(e)) || (e instanceof Error && e.name === "TimeoutError");
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        aiCircuitBreaker.onFailure();
        throw e;
      }
      // Express mode's quota is per minute; a short back-off rarely clears it.
      const waitMs = attempt * 30_000;
      onRetry?.(attempt, waitMs, e);
      await sleep(waitMs);
    }
  }
}

/* ─── Mapping to the record ─────────────────────────────────────────── */

export interface TorRecordUpdate {
  parsedData: IParsedData;
  summary: ISummary;
  redFlags: IRedFlag[];
  /** End of the submission window; null while the announcement leaves it blank. */
  submissionDeadline: Date | null;
  sourceDocuments: ISourceDocument[];
}

export interface RecordContext {
  phase: "public_hearing" | "bidding" | "awarded" | "cancelled";
  /** egp2 figures — authoritative for medianPrice, the base for ¼-of-budget. */
  budget?: number | null;
  medianPriceFromSource?: number | null;
  /** The reference price decided by resolvePrices; egp2's when omitted. */
  medianPrice?: IMedianPrice;
}

function toQualification(q: QualificationV4): IQualification {
  // The matcher reads text requirements from minimumValue.
  const minimumValue =
    q.type === "tech_stack" && q.normalizedNames.length
      ? q.normalizedNames.join(", ")
      : q.type === "certification" && q.requiredCerts.length
        ? q.requiredCerts.join(", ")
        : (q.minimumNumber ?? undefined);
  return {
    clauseNumber: q.clauseNumber,
    criterion: q.criterion,
    minimumValue,
    unit: typeof minimumValue === "string" ? "text" : (q.unit ?? undefined),
    type: q.type,
    isMandatory: q.isMandatory,
    isBoilerplate: q.isBoilerplate,
    alternativeGroup: q.alternativeGroup,
    requiresGovernment: q.requiresGovernment,
    sameTypeRequired: q.sameTypeRequired,
    requiredCerts: q.requiredCerts,
    normalizedNames: q.normalizedNames,
    source: q.source,
    sourcePage: q.sourcePage ?? undefined,
    confidence: q.confidence,
  };
}

/** Validated v4 output + facts read in code → the fields to $set on TORRecord. */
export function toRecordUpdate(
  out: TorExtractionV4,
  facts: ArchiveFacts,
  sourceDocuments: ISourceDocument[],
  ctx: RecordContext,
): TorRecordUpdate {
  const scope = out.scopeOfWork;
  const aiDuration = scope.contractDurationDays;
  const parsedData: IParsedData = {
    workType: out.workType,
    scopeOfWork: { content: scope.summary, confidence: scope.confidence },
    qualifications: out.qualifications.map(toQualification),
    // egp2 first, corrected from the e-GP announcement when it dropped digits
    // (resolve-prices.ts); the TOR's own figures stay in documentPrices.
    medianPrice: ctx.medianPrice ?? {
      value: ctx.medianPriceFromSource ?? null,
      confidence: ctx.medianPriceFromSource != null ? 1 : 0,
      source: ctx.medianPriceFromSource != null ? "egp2" : null,
    },
    documentPrices: {
      budget: { value: out.budget.value, sourcePage: out.budget.sourcePage, confidence: out.budget.confidence },
      medianPrice: {
        value: out.medianPrice.value,
        sourcePage: out.medianPrice.sourcePage,
        confidence: out.medianPrice.confidence,
      },
    },
    evaluationCriteria: {
      content: out.evaluationCriteria.summary ?? undefined,
      confidence: out.evaluationCriteria.confidence,
      method: out.evaluationCriteria.method,
      weights: out.evaluationCriteria.weights,
    },
    keyDates: {
      submissionDate: facts.submissionDate,
      // Clause 4.3 of the bidding document, read in code, beats the model.
      contractDurationDays: facts.contractDuration
        ? { value: facts.contractDuration.days, confidence: 1, rawText: facts.contractDuration.rawText, source: "bidding_doc" }
        : aiDuration != null
          ? { value: aiDuration, confidence: scope.confidence, rawText: scope.contractDurationText, source: "ai" }
          : { value: null, confidence: 0, rawText: null, source: null },
      warrantyMonths: out.keyDates.warrantyMonths,
    },
    documentConflicts: out.documentConflicts,
    riskClauses: out.riskClauses.map((r) => ({
      clauseText: r.rawText,
      category: r.category,
      reason: r.reason,
      sourcePage: r.sourcePage ?? undefined,
    })),
  };

  return {
    parsedData,
    summary: {
      overview: scope.summary,
      keyPoints: scope.keyPoints,
      deliverables: scope.deliverables,
      confidence: scope.confidence,
    },
    redFlags: analyzeRedFlags(parsedData, { phase: ctx.phase, budget: ctx.budget }),
    submissionDeadline: facts.submissionDate.closesAt,
    sourceDocuments,
  };
}

/* ─── One project, end to end ───────────────────────────────────────── */

export interface ExtractionInput extends RecordContext {
  projectNumber: string;
  title: string;
  agencyName: string;
}

export type ExtractionOutcome =
  | {
      status: "completed";
      update: TorRecordUpdate;
      meta: Pick<IExtractionMeta, "promptVersion" | "modelVersion" | "durationMs" | "inputTokens" | "outputTokens" | "needsReview"> & {
        issues: ValidationIssue[];
      };
      /** The model's reply before validation, for ExtractionLog. */
      rawResponse: string;
      /** The TOR PDF that was sent, for ExtractionLog. */
      pdf: ISourceDocument | null;
    }
  | { status: "skipped"; skipReason: string; sourceDocuments: ISourceDocument[] }
  | { status: "failed"; error: string; errorCode: string; retryable: boolean };

/**
 * @param onProgress  step-by-step messages — a call can take minutes with
 *                    quota back-off, and silence looks like a hang.
 */
export async function extractTor(
  input: ExtractionInput,
  onProgress: (message: string) => void = () => {},
): Promise<ExtractionOutcome> {
  try {
    onProgress("ดาวน์โหลดเอกสารจาก e-GP");
    const archive = await fetchProjectArchive(input.projectNumber);
    if (!archive) return { status: "skipped", skipReason: "e-GP ไม่มีชุดเอกสารของโครงการนี้", sourceDocuments: [] };

    onProgress(`อ่าน ${(archive.zip.length / 1024 / 1024).toFixed(1)} MB`);
    const prepared = await prepareDocuments(archive.zip, { zipFileName: archive.info.fileName });
    if (prepared.skipReason) {
      return { status: "skipped", skipReason: prepared.skipReason, sourceDocuments: prepared.sourceDocuments };
    }

    onProgress(
      `ส่ง Vertex: ${prepared.pdf ? prepared.pdf.entry.name : "ไม่มี PDF"}` +
        `${prepared.biddingDoc ? ` + ${prepared.biddingDoc.fileName}` : ""} (ปกติ 20–95 วินาที)`,
    );
    const call = await callModel<TorExtractionV4>(
      activePrompt,
      prepared,
      {
        title: input.title,
        agencyName: input.agencyName,
        medianPriceFromSource: input.medianPriceFromSource,
        budget: input.budget,
        fileName: prepared.pdf?.entry.name ?? "",
        documentKind: "tor",
      },
      (attempt, waitMs, e) =>
        onProgress(`${errorCode(e)} — รอ ${waitMs / 1000} วินาทีแล้วลองใหม่ (ครั้งที่ ${attempt + 1}/${MAX_ATTEMPTS})`),
    );
    const validated = validateExtraction(call.output, {
      budget: input.budget,
      medianPriceFromSource: input.medianPriceFromSource,
    });
    const prices = resolvePrices({
      egp2Budget: input.budget,
      egp2MedianPrice: input.medianPriceFromSource,
      facts: prepared.facts,
      documentFigures: [validated.output.budget.value, validated.output.medianPrice.value],
    });
    const issues = [...validated.issues, ...prices.issues];

    return {
      status: "completed",
      update: toRecordUpdate(validated.output, prepared.facts, prepared.sourceDocuments, {
        ...input,
        medianPrice: prices.medianPrice,
      }),
      meta: {
        promptVersion: activePrompt.version,
        modelVersion: call.model,
        durationMs: call.durationMs,
        inputTokens: call.usage.input,
        outputTokens: call.usage.output,
        needsReview: issues.some((i) => i.severity === "review"),
        issues,
      },
      rawResponse: JSON.stringify(call.output),
      pdf: prepared.sourceDocuments.find((d) => d.fileName === prepared.pdf?.entry.name) ?? null,
    };
  } catch (e) {
    return {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
      errorCode: errorCode(e),
      retryable: e instanceof CircuitOpenError || RETRYABLE.test(String(e)),
    };
  }
}
