import { Router, Request, Response } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/auth/google — Initiate Google OAuth flow.
 */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

/**
 * GET /api/auth/google/callback — Google OAuth callback.
 * On success, issues a JWT and redirects to frontend.
 */
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${env.FRONTEND_URL}/login?error=auth_failed`,
  }),
  (req: Request, res: Response) => {
    const user = req.user as AuthUser & { avatarUrl?: string };
    if (!user) {
      res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
      return;
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRY as string & jwt.SignOptions["expiresIn"] },
    );

    // Redirect to frontend with token
    res.redirect(`${env.FRONTEND_URL}/callback?token=${token}`);
  },
);

/**
 * GET /api/auth/me — Get current user info from JWT.
 */
router.get("/me", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    res.json({ data: payload });
  } catch {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
});

export default router;
