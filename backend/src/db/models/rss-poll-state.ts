import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * One document per RSS announcement type (B0, D0): what the last poll saw.
 *
 * The feed only shows the newest 20 items, so the previous window is all that
 * is needed to tell new items from old — and to notice a gap: if none of this
 * poll's 20 were in the last poll's 20, items may have scrolled past unseen
 * and the interval is too long.
 */
export interface IRssPollState extends Document {
  announceType: string;
  /** Project numbers of the last successful poll, newest first. */
  lastWindow: string[];
  lastPolledAt?: Date;
  lastSuccessAt?: Date;
  lastCountByDay?: number | null;
  lastError?: string | null;
  /** Running counters since the state was created. */
  stats: {
    polls: number;
    failures: number;
    seen: number;
    kept: number;
    uncertain: number;
    gaps: number;
  };
}

const RssPollStateSchema = new Schema<IRssPollState>(
  {
    announceType: { type: String, required: true, unique: true },
    lastWindow: { type: [String], default: [] },
    lastPolledAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastCountByDay: { type: Number, default: null },
    lastError: { type: String, default: null },
    stats: {
      polls: { type: Number, default: 0 },
      failures: { type: Number, default: 0 },
      seen: { type: Number, default: 0 },
      kept: { type: Number, default: 0 },
      uncertain: { type: Number, default: 0 },
      gaps: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

const RssPollState: Model<IRssPollState> =
  mongoose.models.RssPollState || mongoose.model<IRssPollState>("RssPollState", RssPollStateSchema);

export default RssPollState;
