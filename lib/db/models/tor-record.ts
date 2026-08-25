import mongoose, { Schema, Document, Model } from "mongoose";

/* ─── Sub-document interfaces ───────────────────────────────────────── */

export interface IParsedField {
  content?: string;
  confidence: number;
}

export interface IQualification {
  criterion: string;
  minimumValue?: number | string;
  type: "contract_value" | "company_age" | "tech_stack" | "certification" | "other";
  confidence: number;
}

export interface IMedianPrice {
  value: number | null;
  confidence: number;
}

export interface IParsedData {
  scopeOfWork: IParsedField;
  qualifications: IQualification[];
  medianPrice: IMedianPrice;
  evaluationCriteria: IParsedField;
}

export interface IRedFlag {
  clauseText: string;
  reason: string;
  severity: "info" | "warning" | "critical";
  recommendedAction: string;
  ruleId: string;
}

/* ─── Main interface ────────────────────────────────────────────────── */

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
  pdfUrl?: string;
  pdfStoragePath?: string;
  parsedData: IParsedData;
  redFlags: IRedFlag[];
  extractionStatus: "pending" | "processing" | "completed" | "failed";
  extractionError?: string;
  deduplicationHash: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
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
    type: {
      type: String,
      enum: ["contract_value", "company_age", "tech_stack", "certification", "other"],
      default: "other",
    },
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
    },
    redFlags: { type: [RedFlagSchema], default: [] },
    extractionStatus: {
      type: String,
      required: true,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    extractionError: { type: String },
    deduplicationHash: { type: String, required: true, unique: true, index: true },
    tags: { type: [String], default: [], index: true },
  },
  { timestamps: true },
);

// Text index for full-text search
TORRecordSchema.index(
  {
    title: "text",
    "parsedData.scopeOfWork.content": "text",
    agencyName: "text",
    tags: "text",
  },
  { default_language: "none" }, // "none" for Thai text support
);

// Compound index for listing queries
TORRecordSchema.index({ agencyName: 1, postingDate: -1 });

/* ─── Model ─────────────────────────────────────────────────────────── */

const TORRecord: Model<ITORRecord> =
  mongoose.models.TORRecord ||
  mongoose.model<ITORRecord>("TORRecord", TORRecordSchema);

export default TORRecord;
