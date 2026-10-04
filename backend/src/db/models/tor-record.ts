import mongoose, { Schema, Document, Model } from "mongoose";

/* ─── Sub-document interfaces ───────────────────────────────────────── */

export interface IParsedField {
  content?: string;
  confidence: number;
}

export const QUALIFICATION_TYPES = [
  "contract_value",
  "company_age",
  "registered_capital",
  "net_worth",
  "personnel",
  "tech_stack",
  "certification",
  "other",
] as const;
export type QualificationType = (typeof QUALIFICATION_TYPES)[number];

export interface IQualification {
  /** Clause number as printed, e.g. "2.12.1". */
  clauseNumber?: string | null;
  criterion: string;
  /** Number for thresholds (THB, years, head-count); text for stacks/certs. */
  minimumValue?: number | string;
  unit?: "THB" | "years" | "persons" | "text";
  type: QualificationType;
  /** False for "preferred" criteria that add score but do not disqualify. */
  isMandatory?: boolean;
  /** Standard clause found in every BMA TOR (legal capacity, not bankrupt…). */
  isBoilerplate?: boolean;
  /** Items sharing a label are alternatives: meeting any one is enough. */
  alternativeGroup?: string | null;
  /** contract_value only: past work must be for a government body. */
  requiresGovernment?: boolean | null;
  /** contract_value only: past work must be the same kind of work. */
  sameTypeRequired?: boolean | null;
  requiredCerts?: string[];
  /** Canonical technology/standard names, for tech_stack matching. */
  normalizedNames?: string[];
  /** Which document the clause came from. */
  source?: "bidding_doc" | "tor" | "both";
  /** 1-based page in the TOR PDF, so users can check the original. */
  sourcePage?: number;
  confidence: number;
}

export interface IMedianPrice {
  value: number | null;
  confidence: number;
  /** egp2 = the API (primary); announcement = e-GP announcement text, used
   *  when egp2 dropped digits; document = the TOR, read by AI. */
  source?: "egp2" | "announcement" | "document" | null;
}

/**
 * A price as the TOR states it, under the name the TOR uses — shown for
 * comparison only. BMA TORs often call the reference price "วงเงินงบประมาณ",
 * so documentPrices.budget is frequently the ราคากลาง; the real budget is the
 * top-level budget (egp2).
 */
export interface IDocumentPrice {
  value: number | null;
  sourcePage?: number | null;
  confidence: number;
}

export interface INumberField {
  value: number | null;
  confidence: number;
}

export type SubmissionDateStatus = "confirmed" | "pending";

/**
 * e-bidding takes bids on one day inside a time window. Read in code from the
 * e-GP announcement, not by the model. "pending" = the announcement still
 * leaves the date blank (always so during public hearing) — show it as not
 * yet confirmed, and re-read later.
 */
export interface ISubmissionDate {
  /** ISO date, e.g. "2026-03-16". */
  date: string | null;
  /** "09:00", Bangkok time. */
  startTime: string | null;
  endTime: string | null;
  /** End of the window — also copied to the top-level submissionDeadline. */
  closesAt: Date | null;
  status: SubmissionDateStatus;
  rawText?: string | null;
  /** File it was read from. */
  source?: string | null;
}

export interface IContractDuration extends INumberField {
  /** The sentence the figure came from. */
  rawText?: string | null;
  /** "bidding_doc" when read in code from clause 4.3, "ai" otherwise. */
  source?: "bidding_doc" | "ai" | null;
}

export interface IDatePeriod {
  /** ISO dates. */
  from: string;
  to: string;
  rawText?: string | null;
  source?: string | null;
}

export interface IDatedSentence {
  date: string;
  rawText: string;
  source?: string | null;
}

/** All read in code from the e-GP announcement (archive-facts.ts). */
export interface IKeyDates {
  /** "final" = the announced invitation, "draft" = the public-hearing draft,
   *  whose forms leave the bid date blank — show "ยังไม่ประกาศวันยื่น". */
  documentStage?: "final" | "draft" | null;
  /** ISO date of the announcement. */
  announcedDate?: string | null;
  submissionDate: ISubmissionDate;
  /** Paying for the bid documents — after the bid day in BMA announcements;
   *  missing it can disqualify a bid. */
  documentFeePeriod?: IDatePeriod | null;
  /** Every dated sentence in the announcement, named or not. */
  announcementDates?: IDatedSentence[];
  contractDurationDays: IContractDuration;
  warrantyMonths: INumberField;
}

export interface IEvaluationCriteria extends IParsedField {
  method?: "lowest_price" | "price_performance" | "other" | null;
  weights?: Array<{ criterion: string; weight: number }>;
}

/**
 * The TOR and the e-GP bidding document disagree. Shown to users, never
 * resolved: the bidding document itself says BMA rules on conflicts.
 */
export interface IDocumentConflict {
  topic: string;
  torText: string;
  biddingDocText: string;
  torPage?: number | null;
}

export const WORK_TYPES = ["development", "license", "hardware", "maintenance", "service", "other"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export interface ITechRequirement {
  name: string;
  category: "language" | "framework" | "database" | "cloud" | "infra" | "standard" | "other";
  isMandatory: boolean;
}

export interface IPaymentTerm {
  installment: number;
  percent: number | null;
  condition: string;
}

export const RISK_CATEGORIES = [
  "brand_lock",
  "narrow_spec",
  "high_qualification",
  "tight_timeline",
  "unusual_penalty",
  "unusual_payment",
  "other",
] as const;

export interface IRiskClause {
  clauseText: string;
  category: (typeof RISK_CATEGORIES)[number];
  reason: string;
  sourcePage?: number;
}

export interface IParsedData {
  workType?: WorkType;
  scopeOfWork: IParsedField;
  qualifications: IQualification[];
  /** Reference price. Seeded from egp2 with confidence 1 at ingest; the AI
   *  value only fills it when the source had none. */
  medianPrice: IMedianPrice;
  /** Budget and reference price as the TOR states them — may differ from
   *  egp2's, which sometimes labels them the other way round. */
  documentPrices?: { budget: IDocumentPrice; medianPrice: IDocumentPrice };
  evaluationCriteria: IEvaluationCriteria;
  keyDates?: IKeyDates;
  documentConflicts?: IDocumentConflict[];
  techRequirements?: ITechRequirement[];
  paymentTerms?: IPaymentTerm[];
  /** LLM-suggested risky clauses — raw input for the rule-based redFlags,
   *  never shown to users as a verdict on their own. */
  riskClauses?: IRiskClause[];
}

export interface ISummary {
  /** 3–5 sentence Thai overview. */
  overview: string;
  keyPoints: string[];
  deliverables: string[];
  confidence: number;
}

/** Bookkeeping for the AI extraction run that produced parsedData/summary. */
export interface IExtractionMeta {
  promptVersion?: string;
  modelVersion?: string;
  extractedAt?: Date;
  /** Failed attempts since the last success; the queue stops retrying at a cap. */
  attempts: number;
  /** Claim lock — a worker owns the record until this time passes. */
  lockedUntil?: Date;
  /** Some field came back below AI_CONFIDENCE_THRESHOLD. */
  needsReview: boolean;
  durationMs?: number;
  /** Why the record was skipped (no TOR in the archive, etc.). */
  skipReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** What validate-extraction corrected or wants a person to check. */
  issues?: Array<{ severity: "corrected" | "filled" | "review" | "info"; field: string; message: string }>;
}

/**
 * A file the extraction read. The PDF itself is never stored — only enough
 * to tell whether e-GP has since published a different one.
 */
export interface ISourceDocument {
  fileName: string;
  /** "tor", "bidding_doc", "announcement". */
  kind: string;
  sha256: string;
  sizeBytes: number;
  zipFileName?: string | null;
}

export interface IRedFlag {
  clauseText: string;
  reason: string;
  severity: "info" | "warning" | "critical";
  recommendedAction: string;
  ruleId: string;
}

/* ─── Main interface ────────────────────────────────────────────────── */

/**
 * "skipped" = nothing to parse (archive has no TOR, only contracts/bonds).
 * That is a normal outcome for awarded projects, not a failure to retry.
 */
export const EXTRACTION_STATUSES = ["pending", "processing", "completed", "failed", "skipped"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export interface ITORRecord extends Document {
  title: string;
  agencyName: string;
  phase: "public_hearing" | "bidding" | "awarded" | "cancelled";
  medianPrice?: number;
  budget?: number;
  postingDate: Date;
  publicHearingStart?: Date;
  publicHearingEnd?: Date;
  submissionDeadline?: Date;
  awardDate?: Date;
  sourceUrl: string;
  officialPortalUrl?: string;
  /** @deprecated PDFs are resolved on demand via /api/tor/:id/document and
   *  never stored. Kept only for seed data and the current detail page. */
  pdfUrl?: string;
  /** @deprecated See pdfUrl. */
  pdfStoragePath?: string;
  parsedData: IParsedData;
  summary?: ISummary;
  redFlags: IRedFlag[];
  extractionStatus: ExtractionStatus;
  extractionError?: string;
  extraction: IExtractionMeta;
  /** Every file the last extraction read: the TOR, bidding document, announcement. */
  sourceDocuments: ISourceDocument[];
  deduplicationHash: string;
  tags: string[];
  /** Source-system fields kept for traceability and for resolving documents
   *  on demand — notably projectId, which is the key e-GP needs. */
  metadata?: ISourceMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISourceMetadata {
  /** e-GP project id — used to resolve the document archive when requested. */
  projectId?: string;
  projectType?: string;
  purchaseMethod?: string;
  sumPriceAgree?: number;
  /** Company name of the winning bidder, when the project is already awarded. */
  winnerName?: string | null;
  /** Why the software filter kept this record — needed to tune the keywords. */
  filterScore?: number;
  filterReason?: string;
  /** Which system this record came from, so mixed sources stay traceable. */
  source?: "egp2" | "govspending";
  /** egp2's own GUID — needed to call its per-project endpoints. */
  egp2ProjectId?: string;
  /** Announcement stage name, e.g. "ประกาศเชิญชวน". */
  announceType?: string;
  /** Procuring agency group, e.g. "สำนักดิจิทัลกรุงเทพมหานคร". */
  orgGroupName?: string;
  /** Raw status text from egp2, e.g. "ระหว่างดำเนินการ". */
  contractStatus?: string;
  /** Title of the TOR under public hearing, when there is one. */
  torTitle?: string;
  /** Why this record got its phase — auditable, since the phase decides
   *  whether a user is told they can still bid. */
  phaseReason?: string;
}

/* ─── Schema ────────────────────────────────────────────────────────── */

const ParsedFieldSchema = new Schema(
  {
    content: { type: String },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false },
);

const QualificationSchema = new Schema(
  {
    clauseNumber: { type: String, default: null },
    criterion: { type: String, required: true },
    minimumValue: { type: Schema.Types.Mixed },
    unit: { type: String, enum: ["THB", "years", "persons", "text"] },
    type: { type: String, enum: [...QUALIFICATION_TYPES], default: "other" },
    isMandatory: { type: Boolean, default: true },
    isBoilerplate: { type: Boolean, default: false },
    alternativeGroup: { type: String, default: null },
    requiresGovernment: { type: Boolean, default: null },
    sameTypeRequired: { type: Boolean, default: null },
    requiredCerts: { type: [String], default: [] },
    normalizedNames: { type: [String], default: [] },
    source: { type: String, enum: ["bidding_doc", "tor", "both"] },
    sourcePage: { type: Number, min: 1 },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false },
);

const MedianPriceSchema = new Schema(
  {
    value: { type: Number, default: null },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    source: { type: String, enum: ["egp2", "announcement", "document", null], default: null },
  },
  { _id: false },
);

const DocumentPriceSchema = new Schema(
  {
    value: { type: Number, default: null },
    sourcePage: { type: Number, default: null },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false },
);

const NumberFieldSchema = new Schema(
  {
    value: { type: Number, default: null },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false },
);

const SubmissionDateSchema = new Schema(
  {
    date: { type: String, default: null },
    startTime: { type: String, default: null },
    endTime: { type: String, default: null },
    closesAt: { type: Date, default: null },
    status: { type: String, enum: ["confirmed", "pending"], default: "pending" },
    rawText: { type: String, default: null },
    source: { type: String, default: null },
  },
  { _id: false },
);

const ContractDurationSchema = new Schema(
  {
    value: { type: Number, default: null },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    rawText: { type: String, default: null },
    source: { type: String, enum: ["bidding_doc", "ai", null], default: null },
  },
  { _id: false },
);

const DatePeriodSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    rawText: { type: String, default: null },
    source: { type: String, default: null },
  },
  { _id: false },
);

const DatedSentenceSchema = new Schema(
  {
    date: { type: String, required: true },
    rawText: { type: String, required: true },
    source: { type: String, default: null },
  },
  { _id: false },
);

const KeyDatesSchema = new Schema(
  {
    documentStage: { type: String, enum: ["final", "draft", null], default: null },
    announcedDate: { type: String, default: null },
    submissionDate: { type: SubmissionDateSchema, default: () => ({}) },
    documentFeePeriod: { type: DatePeriodSchema, default: null },
    announcementDates: { type: [DatedSentenceSchema], default: [] },
    contractDurationDays: { type: ContractDurationSchema, default: () => ({}) },
    warrantyMonths: { type: NumberFieldSchema, default: () => ({}) },
  },
  { _id: false },
);

const EvaluationCriteriaSchema = new Schema(
  {
    content: { type: String },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    method: { type: String, enum: ["lowest_price", "price_performance", "other", null], default: null },
    weights: {
      type: [new Schema({ criterion: String, weight: Number }, { _id: false })],
      default: [],
    },
  },
  { _id: false },
);

const DocumentConflictSchema = new Schema(
  {
    topic: { type: String, required: true },
    torText: { type: String, required: true },
    biddingDocText: { type: String, required: true },
    torPage: { type: Number, default: null },
  },
  { _id: false },
);

const TechRequirementSchema = new Schema(
  {
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ["language", "framework", "database", "cloud", "infra", "standard", "other"],
      default: "other",
    },
    isMandatory: { type: Boolean, default: true },
  },
  { _id: false },
);

const PaymentTermSchema = new Schema(
  {
    installment: { type: Number, required: true },
    percent: { type: Number, min: 0, max: 100, default: null },
    condition: { type: String, required: true },
  },
  { _id: false },
);

const RiskClauseSchema = new Schema(
  {
    clauseText: { type: String, required: true },
    category: { type: String, enum: [...RISK_CATEGORIES], default: "other" },
    reason: { type: String, required: true },
    sourcePage: { type: Number, min: 1 },
  },
  { _id: false },
);

const SummarySchema = new Schema(
  {
    overview: { type: String, required: true },
    keyPoints: { type: [String], default: [] },
    deliverables: { type: [String], default: [] },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false },
);

const ExtractionMetaSchema = new Schema(
  {
    promptVersion: { type: String },
    modelVersion: { type: String },
    extractedAt: { type: Date },
    attempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date },
    needsReview: { type: Boolean, default: false },
    durationMs: { type: Number },
    skipReason: { type: String },
    inputTokens: { type: Number },
    outputTokens: { type: Number },
    issues: {
      type: [
        new Schema(
          {
            severity: { type: String, enum: ["corrected", "filled", "review", "info"], required: true },
            field: { type: String, required: true },
            message: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const SourceDocumentSchema = new Schema(
  {
    fileName: { type: String, required: true },
    kind: { type: String, required: true },
    sha256: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    zipFileName: { type: String, default: null },
  },
  { _id: false },
);

const RedFlagSchema = new Schema(
  {
    clauseText: { type: String, required: true },
    reason: { type: String, required: true },
    severity: { type: String, enum: ["info", "warning", "critical"], required: true },
    recommendedAction: { type: String, required: true },
    ruleId: { type: String, required: true },
  },
  { _id: false },
);

const SourceMetadataSchema = new Schema(
  {
    projectId: { type: String, index: true },
    projectType: { type: String },
    purchaseMethod: { type: String },
    sumPriceAgree: { type: Number },
    winnerName: { type: String, default: null },
    filterScore: { type: Number },
    filterReason: { type: String },
    source: { type: String, enum: ["egp2", "govspending"] },
    egp2ProjectId: { type: String, index: true },
    announceType: { type: String },
    orgGroupName: { type: String, index: true },
    contractStatus: { type: String },
    torTitle: { type: String },
    phaseReason: { type: String },
  },
  { _id: false },
);

const TORRecordSchema = new Schema<ITORRecord>(
  {
    title: { type: String, required: true },
    agencyName: { type: String, required: true, index: true },
    phase: {
      type: String,
      required: true,
      enum: ["public_hearing", "bidding", "awarded", "cancelled"],
      index: true,
    },
    medianPrice: { type: Number, min: 0 },
    budget: { type: Number, min: 0 },
    postingDate: { type: Date, required: true, index: true },
    publicHearingStart: { type: Date },
    publicHearingEnd: { type: Date },
    submissionDeadline: { type: Date, index: true },
    awardDate: { type: Date },
    sourceUrl: { type: String, required: true },
    officialPortalUrl: { type: String },
    pdfUrl: { type: String },
    pdfStoragePath: { type: String },
    parsedData: {
      workType: { type: String, enum: [...WORK_TYPES] },
      scopeOfWork: { type: ParsedFieldSchema, default: () => ({}) },
      qualifications: { type: [QualificationSchema], default: [] },
      medianPrice: { type: MedianPriceSchema, default: () => ({}) },
      documentPrices: {
        type: new Schema(
          { budget: DocumentPriceSchema, medianPrice: DocumentPriceSchema },
          { _id: false },
        ),
        default: undefined,
      },
      evaluationCriteria: { type: EvaluationCriteriaSchema, default: () => ({}) },
      keyDates: { type: KeyDatesSchema, default: undefined },
      documentConflicts: { type: [DocumentConflictSchema], default: [] },
      techRequirements: { type: [TechRequirementSchema], default: [] },
      paymentTerms: { type: [PaymentTermSchema], default: [] },
      riskClauses: { type: [RiskClauseSchema], default: [] },
    },
    summary: { type: SummarySchema, default: undefined },
    redFlags: { type: [RedFlagSchema], default: [] },
    extractionStatus: {
      type: String,
      required: true,
      enum: [...EXTRACTION_STATUSES],
      default: "pending",
      index: true,
    },
    extractionError: { type: String },
    extraction: { type: ExtractionMetaSchema, default: () => ({}) },
    sourceDocuments: { type: [SourceDocumentSchema], default: [] },
    deduplicationHash: { type: String, required: true, unique: true, index: true },
    tags: { type: [String], default: [], index: true },
    metadata: { type: SourceMetadataSchema, default: undefined },
  },
  { timestamps: true },
);

// Text index for full-text search
TORRecordSchema.index(
  {
    title: "text",
    "summary.overview": "text",
    "parsedData.scopeOfWork.content": "text",
    agencyName: "text",
    tags: "text",
  },
  // A collection allows only one text index, so changing these fields means
  // dropping the old one first — run scripts/sync-indexes.ts after deploying.
  { name: "tor_text_search", default_language: "none" }, // "none" for Thai text support
);

// Compound index for listing queries
TORRecordSchema.index({ agencyName: 1, postingDate: -1 });

// Extraction work queue: the next records to send to Vertex AI — open ones
// with the nearest hearing deadline first.
TORRecordSchema.index({ extractionStatus: 1, phase: 1, publicHearingEnd: 1 });

/* ─── Model ─────────────────────────────────────────────────────────── */

const TORRecord: Model<ITORRecord> =
  mongoose.models.TORRecord ||
  mongoose.model<ITORRecord>("TORRecord", TORRecordSchema);

export default TORRecord;
