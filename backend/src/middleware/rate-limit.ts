import type { Request, Response, NextFunction } from "express";
import { rateLimit, ipKeyGenerator, type Options } from "express-rate-limit";
import { env } from "../config/env.js";
import { logSecurityEvent } from "../utils/security-log.js";

/**
 * Rate limits (threat T16; ASVS V2.4.1).
 *
 * Counters use the default in-memory store, so they are per backend
 * instance. That is correct for the current single-container deployment;
 * running several replicas would need a shared store (e.g. Redis) to keep
 * limits consistent. Clients get 429 with RateLimit-* and Retry-After headers.
 *
 * Behind a reverse proxy, set TRUST_PROXY so req.ip is the real client IP
 * rather than the proxy's (ASVS V15.3.4).
 */

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

/** Baseline for every /api request, keyed by client IP. */
export const apiLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  // Configurable only so a local DAST run (ZAP) is not throttled; production keeps the default.
  limit: env.RATE_LIMIT_API_MAX,
  handler: onLimitReached("api"),
});

/** Login start, OAuth callback and code exchange: slows automated login attempts. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: onLimitReached("auth"),
});

/**
 * Expensive or sensitive per-user actions (data export, account deletion,
 * e-GP document lookups). Must be mounted after authenticate() so the key is
 * the user id; falls back to the client IP otherwise.
 */
export const sensitiveLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip ?? "")),
  handler: onLimitReached("sensitive"),
});
