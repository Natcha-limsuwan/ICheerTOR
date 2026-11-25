import { Router, Request, Response } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { authenticate, type AuthUser } from "../middleware/auth.js";
import User from "../db/models/user.js";

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

/**
 * GET /api/auth/onboarding — which tours this user has already seen.
 *
 * Separate from /me because that route only decodes the JWT, which is
 * issued at login and so cannot know about a tour finished afterwards.
 * This reads the user document instead.
 */
router.get("/onboarding", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).select("onboarding createdAt").lean();
    if (!user) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "ไม่พบผู้ใช้" } });
      return;
    }
    res.json({
      data: {
        completedTours: user.onboarding?.completedTours ?? [],
        // The client uses this to tell a genuinely new account from one
        // that signed up before the tour existed.
        accountCreatedAt: user.createdAt,
      },
    });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL", message: "ไม่สามารถอ่านสถานะการแนะนำระบบได้" } });
  }
});

/**
 * POST /api/auth/onboarding/complete — record that a tour is done.
 *
 * Body: { tourId: string }
 *
 * $addToSet, so finishing the same tour twice (two tabs, a double
 * click) leaves one entry rather than growing the array.
 */
router.post("/onboarding/complete", authenticate, async (req: Request, res: Response) => {
  const tourId = typeof req.body?.tourId === "string" ? req.body.tourId.trim() : "";
  // Bounded and pattern-checked: this value is stored and later compared
  // against tour ids, so it should not accept arbitrary input.
  if (!tourId || tourId.length > 64 || !/^[a-z0-9-]+$/.test(tourId)) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "tourId ไม่ถูกต้อง" } });
    return;
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.user!.id,
      {
        $addToSet: { "onboarding.completedTours": tourId },
        $set: { "onboarding.lastCompletedAt": new Date() },
      },
      { new: true, select: "onboarding" },
    ).lean();

    if (!user) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "ไม่พบผู้ใช้" } });
      return;
    }
    res.json({ data: { completedTours: user.onboarding?.completedTours ?? [] } });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL", message: "ไม่สามารถบันทึกสถานะการแนะนำระบบได้" } });
  }
});

export default router;
