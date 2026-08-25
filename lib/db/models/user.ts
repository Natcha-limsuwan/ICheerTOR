import mongoose, { Schema, Document, Model } from "mongoose";

/* ─── Interface ─────────────────────────────────────────────────────── */

export interface IUser extends Document {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: "user" | "admin";
  status: "pending" | "active" | "suspended" | "banned";
  isVerified: boolean;
  notificationPrefs: {
    inApp: boolean;
    email: boolean;
    line: boolean;
    lineUserId?: string;
  };
  locale: "th" | "en";
  lastLoginAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/* ─── Schema ────────────────────────────────────────────────────────── */

const UserSchema = new Schema<IUser>(
  {
    googleId: { type: String, required: true, unique: true, index: true },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: "Invalid email format",
      },
    },
    name: { type: String, required: true },
    avatarUrl: { type: String },
    role: {
      type: String,
      required: true,
      enum: ["user", "admin"],
      default: "user",
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "active", "suspended", "banned"],
      default: "active",
      index: true,
    },
    isVerified: { type: Boolean, default: false },
    notificationPrefs: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      line: { type: Boolean, default: false },
      lineUserId: { type: String },
    },
    locale: { type: String, enum: ["th", "en"], default: "th" },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

UserSchema.index({ role: 1 });

/* ─── Model ─────────────────────────────────────────────────────────── */

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
