import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * One run of a background job — pulling projects from egp2 ("ingest") or
 * sending queued TORs to Vertex AI ("extract").
 *
 * Hearing windows last only 3–5 days, so a silently failed daily run means
 * users miss them. This record is what the admin panel reads to show whether
 * the last run happened and how it went.
 */
export interface IIngestJob extends Document {
  type: "ingest" | "extract";
  trigger: "cron" | "manual" | "admin";
  /** Admin who started it, when trigger is "admin". */
  triggeredBy?: Types.ObjectId;
  status: "running" | "completed" | "failed";
  /** Run options, e.g. { year: 2569, limit: 10 } — kept for reproducing a run. */
  params?: Record<string, unknown>;
  counts: {
    fetched: number;
    created: number;
    updated: number;
    completed: number;
    skipped: number;
    failed: number;
  };
  /** Per-item failures, capped so one bad run cannot bloat the document. */
  failures: Array<{ ref?: string; message: string }>;
  startedAt: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MAX_JOB_FAILURES = 50;

const IngestJobSchema = new Schema<IIngestJob>(
  {
    type: { type: String, required: true, enum: ["ingest", "extract"], index: true },
    trigger: { type: String, required: true, enum: ["cron", "manual", "admin"] },
    triggeredBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      required: true,
      enum: ["running", "completed", "failed"],
      default: "running",
      index: true,
    },
    params: { type: Schema.Types.Mixed },
    counts: {
      fetched: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    failures: {
      type: [
        new Schema(
          { ref: { type: String }, message: { type: String, required: true } },
          { _id: false },
        ),
      ],
      default: [],
    },
    startedAt: { type: Date, required: true, default: () => new Date() },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

// "Latest run of each type" for the admin dashboard.
IngestJobSchema.index({ type: 1, startedAt: -1 });

const IngestJob: Model<IIngestJob> =
  mongoose.models.IngestJob || mongoose.model<IIngestJob>("IngestJob", IngestJobSchema);

export default IngestJob;
