import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Append-only consent record for PDPA compliance.
 * Revocation creates a new record with `granted: false`.
 * Latest record per purpose determines current consent state.
 */
export interface IConsentRecord extends Document {
  userId: Types.ObjectId;
  purpose: string;
  granted: boolean;
  scope: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const ConsentRecordSchema = new Schema<IConsentRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    purpose: { type: String, required: true },
    granted: { type: Boolean, required: true },
    scope: { type: String, required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

ConsentRecordSchema.index({ userId: 1, purpose: 1, createdAt: -1 });

const ConsentRecord: Model<IConsentRecord> =
  mongoose.models.ConsentRecord ||
  mongoose.model<IConsentRecord>("ConsentRecord", ConsentRecordSchema);

export default ConsentRecord;
