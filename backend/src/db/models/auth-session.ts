import mongoose, { Schema, Model, Types } from "mongoose";

/**
 * Server-side record of an authenticated session.
 *
 * The JWT only carries `sub` (user id) and `sid` (this record). Every
 * authenticated request looks the session up, so logout, suspension,
 * deletion, idle timeout and absolute lifetime take effect immediately even
 * though the JWT itself is still correctly signed (threats T02, T03;
 * ASVS V7.3.1, V7.3.2, V7.4.1, V7.4.2).
 */
export interface IAuthSession {
  /** 256-bit random id, also the JWT `jti`. */
  sid: string;
  userId: Types.ObjectId;
  /** When the user signed in with Google for this session (step-up / re-auth checks). */
  authenticatedAt: Date;
  lastActivityAt: Date;
  absoluteExpiresAt: Date;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuthSessionSchema = new Schema<IAuthSession>(
  {
    sid: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authenticatedAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 512 },
  },
  { timestamps: true },
);

// Keep ended sessions for 7 days after their absolute expiry for audit, then let MongoDB drop them.
AuthSessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const AuthSession: Model<IAuthSession> =
  mongoose.models.AuthSession || mongoose.model<IAuthSession>("AuthSession", AuthSessionSchema);

export default AuthSession;
