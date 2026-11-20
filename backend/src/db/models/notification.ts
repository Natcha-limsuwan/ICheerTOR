import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface INotification extends Document {
  userId: Types.ObjectId;
  torRecordId?: Types.ObjectId;
  type: "new_match" | "public_hearing" | "deadline" | "award" | "system";
  title: string;
  body: string;
  linkUrl?: string;
  /** Identifies one logical event per user; the unique index makes a repeat or concurrent run a no-op. */
  dedupeKey?: string;
  channels: {
    inApp: { sent: boolean; readAt?: Date };
    email: {
      sent: boolean;
      sentAt?: Date;
      error?: string;
      /** sending = claimed, outcome not yet recorded. Never resent automatically: SMTP may have accepted it. */
      state?: "pending" | "sending" | "sent" | "failed";
      claimedAt?: Date;
      attempts?: number;
    };
  };
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
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
    },
    type: {
      type: String,
      required: true,
      enum: ["new_match", "public_hearing", "deadline", "award", "system"],
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    linkUrl: { type: String },
    dedupeKey: { type: String },
    channels: {
      inApp: {
        sent: { type: Boolean, default: false },
        readAt: { type: Date },
      },
      email: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date },
        error: { type: String },
        state: { type: String, enum: ["pending", "sending", "sent", "failed"] },
        claimedAt: { type: Date },
        attempts: { type: Number },
      },
    },
  },
  { timestamps: true },
);

// Partial: notifications created before dedupeKey existed are not affected.
NotificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, "channels.inApp.readAt": 1 });

const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;
