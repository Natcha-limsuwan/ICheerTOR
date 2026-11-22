import type { Request, Response, NextFunction } from "express";
import { rateLimit, ipKeyGenerator, type Options } from "express-rate-limit";
import { env } from "../config/env.js";
import { logSecurityEvent } from "../utils/security-log.js";
import { MongoRateLimitStore } from "./mongo-rate-limit-store.js";

/* Shared MongoDB fixed-window limits; database errors fail closed (T13; ASVS V2.4.1).
 * Set TRUST_PROXY for the actual proxy setup so req.ip identifies the client
 * correctly (ASVS V15.3.4). Rejected requests receive 429 and retry headers. */

function onLimitReached(name: string) {
  return (req: Request, res: Response, _next: NextFunction, options: Options) => {
    logSecurityEvent(
      "rate_limited",
      { limiter: name, ip: req.ip, userId: req.user?.id, method: req.method, path: req.originalUrl.split("?")[0] },
      "warn",
    );
    res.status(options.statusCode).json({
      error: { code: "RATE_LIMITED", message: "Too many requests, please try again later." },
    });
  };
}

const common = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
};

/* Baseline for every /api request, keyed by client IP. */
export const apiLimiter = rateLimit({
  ...common,
  store: new MongoRateLimitStore("api"),
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_API_MAX,
  handler: onLimitReached("api"),
});

/* Login start, OAuth callback and code exchange: slows automated login attempts. */
export const authLimiter = rateLimit({
  ...common,
  store: new MongoRateLimitStore("auth"),
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: onLimitReached("auth"),
});

/* Expensive or sensitive per-user actions (data export, account deletion,
 * e-GP document lookups). Must be mounted after authenticate() so the key is
 * the user id; falls back to the client IP otherwise. */
export const sensitiveLimiter = rateLimit({
  ...common,
  store: new MongoRateLimitStore("sensitive"),
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? "")),
  handler: onLimitReached("sensitive"),
});
