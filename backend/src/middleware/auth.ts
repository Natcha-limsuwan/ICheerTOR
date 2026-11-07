import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { connectDB } from "../db/connection.js";
import ConsentRecord from "../db/models/consent-record.js";
import User from "../db/models/user.js";
import { Types } from "mongoose";
import { PRIVACY_NOTICE_VERSION } from "../services/pdpa/consent.js";
import type { AuthUser, UserRole } from "../types.js";

// Re-export for convenience
export type { AuthUser, UserRole };

/* ─── JWT Auth Middleware ──────────────────────────────────────────── */

/**
 * Verify JWT token from Authorization header.
 * Uses the signed subject to load current account status and permissions.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  const token = authHeader.slice(7);
  let payload: AuthUser;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    if (!payload || !Types.ObjectId.isValid(payload.id)) throw new Error("Invalid subject");
  } catch {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
    return;
  }
  try {
    await connectDB();
    const user = await User.findById(payload.id).select("email name role status deletedAt").lean();
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Account no longer exists" } });
      return;
    }
    if (user.deletedAt || user.status === "suspended" || user.status === "banned") {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Account is suspended or banned" },
      });
      return;
    }

    // Claims identify the session; permissions and account status come from DB.
    req.user = { id: payload.id, email: user.email, name: user.name, role: user.role, status: user.status };
    next();
  } catch (error) {
    next(error);
  }
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
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Requires one of: ${roles.join(", ")}`,
        },
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
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    if (!latestConsent?.granted || latestConsent.noticeVersion !== PRIVACY_NOTICE_VERSION) {
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
