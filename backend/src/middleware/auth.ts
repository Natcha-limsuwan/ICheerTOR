import { Request, Response, NextFunction } from "express";
import { connectDB } from "../db/connection.js";
import ConsentRecord from "../db/models/consent-record.js";
import User from "../db/models/user.js";
import { revokeSession, revokeUserSessions, validateSessionToken } from "../auth/session-service.js";
import { logSecurityEvent } from "../utils/security-log.js";
import { hasScope, type Scope } from "../auth/permissions.js";
import type { AuthUser, UserRole } from "../types.js";

// Re-export for convenience
export type { AuthUser, UserRole };

/* ─── Session Auth Middleware ──────────────────────────────────────── */

/** Extract a bearer token from the Authorization header, if any. */
export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 && token.length <= 2048 ? token : null;
}

/**
 * Authenticate the request (complete mediation).
 *
 * 1. Verify the JWT (signature, HS256 only, issuer, audience, exp/nbf).
 * 2. Check the server-side session: not revoked, within its absolute
 *    lifetime and not idle for longer than the inactivity timeout.
 * 3. Load the user's *current* role and status from MongoDB. Role and status
 *    are never trusted from the token, so suspension, bans and role changes
 *    apply on the very next request (threats T02, T08; ASVS V8.3.1).
 *
 * Populates req.user and req.authSessionId.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  await connectDB();
  const check = await validateSessionToken(token);

  if (!check.ok) {
    logSecurityEvent(
      "session_rejected",
      { reason: check.reason, userId: check.userId, method: req.method, path: req.originalUrl.split("?")[0], ip: req.ip },
      "warn",
    );
    const expired = check.reason === "idle_timeout" || check.reason === "session_expired" || check.reason === "token_expired";
    res.status(401).json({
      error: expired
        ? { code: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again." }
        : { code: "UNAUTHORIZED", message: "Invalid or revoked session" },
    });
    return;
  }

  const user = await User.findById(check.userId)
    .select("email name role status avatarUrl deletedAt")
    .lean();

  if (!user || user.deletedAt) {
    await revokeSession(check.sid, "account_deleted");
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or revoked session" } });
    return;
  }

  if (user.status === "suspended" || user.status === "banned") {
    await revokeUserSessions(check.userId, `account_${user.status}`);
    logSecurityEvent("account_disabled_access", { userId: check.userId, status: user.status, ip: req.ip }, "warn");
    res.status(403).json({
      error: { code: "ACCOUNT_DISABLED", message: "Account is suspended or banned" },
    });
    return;
  }

  req.user = {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
  };
  req.authSessionId = check.sid;
  req.authenticatedAt = check.session.authenticatedAt;
  next();
}

/**
 * Step-up check for sensitive actions (threats T19, T24; ASVS V7.5.3):
 * the session must come from a Google sign-in within the last `maxAgeMinutes`.
 * Returns 403 REAUTH_REQUIRED (not 401) so the client keeps the session and
 * can ask the user to sign in again.
 */
export function requireRecentAuth(maxAgeMinutes = 15) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const at = req.authenticatedAt?.getTime() ?? 0;
    if (Date.now() - at <= maxAgeMinutes * 60 * 1000) {
      next();
      return;
    }
    logSecurityEvent(
      "authz_denied",
      { userId: req.user?.id, reason: "reauth_required", method: req.method, path: req.originalUrl.split("?")[0] },
      "warn",
    );
    res.status(403).json({
      error: {
        code: "REAUTH_REQUIRED",
        message: "Please sign out and sign in again to confirm this action.",
      },
    });
  };
}

/**
 * Require one of the given roles.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logSecurityEvent(
        "authz_denied",
        { userId: req.user.id, role: req.user.role, required: roles, method: req.method, path: req.originalUrl.split("?")[0] },
        "warn",
      );
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
      return;
    }

    next();
  };
}

/**
 * Require every listed scope (see auth/permissions.ts). Scopes come from the
 * user's current role loaded by authenticate(), never from the client.
 */
export function requireScope(...required: Scope[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const missing = required.filter((scope) => !hasScope(req.user!.role, scope));
    if (missing.length > 0) {
      logSecurityEvent(
        "authz_denied",
        { userId: req.user.id, role: req.user.role, missingScopes: missing, method: req.method, path: req.originalUrl.split("?")[0] },
        "warn",
      );
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
      return;
    }

    next();
  };
}

/** Shorthand: require admin or developer. */
export const requireAdmin = requireRole("admin", "developer");

/** Shorthand: require developer only. */
export const requireDeveloper = requireRole("developer");

/* ─── PDPA consent check ────────────────────────────────────────────── */

/**
 * Verify that the user has active consent for data processing.
 */
export function requireConsent(purpose: string = "data_processing") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    await connectDB();

    const latestConsent = await ConsentRecord.findOne({
      userId: req.user.id,
      purpose,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!latestConsent || !latestConsent.granted) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Consent required for data processing. Please accept the privacy notice.",
        },
      });
      return;
    }

    next();
  };
}
