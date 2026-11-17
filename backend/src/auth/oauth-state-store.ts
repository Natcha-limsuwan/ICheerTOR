import crypto from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env.js";

/**
 * OAuth 2.0 `state` + PKCE store backed by a short-lived HttpOnly cookie.
 *
 * passport-oauth2's built-in stores need express-session; this API is
 * otherwise stateless, so the per-transaction values live in a cookie that
 * only the backend's /api/auth/google paths can see:
 *
 *  - `state` binds the Google callback to the browser that started the login,
 *    so an attacker cannot make a victim's browser accept the attacker's
 *    authorization code (login CSRF, threat T04, ASVS V10.1.2 / V10.2.1).
 *  - The PKCE `code_verifier` never leaves the backend except in this
 *    HttpOnly cookie, so an intercepted authorization code is useless.
 *
 * The cookie is single use: it is cleared as soon as the callback is checked.
 * SameSite=Lax is required because Google's redirect back is a top-level
 * cross-site GET navigation.
 */

const COOKIE_NAME = "icheertor_oauth_tx";
const COOKIE_PATH = "/api/auth/google";
const COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: COOKIE_PATH,
});

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

type StoreCallback = (err: Error | null, handle?: string) => void;
type VerifyCallback = (err: Error | null, ok: string | false, info?: unknown) => void;

export class CookieStateStore {
  // passport-oauth2 picks the PKCE signature by arity: store() must declare 5 parameters.
  store(req: Request, verifier: string, _state: unknown, _meta: unknown, callback: StoreCallback): void {
    if (!req.res) return callback(new Error("OAuth state store requires an Express response"));
    const handle = crypto.randomBytes(24).toString("base64url");
    req.res.cookie(COOKIE_NAME, `${handle}.${verifier}`, {
      ...cookieOptions(),
      maxAge: COOKIE_MAX_AGE_MS,
    });
    callback(null, handle);
  }

  verify(req: Request, providedState: string, callback: VerifyCallback): void {
    const raw = readCookie(req, COOKIE_NAME);
    req.res?.clearCookie(COOKIE_NAME, cookieOptions());

    if (!raw) return callback(null, false, { message: "Missing OAuth transaction state" });

    const dot = raw.indexOf(".");
    const handle = dot > 0 ? raw.slice(0, dot) : "";
    const verifier = dot > 0 ? raw.slice(dot + 1) : "";
    if (!handle || !verifier || typeof providedState !== "string" || !safeEqual(handle, providedState)) {
      return callback(null, false, { message: "Invalid OAuth transaction state" });
    }

    // For PKCE stores, the "ok" value passed back is the code_verifier.
    callback(null, verifier);
  }
}
