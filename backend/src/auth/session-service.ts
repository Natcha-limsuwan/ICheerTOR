import crypto from "node:crypto";
import jwt, { JwtPayload, TokenExpiredError } from "jsonwebtoken";
import { Types } from "mongoose";
import { env } from "../config/env.js";
import AuthSession, { IAuthSession } from "../db/models/auth-session.js";
import LoginCode from "../db/models/login-code.js";
import { logSecurityEvent } from "../utils/security-log.js";

/* ─── Token profile ─────────────────────────────────────────────────── */

/** Only this algorithm is accepted (ASVS V9.1.2); "none" and RS/HS confusion are rejected. */
const JWT_ALGORITHM = "HS256" as const;
const JWT_ISSUER = "icheertor-api";
const JWT_AUDIENCE = "icheertor-web";

const LOGIN_CODE_TTL_MS = 60 * 1000;
/** Avoid a DB write on every request: refresh lastActivityAt at most once a minute. */
const ACTIVITY_WRITE_INTERVAL_MS = 60 * 1000;

const idleTimeoutMs = () => env.SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
const maxLifetimeMs = () => env.SESSION_MAX_HOURS * 60 * 60 * 1000;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("base64url"); // 256 bits, CSPRNG

/* ─── One-time login codes ──────────────────────────────────────────── */

export async function createLoginCode(userId: string): Promise<string> {
  const code = randomToken();
  await LoginCode.create({
    codeHash: sha256(code),
    userId: new Types.ObjectId(userId),
    expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
  });
  return code;
}

/** Atomically consume a login code. Returns the user id, or null if unknown/used/expired. */
export async function consumeLoginCode(code: unknown): Promise<string | null> {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  const doc = await LoginCode.findOneAndDelete({
    codeHash: sha256(code),
    expiresAt: { $gt: new Date() },
  }).lean();
  return doc ? doc.userId.toString() : null;
}

/* ─── Sessions ──────────────────────────────────────────────────────── */

export interface IssuedSession {
  token: string;
  expiresAt: string;
  idleTimeoutSeconds: number;
}

export async function startSession(
  userId: string,
  meta: { ip?: string; userAgent?: string },
): Promise<IssuedSession> {
  const sid = randomToken();
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + maxLifetimeMs());

  await AuthSession.create({
    sid,
    userId: new Types.ObjectId(userId),
    authenticatedAt: now,
    lastActivityAt: now,
    absoluteExpiresAt,
    ip: meta.ip?.slice(0, 64),
    userAgent: meta.userAgent?.slice(0, 512),
  });

  const token = jwt.sign({ sid }, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    subject: userId,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: sid,
    expiresIn: Math.floor(maxLifetimeMs() / 1000),
  });

  return {
    token,
    expiresAt: absoluteExpiresAt.toISOString(),
    idleTimeoutSeconds: Math.floor(idleTimeoutMs() / 1000),
  };
}

export type SessionRejection =
  | "invalid_token"
  | "token_expired"
  | "session_not_found"
  | "session_revoked"
  | "session_expired"
  | "idle_timeout";

export type SessionCheck =
  | { ok: true; userId: string; sid: string; session: IAuthSession }
  | { ok: false; reason: SessionRejection; sid?: string; userId?: string };

/**
 * Verify a bearer token and the server-side session behind it.
 *
 * Checks, in order: signature + algorithm + issuer + audience + exp/nbf,
 * session existence and ownership, revocation, absolute lifetime and
 * inactivity timeout. Valid activity slides lastActivityAt forward, but
 * never past absoluteExpiresAt.
 */
export async function validateSessionToken(token: string): Promise<SessionCheck> {
  let payload: JwtPayload;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (typeof decoded === "string") return { ok: false, reason: "invalid_token" };
    payload = decoded;
  } catch (err) {
    return { ok: false, reason: err instanceof TokenExpiredError ? "token_expired" : "invalid_token" };
  }

  const sid = payload.sid;
  const userId = payload.sub;
  if (typeof sid !== "string" || typeof userId !== "string") {
    return { ok: false, reason: "invalid_token" };
  }

  const session = await AuthSession.findOne({ sid }).lean<IAuthSession>();
  if (!session || session.userId.toString() !== userId) {
    return { ok: false, reason: "session_not_found", sid, userId };
  }
  if (session.revokedAt) return { ok: false, reason: "session_revoked", sid, userId };

  const now = Date.now();
  if (session.absoluteExpiresAt.getTime() <= now) {
    return { ok: false, reason: "session_expired", sid, userId };
  }
  if (now - session.lastActivityAt.getTime() > idleTimeoutMs()) {
    await revokeSession(sid, "idle_timeout");
    return { ok: false, reason: "idle_timeout", sid, userId };
  }

  if (now - session.lastActivityAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
    await AuthSession.updateOne({ sid, revokedAt: null }, { $set: { lastActivityAt: new Date(now) } });
  }

  return { ok: true, userId, sid, session };
}

export async function revokeSession(sid: string, reason: string): Promise<void> {
  await AuthSession.updateOne(
    { sid, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

/** End every active session of a user (logout-all, suspension, ban, deletion). */
export async function revokeUserSessions(userId: string, reason: string): Promise<number> {
  const result = await AuthSession.updateMany(
    { userId: new Types.ObjectId(userId), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
  if (result.modifiedCount > 0) {
    logSecurityEvent("sessions_revoked", { userId, reason, count: result.modifiedCount });
  }
  return result.modifiedCount;
}
