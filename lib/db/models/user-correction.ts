import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUserCorrection extends Document {
  userId: Types.ObjectId;
  torRecordId: Types.ObjectId;
  fieldPath: string;
  originalValue: unknown;
  correctedValue: unknown;
  status: "pending" | "accepted" | "rejected";
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
}

const UserCorrectionSchema = new Schema<IUserCorrection>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    torRecordId: {
      type: Schema.Types.ObjectId,
      ref: "TORRecord",
      required: true,
      index: true,
    },
    fieldPath: { type: String, required: true },
    originalValue: { type: Schema.Types.Mixed, required: true },
    correctedValue: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

UserCorrectionSchema.index({ torRecordId: 1, fieldPath: 1 });

const UserCorrection: Model<IUserCorrection> =
  mongoose.models.UserCorrection ||
  mongoose.model<IUserCorrection>("UserCorrection", UserCorrectionSchema);

export default UserCorrection;
