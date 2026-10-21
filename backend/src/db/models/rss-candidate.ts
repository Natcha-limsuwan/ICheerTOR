import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * A project seen in the e-GP RSS feed whose title passed the software filter
 * with confidence. Only those are kept — the feed carries ~600 announcements
 * a day nationwide and nearly all are not software.
 *
 * The queue between the RSS poller and TORRecord: "new" until rss-ingest
 * has read its documents and created (or found) the record.
 */
export const RSS_CANDIDATE_STATUSES = ["new", "ingested", "skipped", "failed"] as const;
export type RssCandidateStatus = (typeof RSS_CANDIDATE_STATUSES)[number];

export interface IRssCandidate extends Document {
  projectNumber: string;
  /** RSS type it was first seen under: B0 (public hearing draft) or D0 (invitation). */
  announceType: string;
  title: string;
  method?: string;
  announceLabel?: string;
  /** ISO date from the feed. */
  pubDate?: string | null;
  firstSeenAt: Date;
  filterScore: number;
  filterReason: string;
  status: RssCandidateStatus;
  attempts: number;
  /** Why it was skipped, or the last error. */
  note?: string;
  torRecordId?: Types.ObjectId;
}

const RssCandidateSchema = new Schema<IRssCandidate>(
  {
    projectNumber: { type: String, required: true, unique: true },
    announceType: { type: String, required: true },
    title: { type: String, required: true },
    method: { type: String },
    announceLabel: { type: String },
    pubDate: { type: String, default: null },
    firstSeenAt: { type: Date, required: true, default: () => new Date() },
    filterScore: { type: Number, required: true },
    filterReason: { type: String, required: true },
    status: { type: String, enum: [...RSS_CANDIDATE_STATUSES], default: "new", index: true },
    attempts: { type: Number, default: 0 },
    note: { type: String },
    torRecordId: { type: Schema.Types.ObjectId, ref: "TORRecord" },
  },
  { timestamps: true },
);

const RssCandidate: Model<IRssCandidate> =
  mongoose.models.RssCandidate || mongoose.model<IRssCandidate>("RssCandidate", RssCandidateSchema);

export default RssCandidate;
