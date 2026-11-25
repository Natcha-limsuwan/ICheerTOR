import mongoose, { Schema, Document, Model, Types } from "mongoose";

/* ─── Interface ─────────────────────────────────────────────────────── */

export interface IUser extends Document {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: "user" | "admin" | "developer";
  status: "pending" | "active" | "suspended" | "banned";
  isVerified: boolean;
  notificationPrefs: {
    inApp: boolean;
    email: boolean;
  };
  locale: "th" | "en";
  /**
   * Which guided tours this user has finished or dismissed.
   *
   * Stored per user rather than in the browser so the tour does not
   * reappear on a second device, and does not vanish when site data is
   * cleared. Keyed by tour id so a later tour can be added without
   * re-showing the first one.
   */
  onboarding: {
    /** Tour ids the user completed or dismissed, e.g. "welcome-v1". */
    completedTours: string[];
    /** When the user last finished or dismissed any tour. */
    lastCompletedAt?: Date;
  };
  roleAssignedBy?: Types.ObjectId;
  roleAssignedAt?: Date;
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
      enum: ["user", "admin", "developer"],
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
      email: { type: Boolean, default: true },
    },
    locale: { type: String, enum: ["th", "en"], default: "th" },
    onboarding: {
      completedTours: { type: [String], default: [] },
      lastCompletedAt: { type: Date },
    },
    roleAssignedBy: { type: Schema.Types.ObjectId, ref: "User" },
    roleAssignedAt: { type: Date },
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
