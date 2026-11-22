import crypto from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env.js";

/* OAuth state and PKCE data live in a signed, short-lived HttpOnly cookie.
 * State binds the callback to the browser that started login; PKCE binds the
 * authorization code to its verifier (T04; ASVS V10.1.2 / V10.2.1).
 * Clear the cookie on callback. SameSite=Lax allows Google's top-level redirect. */

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
    const browserChallenge = req.query.browserChallenge;
    if (typeof browserChallenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(browserChallenge)) {
      return callback(new Error("Missing browser login binding"));
    }
    const handle = crypto.randomBytes(24).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ handle, verifier, browserChallenge, expires: Date.now() + COOKIE_MAX_AGE_MS })).toString("base64url");
    const mac = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
    req.res.cookie(COOKIE_NAME, `${payload}.${mac}`, {
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
    const payload = raw.slice(0, dot);
    const mac = raw.slice(dot + 1);
    const expected = crypto.createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
    if (raw.length > 3000 || dot < 1 || !safeEqual(mac, expected)) {
      return callback(null, false, { message: "Invalid OAuth transaction" });
    }
    let transaction: { handle: string; verifier: string; browserChallenge: string; expires: number };
    try { transaction = JSON.parse(Buffer.from(payload, "base64url").toString()); }
    catch { return callback(null, false, { message: "Invalid OAuth transaction" }); }
    const { handle, verifier, browserChallenge, expires } = transaction;
    if (!Number.isFinite(expires) || expires <= Date.now() || typeof handle !== "string" || typeof verifier !== "string" ||
        typeof browserChallenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(browserChallenge)) {
      return callback(null, false, { message: "Expired OAuth transaction" });
    }
    if (!handle || !verifier || typeof providedState !== "string" || !safeEqual(handle, providedState)) {
      return callback(null, false, { message: "Invalid OAuth transaction state" });
    }

    // For PKCE stores, the "ok" value passed back is the code_verifier.
    if (req.res) req.res.locals.oauthBrowserChallenge = browserChallenge;
    callback(null, verifier);
  }
}
