import mongoose, { Schema, Document, Model } from "mongoose";

/* ─── Sub-document interfaces ───────────────────────────────────────── */

export interface IParsedField {
  content?: string;
  confidence: number;
}

export type QualificationType =
  | "contract_value"
  | "company_age"
  | "registered_capital"
  | "personnel"
  | "tech_stack"
  | "certification"
  | "other";

export interface IQualification {
  criterion: string;
  /** Number for thresholds (THB, years, head-count); text for stacks/certs. */
  minimumValue?: number | string;
  unit?: "THB" | "years" | "persons" | "text";
  type: QualificationType;
  /** False for "preferred" criteria that add score but do not disqualify. */
  isMandatory?: boolean;
  /** 1-based page in the source PDF, so users can check the original. */
  sourcePage?: number;
  confidence: number;
}

export interface IMedianPrice {
  value: number | null;
  confidence: number;
}

export interface IDatedField {
  value: Date | null;
  /** The sentence the date was read from, for manual checking. */
  rawText?: string;
  confidence: number;
}

export interface INumberField {
  value: number | null;
  confidence: number;
}

export interface IKeyDates {
  /** Bid submission deadline as read from the PDF. Promoted to the top-level
   *  submissionDeadline only when confidence is high enough. */
  submissionDeadline: IDatedField;
  contractDurationDays: INumberField;
  warrantyMonths: INumberField;
}

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

export interface IRiskClause {
  clauseText: string;
  category: "brand_lock" | "tight_timeline" | "high_qualification" | "unusual_penalty" | "other";
  reason: string;
  sourcePage?: number;
}

export interface IParsedData {
  scopeOfWork: IParsedField;
  qualifications: IQualification[];
  /** Reference price. Seeded from egp2 with confidence 1 at ingest; the AI
   *  value only fills it when the source had none. */
  medianPrice: IMedianPrice;
  evaluationCriteria: IParsedField;
  keyDates?: IKeyDates;
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
}

/**
 * Which file the extraction read. The PDF itself is never stored — only
 * enough to tell whether e-GP has since published a different one.
 */
export interface ISourceDocument {
  fileName: string;
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
  sourceDocument?: ISourceDocument;
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
    criterion: { type: String, required: true },
    minimumValue: { type: Schema.Types.Mixed },
    unit: { type: String, enum: ["THB", "years", "persons", "text"] },
    type: {
      type: String,
      enum: [
        "contract_value",
        "company_age",
        "registered_capital",
        "personnel",
        "tech_stack",
        "certification",
        "other",
      ],
      default: "other",
    },
    isMandatory: { type: Boolean, default: true },
    sourcePage: { type: Number, min: 1 },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false },
);

const MedianPriceSchema = new Schema(
  {
    value: { type: Number, default: null },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
  },
  { _id: false },
);

const DatedFieldSchema = new Schema(
  {
    value: { type: Date, default: null },
    rawText: { type: String },
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

const KeyDatesSchema = new Schema(
  {
    submissionDeadline: { type: DatedFieldSchema, default: () => ({}) },
    contractDurationDays: { type: NumberFieldSchema, default: () => ({}) },
    warrantyMonths: { type: NumberFieldSchema, default: () => ({}) },
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
    category: {
      type: String,
      enum: ["brand_lock", "tight_timeline", "high_qualification", "unusual_penalty", "other"],
      default: "other",
    },
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
      scopeOfWork: { type: ParsedFieldSchema, default: () => ({}) },
      qualifications: { type: [QualificationSchema], default: [] },
      medianPrice: { type: MedianPriceSchema, default: () => ({}) },
      evaluationCriteria: { type: ParsedFieldSchema, default: () => ({}) },
      keyDates: { type: KeyDatesSchema, default: undefined },
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
    sourceDocument: { type: SourceDocumentSchema, default: undefined },
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
