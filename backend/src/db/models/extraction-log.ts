import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * One call to Vertex AI for one TOR — successful or not.
 *
 * TORRecord keeps only the latest result; this keeps every attempt, which is
 * what is needed to compare prompt versions, track token spend and debug a
 * bad extraction after the fact.
 *
 * PDPA: rawResponse is the model's verbatim output and can quote names of
 * officials or committee members from the PDF. It is kept for debugging
 * only and expires with the whole log entry after LOG_TTL_DAYS.
 */
export interface IExtractionLog extends Document {
  torRecordId: Types.ObjectId;
  jobId?: Types.ObjectId;
  promptVersion: string;
  modelVersion: string;
  success: boolean;
  error?: string;
  /** e.g. "timeout", "rate_limited", "invalid_json", "schema_mismatch". */
  errorCode?: string;
  durationMs: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  pdfSha256?: string;
  pdfSizeBytes?: number;
  rawResponse?: string;
  createdAt: Date;
}

export const LOG_TTL_DAYS = 90;

const ExtractionLogSchema = new Schema<IExtractionLog>(
  {
    torRecordId: {
      type: Schema.Types.ObjectId,
      ref: "TORRecord",
      required: true,
      index: true,
    },
    jobId: { type: Schema.Types.ObjectId, ref: "IngestJob", index: true },
    promptVersion: { type: String, required: true },
    modelVersion: { type: String, required: true },
    success: { type: Boolean, required: true, index: true },
    error: { type: String },
    errorCode: { type: String },
    durationMs: { type: Number, required: true },
    usage: {
      inputTokens: { type: Number },
      outputTokens: { type: Number },
      totalTokens: { type: Number },
    },
    pdfSha256: { type: String },
    pdfSizeBytes: { type: Number },
    rawResponse: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ExtractionLogSchema.index({ torRecordId: 1, createdAt: -1 });
ExtractionLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOG_TTL_DAYS * 24 * 60 * 60 });

const ExtractionLog: Model<IExtractionLog> =
  mongoose.models.ExtractionLog ||
  mongoose.model<IExtractionLog>("ExtractionLog", ExtractionLogSchema);

export default ExtractionLog;
