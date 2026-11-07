/** Local OAuth boundaries only. Never exchanges a code or contacts Google/DB. */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { Express } from "express";
import { env } from "../../src/config/env.js";
import passport from "passport";
import jwt from "jsonwebtoken";

let server: Server;
let origin: string;
before(async () => {
  env.GOOGLE_CLIENT_ID = "qa-client.apps.googleusercontent.com";
  env.GOOGLE_CLIENT_SECRET = "synthetic-qa-secret";
  env.GOOGLE_CALLBACK_URL = "http://127.0.0.1:3101/api/auth/google/callback";
  env.FRONTEND_URL = "http://127.0.0.1:3100";
  env.JWT_SECRET = "synthetic-qa-secret";
  env.MONGODB_URI = "";
  const { default: app } = await import("../../src/app.js") as unknown as { default: Express };
  server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("OAUTH-01: authorization redirect has Google host, configured callback and minimal scopes", async () => {
  const response = await fetch(`${origin}/api/auth/google`, { redirect: "manual" });
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get("location")!);
  assert.equal(target.origin, "https://accounts.google.com");
  assert.equal(target.searchParams.get("client_id"), env.GOOGLE_CLIENT_ID);
  assert.equal(target.searchParams.get("redirect_uri"), env.GOOGLE_CALLBACK_URL);
  assert.equal(target.searchParams.get("response_type"), "code");
  assert.deepEqual(target.searchParams.get("scope")?.split(" ").sort(), ["email", "profile"]);
  assert.equal(target.searchParams.has("client_secret"), false);
  assert.match(target.searchParams.get("state")!, /^[\w-]{43}$/);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
});

test("OAUTH-02: user denying provider access returns to login without JWT", async () => {
  const response = await fetch(`${origin}/api/auth/google/callback?error=access_denied`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `${env.FRONTEND_URL}/login?error=auth_failed`);
});

test("OAUTH-03: anonymous session cannot read /me", async () => {
  const response = await fetch(`${origin}/api/auth/me`);
  assert.equal(response.status, 401);
});

test("OAUTH-04: malformed JWT is rejected before database access", async () => {
  const response = await fetch(`${origin}/api/auth/me`, { headers: { Authorization: "Bearer malformed" } });
  assert.equal(response.status, 401);
});

test("OAUTH-05: missing/wrong/cross-browser/replayed state never exchanges a code", async () => {
  // Provider exchange/profile are synthetic. Exercise the real Passport state
  // gate and JWT callback without contacting Google or MongoDB.
  const strategy = (passport as any)._strategy("google");
  const originalExchange = strategy._oauth2.getOAuthAccessToken;
  const originalProfile = strategy.userProfile;
  const originalVerify = strategy._verify;
  let exchanges = 0;
  strategy._oauth2.getOAuthAccessToken = (_code: string, _options: unknown, done: Function) => {
    exchanges++; done(null, "synthetic-access", "synthetic-refresh", {});
  };
  strategy.userProfile = (_token: string, done: Function) => done(null, { id: "synthetic" });
  strategy._verify = (_access: string, _refresh: string, _profile: unknown, done: Function) => done(null, {
    id: "507f1f77bcf86cd7994390110", email: "qa@example.invalid", role: "user", status: "active",
  });
  try {
    const start = await fetch(`${origin}/api/auth/google`, { redirect: "manual" });
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cookie = start.headers.get("set-cookie")!.split(";")[0];
    const otherStart = await fetch(`${origin}/api/auth/google`, { redirect: "manual" });
    const otherCookie = otherStart.headers.get("set-cookie")!.split(";")[0];
    for (const [givenState, givenCookie] of [["", cookie], ["wrong", cookie], [state, ""], [state, otherCookie]]) {
      const response = await fetch(`${origin}/api/auth/google/callback?code=synthetic&state=${givenState}`, {
        headers: { Cookie: givenCookie }, redirect: "manual",
      });
      assert.equal(response.headers.get("location"), `${env.FRONTEND_URL}/login?error=auth_failed`);
    }
    assert.equal(exchanges, 0);
    const valid = await fetch(`${origin}/api/auth/google/callback?code=synthetic&state=${state}`, {
      headers: { Cookie: cookie }, redirect: "manual",
    });
    assert.equal(valid.status, 302);
    const target = new URL(valid.headers.get("location")!);
    assert.equal(target.pathname, "/callback");
    const payload = jwt.verify(target.searchParams.get("token")!, env.JWT_SECRET) as jwt.JwtPayload;
    assert.equal(payload.id, "507f1f77bcf86cd7994390110");
    assert.equal(exchanges, 1);
    const replay = await fetch(`${origin}/api/auth/google/callback?code=synthetic&state=${state}`, {
      headers: { Cookie: cookie }, redirect: "manual",
    });
    assert.equal(replay.headers.get("location"), `${env.FRONTEND_URL}/login?error=auth_failed`);
    assert.equal(exchanges, 1);
  } finally {
    strategy._oauth2.getOAuthAccessToken = originalExchange;
    strategy.userProfile = originalProfile;
    strategy._verify = originalVerify;
  }
});
