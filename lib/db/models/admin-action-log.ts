import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Immutable audit log of administrative actions.
 */
export interface IAdminActionLog extends Document {
  adminUserId: Types.ObjectId;
  targetUserId: Types.ObjectId;
  action: "approve" | "verify" | "suspend" | "ban" | "reinstate" | "delete_profile";
  reason?: string;
  previousStatus: string;
  newStatus: string;
  createdAt: Date;
}

const AdminActionLogSchema = new Schema<IAdminActionLog>(
  {
    adminUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: ["approve", "verify", "suspend", "ban", "reinstate", "delete_profile"],
    },
    reason: { type: String },
    previousStatus: { type: String, required: true },
    newStatus: { type: String, required: true },
  },
  { timestamps: true },
);

AdminActionLogSchema.index({ adminUserId: 1, createdAt: -1 });

const AdminActionLog: Model<IAdminActionLog> =
  mongoose.models.AdminActionLog ||
  mongoose.model<IAdminActionLog>("AdminActionLog", AdminActionLogSchema);

export default AdminActionLog;
