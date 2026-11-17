import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { env } from "../config/env.js";
import { connectDB } from "../db/connection.js";
import User from "../db/models/user.js";
import { authenticate, getBearerToken, type AuthUser } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rate-limit.js";
import {
  consumeLoginCode,
  createLoginCode,
  revokeSession,
  revokeUserSessions,
  startSession,
  validateSessionToken,
} from "../auth/session-service.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { scopesForRole } from "../auth/permissions.js";
import { validate } from "../middleware/validate.js";
import { exchangeBody } from "../validation/schemas.js";
import { logSecurityEvent } from "../utils/security-log.js";

const router = Router();

const loginRedirect = (error: string) => `${env.FRONTEND_URL}/login?error=${encodeURIComponent(error)}`;

/**
 * GET /api/auth/google — Start Google OAuth.
 * The strategy adds a per-browser `state` and a PKCE code_challenge.
 */
router.get(
  "/google",
  authLimiter,
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

/**
 * GET /api/auth/google/callback — Google OAuth callback.
 *
 * On success, issues a single-use 60-second login code and sends it to the
 * frontend in the URL fragment (never sent to servers or in Referer). The
 * session token itself is only returned by POST /exchange.
 */
router.get("/google/callback", authLimiter, (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    "google",
    { session: false },
    (err: unknown, user: (AuthUser & { avatarUrl?: string }) | false, info?: { message?: string }) => {
      if (err) {
        logSecurityEvent("login_failure", { provider: "google", reason: "provider_error", ip: req.ip }, "warn");
        console.error("[auth] Google OAuth error:", err instanceof Error ? err.message : err);
        res.redirect(loginRedirect("auth_failed"));
        return;
      }

      if (!user) {
        const reason = info?.message ?? "rejected";
        logSecurityEvent("login_failure", { provider: "google", reason, ip: req.ip }, "warn");
        res.redirect(loginRedirect(/suspended|banned/i.test(reason) ? "account_disabled" : "auth_failed"));
        return;
      }

      createLoginCode(user.id)
        .then((code) => {
          res.redirect(`${env.FRONTEND_URL}/callback#code=${code}`);
        })
        .catch(next);
    },
  )(req, res, next);
});

/**
 * POST /api/auth/exchange — Trade a one-time login code for a session token.
 * Body: { code: string }
 */
router.post("/exchange", authLimiter, validate({ body: exchangeBody }), async (req: Request, res: Response) => {
  await connectDB();

  const userId = await consumeLoginCode(req.body?.code);
  if (!userId) {
    logSecurityEvent("login_code_invalid", { ip: req.ip }, "warn");
    Errors.badRequest(res, "Invalid or expired login code");
    return;
  }

  const user = await User.findById(userId).select("email name role status avatarUrl deletedAt").lean();
  if (!user || user.deletedAt || user.status === "suspended" || user.status === "banned") {
    logSecurityEvent("login_failure", { provider: "google", reason: "account_disabled", userId }, "warn");
    Errors.forbidden(res, "Account is suspended or banned");
    return;
  }

  // Re-authentication in the same browser ends the previous session (ASVS V7.2.4).
  const previousToken = getBearerToken(req);
  if (previousToken) {
    const previous = await validateSessionToken(previousToken);
    if (previous.ok) await revokeSession(previous.sid, "reauthenticated");
  }

  const session = await startSession(userId, { ip: req.ip, userAgent: req.get("user-agent") });
  logSecurityEvent("login_success", { provider: "google", userId, role: user.role, ip: req.ip });

  apiSuccess(res, {
    token: session.token,
    expiresAt: session.expiresAt,
    idleTimeoutSeconds: session.idleTimeoutSeconds,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
    },
  });
});

/**
 * GET /api/auth/me — Current user, with role/status read from the database.
 */
router.get("/me", authenticate, (req: Request, res: Response) => {
  // Scopes are informational for the UI; the server re-derives them on every request.
  apiSuccess(res, { ...req.user, scopes: scopesForRole(req.user!.role) });
});

/**
 * POST /api/auth/logout — End the current session on the server.
 */
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  await revokeSession(req.authSessionId!, "logout");
  logSecurityEvent("logout", { userId: req.user!.id });
  apiSuccess(res, { loggedOut: true });
});

/**
 * POST /api/auth/logout-all — End every session of the current user
 * (e.g. after using a shared computer).
 */
router.post("/logout-all", authenticate, async (req: Request, res: Response) => {
  const count = await revokeUserSessions(req.user!.id, "logout_all");
  logSecurityEvent("logout_all", { userId: req.user!.id, count });
  apiSuccess(res, { loggedOut: true, sessionsEnded: count });
});

export default router;
