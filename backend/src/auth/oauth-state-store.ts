import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { Metadata, StateStoreStoreCallback, StateStoreVerifyCallback } from "passport-oauth2";

const COOKIE = "icheertor_oauth";
const TTL_MS = 10 * 60_000;
const COOKIE_PATH = "/api/auth/google";
const digest = (value: string) => createHash("sha256").update(value).digest();

/** Single-process, one-use transactions. Restart/other instances fail closed. */
export class OAuthStateStore {
  private transactions = new Map<string, { browser: Buffer; expires: number }>();
  constructor(private secure: boolean, private now: () => number = Date.now) {}

  store(req: Request, meta: Metadata, callback: StateStoreStoreCallback): void;
  store(req: Request, callback: StateStoreStoreCallback): void;
  store(req: Request, metaOrCallback: Metadata | StateStoreStoreCallback, callback?: StateStoreStoreCallback): void {
    const done = typeof metaOrCallback === "function" ? metaOrCallback : callback!;
    for (const [state, value] of this.transactions) if (value.expires <= this.now()) this.transactions.delete(state);
    if (this.transactions.size >= 10_000) return done(new Error("Too many pending login attempts"), null);
    const state = randomBytes(32).toString("base64url");
    const browser = randomBytes(32).toString("base64url");
    if (!req.res) return done(new Error("OAuth response unavailable"), null);
    this.transactions.set(state, { browser: digest(browser), expires: this.now() + TTL_MS });
    req.res.cookie(COOKIE, browser, { httpOnly: true, secure: this.secure, sameSite: "lax", path: COOKIE_PATH, maxAge: TTL_MS });
    done(null, state);
  }

  verify(req: Request, state: string, meta: Metadata, callback: StateStoreVerifyCallback): void;
  verify(req: Request, state: string, callback: StateStoreVerifyCallback): void;
  verify(req: Request, state: string, metaOrCallback: Metadata | StateStoreVerifyCallback, callback?: StateStoreVerifyCallback): void {
    const done = typeof metaOrCallback === "function" ? metaOrCallback : callback!;
    const cookies = (req.headers.cookie ?? "").split(";").map(value => value.trim());
    const browser = cookies.find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? "";
    const transaction = typeof state === "string" ? this.transactions.get(state) : undefined;
    const ok = Boolean(transaction && transaction.expires > this.now() && /^[\w-]{43}$/.test(browser)
      && timingSafeEqual(transaction.browser, digest(browser)));
    if (ok) {
      this.transactions.delete(state);
      req.res?.clearCookie(COOKIE, { httpOnly: true, secure: this.secure, sameSite: "lax", path: COOKIE_PATH });
    }
    done(null, ok, undefined);
  }
}
