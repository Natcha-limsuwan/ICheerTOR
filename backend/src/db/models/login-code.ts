import mongoose, { Schema, Model, Types } from "mongoose";

/* One-time code handed to the frontend after the Google OAuth callback.
 *
 * The frontend exchanges it for a session token with a POST, so the session
 * token never appears in a URL, browser history or access log (threat T01,
 * ASVS V14.2.1). Only the SHA-256 hash is stored; the code is single use
 * (deleted on exchange) and expires after 60 seconds. */
export interface ILoginCode {
  codeHash: string;
  browserChallenge: string;
  userId: Types.ObjectId;
  expiresAt: Date;
}

const LoginCodeSchema = new Schema<ILoginCode>({
  codeHash: { type: String, required: true, unique: true },
  browserChallenge: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB's TTL monitor removes expired codes (runs about once a minute; the
// exchange query also checks expiresAt so a late cleanup is harmless).
LoginCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LoginCode: Model<ILoginCode> =
  mongoose.models.LoginCode || mongoose.model<ILoginCode>("LoginCode", LoginCodeSchema);

export default LoginCode;
