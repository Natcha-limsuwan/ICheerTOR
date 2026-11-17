/**
 * Security regression tests (project document §6 "Security test process").
 *
 *   cd backend && npm run test:security
 *
 * Starts the real Express app against a throwaway in-memory MongoDB and
 * attacks it over HTTP. Google OAuth itself cannot run offline, so a login is
 * simulated by issuing a one-time login code exactly like the OAuth callback
 * does, then exchanging it through the real /api/auth/exchange endpoint.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

let pass = 0;
let fail = 0;
let section = "";
const failures: string[] = [];
function group(name: string) {
  section = name;
  console.log(`\n── ${name}`);
}
function check(name: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${section} › ${name}${extra ? ` (${extra})` : ""}`);
  }
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${extra && !ok ? `  — ${extra}` : ""}`);
}

const SECRET = "test-secret-".padEnd(48, "x");
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, {
  MONGODB_URI: mongo.getUri("icheertor_test"),
  JWT_SECRET: SECRET,
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  FRONTEND_URL: "http://localhost:3000",
  SESSION_IDLE_TIMEOUT_MINUTES: "30",
  SESSION_MAX_HOURS: "8",
  CRON_SECRET: "",
  NODE_ENV: "test",
});

// Silence the app's own JSON security log lines so the test output stays readable.
const realInfo = console.info;
const realWarn = console.warn;
console.info = (...a: unknown[]) => (String(a[0]).startsWith('{"ts"') ? undefined : realInfo(...a));
console.warn = (...a: unknown[]) => (String(a[0]).startsWith('{"ts"') ? undefined : realWarn(...a));

const { default: app } = await import("../src/app.js");
const { connectDB } = await import("../src/db/connection.js");
const { default: User } = await import("../src/db/models/user.js");
const { default: AuthSession } = await import("../src/db/models/auth-session.js");
const { default: TORRecord } = await import("../src/db/models/tor-record.js");
const { default: Bookmark } = await import("../src/db/models/bookmark.js");
const { default: Notification } = await import("../src/db/models/notification.js");
const { default: VendorProfile } = await import("../src/db/models/vendor-profile.js");
const { createLoginCode, startSession } = await import("../src/auth/session-service.js");
const { CookieStateStore } = await import("../src/auth/oauth-state-store.js");
const { escapeHtml, safeAppUrl } = await import("../src/services/notification/email-sender.js");
const { canManageAccount, hasScope } = await import("../src/auth/permissions.js");
await connectDB();

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
type CallInit = RequestInit & { token?: string; json?: unknown };
const call = (path: string, init: CallInit = {}) =>
  fetch(base + path, {
    redirect: "manual",
    ...init,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    headers: {
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
const json = async (r: Response) => r.json().catch(() => ({}));

/**
 * Simulated sign-in. Most tests start the session through the service so they
 * do not use up the login rate limit; the HTTP exchange flow itself is tested
 * explicitly in section 3.
 */
async function login(userId: string): Promise<string> {
  return (await startSession(userId, { ip: "127.0.0.1", userAgent: "security-test" })).token;
}
const sidOf = (token: string) => (jwt.decode(token) as { sid: string }).sid;

const mkUser = (name: string, role: "user" | "admin" | "developer") =>
  User.create({ googleId: `g-${name}`, email: `${name}@example.com`, name, role, status: "active", notificationPrefs: { inApp: true, email: false } });

const alice = await mkUser("alice", "user");
const bob = await mkUser("bob", "user");
const adam = await mkUser("adam", "admin");
const anna = await mkUser("anna", "admin");
const dev = await mkUser("dev", "developer");
const torId = (await TORRecord.collection.insertOne({ title: "ระบบทดสอบ", agencyName: "สำนักทดสอบ (กทม.)", phase: "bidding", extractionStatus: "completed", tags: [], createdAt: new Date() })).insertedId;

/* ═══ 1. Security headers, CORS, errors (T22, T25) ═════════════════ */
group("Headers, CORS and error handling");
const h = await call("/health");
check("CSP frame-ancestors 'none'", (h.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
check("HSTS max-age=1y includeSubDomains", h.headers.get("strict-transport-security") === "max-age=31536000; includeSubDomains");
check("X-Content-Type-Options nosniff", h.headers.get("x-content-type-options") === "nosniff");
check("Referrer-Policy no-referrer", h.headers.get("referrer-policy") === "no-referrer");
check("X-Powered-By removed", h.headers.get("x-powered-by") === null);
check("Cache-Control no-store on API", h.headers.get("cache-control") === "no-store");
const evil = await call("/health", { headers: { Origin: "https://evil.example" } });
check("CORS allows only FRONTEND_URL", evil.headers.get("access-control-allow-origin") === "http://localhost:3000");
const nf = await call("/does-not-exist");
check("unknown route → JSON 404", nf.status === 404 && (await json(nf)).error?.code === "NOT_FOUND");
const bad = await call("/auth/exchange", { method: "POST", body: "{bad", headers: { "Content-Type": "application/json" } });
check("malformed JSON → generic 400 (no parser message)", bad.status === 400 && (await json(bad)).error?.message === "Malformed request");
const big = await call("/auth/exchange", { method: "POST", json: { code: "a".repeat(200_000) } });
check("body > 100kb → 413", big.status === 413);

/* ═══ 2. OAuth state + PKCE (T04) ══════════════════════════════════ */
group("OAuth login CSRF protection");
const start = await call("/auth/google");
const loc = new URL(start.headers.get("location") ?? "http://x");
const setCookie = start.headers.get("set-cookie") ?? "";
check("authorization request carries state", !!loc.searchParams.get("state"));
check("authorization request uses PKCE S256", loc.searchParams.get("code_challenge_method") === "S256");
check("state cookie is HttpOnly, SameSite=Lax, path-scoped", /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie) && /Path=\/api\/auth\/google/i.test(setCookie));
const noCookie = await call("/auth/google/callback?code=x&state=forged");
check("callback without state cookie rejected", (noCookie.headers.get("location") ?? "").endsWith("/login?error=auth_failed"));
const wrongState = await call("/auth/google/callback?code=x&state=wrong", { headers: { Cookie: setCookie.split(";")[0] } });
check("callback with someone else's state rejected", (wrongState.headers.get("location") ?? "").endsWith("/login?error=auth_failed"));
await new Promise<void>((resolve) => {
  const store = new CookieStateStore();
  let cookie = "";
  const res = { cookie: (n: string, v: string) => (cookie = `${n}=${encodeURIComponent(v)}`), clearCookie: () => undefined };
  store.store({ res } as never, "VERIFIER", undefined, {}, (_e, handle) => {
    store.verify({ res, headers: { cookie } } as never, handle!, (_e2, ok) => {
      check("matching state returns the PKCE verifier", ok === "VERIFIER");
      resolve();
    });
  });
});

/* ═══ 3. Token handling (T01, T03) ═════════════════════════════════ */
group("Login code exchange and JWT validation");
const code = await createLoginCode(alice._id.toString());
const ex = await call("/auth/exchange", { method: "POST", json: { code } });
const tokA: string = (await json(ex)).data?.token;
check("one-time code → session token", ex.status === 200 && !!tokA);
check("login code cannot be reused", (await call("/auth/exchange", { method: "POST", json: { code } })).status === 400);
check("operator object as code rejected", (await call("/auth/exchange", { method: "POST", json: { code: { $ne: null } } })).status === 400);
const dec = jwt.decode(tokA, { complete: true }) as { header: { alg: string }; payload: Record<string, unknown> };
check("JWT carries no role/status/email", dec.payload.role === undefined && dec.payload.status === undefined && dec.payload.email === undefined);
check("JWT is HS256 with iss + aud", dec.header.alg === "HS256" && dec.payload.iss === "icheertor-api" && dec.payload.aud === "icheertor-web");
check("JWT absolute lifetime 8h", Number(dec.payload.exp) - Number(dec.payload.iat) === 8 * 3600);
const sid = dec.payload.sid as string;
const sub = dec.payload.sub as string;
const forge = (key: string, opts: jwt.SignOptions) => jwt.sign({ sid }, key, { subject: sub, issuer: "icheertor-api", audience: "icheertor-web", ...opts });
check("alg=none rejected", (await call("/auth/me", { token: jwt.sign({ sid }, "", { algorithm: "none", subject: sub, issuer: "icheertor-api", audience: "icheertor-web" }) })).status === 401);
check("wrong signing key rejected", (await call("/auth/me", { token: forge("y".repeat(48), {}) })).status === 401);
check("wrong audience rejected", (await call("/auth/me", { token: forge(SECRET, { audience: "other" }) })).status === 401);
check("future nbf rejected", (await call("/auth/me", { token: forge(SECRET, { notBefore: 3600 }) })).status === 401);
check("expired token rejected", (await call("/auth/me", { token: forge(SECRET, { expiresIn: -10 }) })).status === 401);
check("session cannot be moved to another user (sub swap)", (await call("/auth/me", { token: jwt.sign({ sid }, SECRET, { subject: bob._id.toString(), issuer: "icheertor-api", audience: "icheertor-web" }) })).status === 401);

/* ═══ 4. Session lifecycle (T02) ═══════════════════════════════════ */
group("Logout, idle timeout, absolute lifetime");
check("logout succeeds", (await call("/auth/logout", { method: "POST", token: tokA })).status === 200);
check("token unusable after logout", (await call("/auth/me", { token: tokA })).status === 401);
const t2 = await login(alice._id.toString());
await AuthSession.updateOne({ sid: sidOf(t2) }, { $set: { lastActivityAt: new Date(Date.now() - 31 * 60_000) } });
const idle = await call("/auth/me", { token: t2 });
check("idle > 30 min → 401 SESSION_EXPIRED", idle.status === 401 && (await json(idle)).error?.code === "SESSION_EXPIRED");
const t3 = await login(alice._id.toString());
await AuthSession.updateOne({ sid: sidOf(t3) }, { $set: { lastActivityAt: new Date(Date.now() - 5 * 60_000) } });
await call("/auth/me", { token: t3 });
const s3 = await AuthSession.findOne({ sid: sidOf(t3) }).lean();
check("activity extends the idle window", Date.now() - (s3?.lastActivityAt.getTime() ?? 0) < 5000);
await AuthSession.updateOne({ sid: sidOf(t3) }, { $set: { absoluteExpiresAt: new Date(Date.now() - 1000) } });
check("absolute lifetime ends an active session", (await call("/auth/me", { token: t3 })).status === 401);
const t4a = await login(alice._id.toString());
const t4b = await login(alice._id.toString());
await call("/auth/logout-all", { method: "POST", token: t4a });
check("logout-all ends other sessions", (await call("/auth/me", { token: t4b })).status === 401);

/* ═══ 5. Authorization: roles + scopes (T08) ═══════════════════════ */
group("Function-level authorization (roles, scopes, hierarchy)");
const tokAlice = await login(alice._id.toString());
const tokBob = await login(bob._id.toString());
const tokAdam = await login(adam._id.toString());
const tokDev = await login(dev._id.toString());
check("user → admin API 403", (await call("/admin/users", { token: tokAlice })).status === 403);
check("admin → admin API 200", (await call("/admin/users", { token: tokAdam })).status === 200);
const me = await json(await call("/auth/me", { token: tokAdam }));
check("/me lists server-derived scopes", Array.isArray(me.data?.scopes) && me.data.scopes.includes("users:manage") && !me.data.scopes.includes("roles:manage"));
check("admin cannot change roles (README policy)", (await call(`/admin/users/${alice._id}/role`, { method: "PATCH", token: tokAdam, json: { role: "admin" } })).status === 403);
check("admin cannot suspend another admin", (await call(`/admin/users/${anna._id}`, { method: "PATCH", token: tokAdam, json: { action: "suspend" } })).status === 403);
check("admin cannot act on own account", (await call(`/admin/users/${adam._id}`, { method: "PATCH", token: tokAdam, json: { action: "suspend" } })).status === 403);
check("admin cannot suspend a developer", (await call(`/admin/users/${dev._id}`, { method: "PATCH", token: tokAdam, json: { action: "ban" } })).status === 403);
check("developer can change a role", (await call(`/admin/users/${bob._id}/role`, { method: "PATCH", token: tokDev, json: { role: "admin" } })).status === 200);
check("promotion applies on the next request", (await call("/admin/users", { token: tokBob })).status === 200);
await call(`/admin/users/${bob._id}/role`, { method: "PATCH", token: tokDev, json: { role: "user" } });
check("demotion applies on the next request", (await call("/admin/users", { token: tokBob })).status === 403);
const adminList = await json(await call("/admin/users", { token: tokAdam }));
check("admin user list hides googleId", adminList.data?.every((u: Record<string, unknown>) => u.googleId === undefined));
await AuthSession.updateOne({ sid: sidOf(tokDev) }, { $set: { authenticatedAt: new Date(Date.now() - 2 * 3600_000) } });
const stale = await call(`/admin/users/${bob._id}/role`, { method: "PATCH", token: tokDev, json: { role: "admin" } });
check("role change needs a recent sign-in", stale.status === 403 && (await json(stale)).error?.code === "REAUTH_REQUIRED");
check("scope matrix: user lacks tor:review", !hasScope("user", "tor:review") && hasScope("admin", "tor:review"));
check("hierarchy: developer manages admin", canManageAccount({ id: "a", role: "developer" }, { id: "b", role: "admin" }));

/* ═══ 6. Object-level access control / IDOR (T07) ══════════════════ */
group("Access to another user's data (IDOR)");
const bm = await json(await call("/bookmarks", { method: "POST", token: tokAlice, json: { torRecordId: torId.toString() } }));
const aliceBookmarkId = bm.data?._id;
check("alice creates a bookmark", !!aliceBookmarkId);
check("bob cannot delete alice's bookmark", (await call(`/bookmarks/${aliceBookmarkId}`, { method: "DELETE", token: tokBob })).status === 404);
check("bob's list does not include alice's bookmark", ((await json(await call("/bookmarks", { token: tokBob }))).data ?? []).length === 0);
check("alice's bookmark still exists", !!(await Bookmark.findById(aliceBookmarkId)));
const note = await Notification.create({ userId: alice._id, type: "system", title: "t", body: "b" });
check("bob cannot mark alice's notification read", (await call(`/notifications/${note._id}/read`, { method: "PATCH", token: tokBob })).status === 404);
check("bob does not see alice's notifications", ((await json(await call("/notifications", { token: tokBob }))).data ?? []).length === 0);
await VendorProfile.create({ userId: alice._id, companyName: "Alice Co", companyAge: 3 });
check("bob cannot read alice's profile", (await call("/profile", { token: tokBob })).status === 404);
const bobExport = await json(await call("/pdpa/export", { token: tokBob }));
check("export contains only the caller's data", bobExport.user?.email === "bob@example.com" && bobExport.vendorProfile === null && bobExport.bookmarks?.length === 0);
const dup = await call("/bookmarks", { method: "POST", token: tokAlice, json: { torRecordId: torId.toString() } });
check("duplicate bookmark returns existing one (no duplicate)", dup.status === 200 && (await Bookmark.countDocuments({ userId: alice._id })) === 1);

/* ═══ 7. Input validation, injection, mass assignment (T09, T10, T15) */
group("Input validation and injection");
check("NoSQL operator in body field rejected", (await call("/bookmarks", { method: "POST", token: tokAlice, json: { torRecordId: { $ne: null } } })).status === 400);
check("unknown body field rejected (strict schema)", (await call("/bookmarks", { method: "POST", token: tokAlice, json: { torRecordId: torId.toString(), userId: bob._id.toString() } })).status === 400);
check("malformed ObjectId → 400 not 500", (await call("/tor/not-an-id", { token: tokAlice })).status === 400);
check("repeated query key (array) rejected", (await call("/tor?phase=bidding&phase=awarded", { token: tokAlice })).status === 400);
check("limit=0 (would mean 'no limit') rejected", (await call("/bookmarks?limit=0", { token: tokAlice })).status === 400);
check("invalid enum rejected", (await call("/tor?sortBy=$where", { token: tokAlice })).status === 400);
const redos = await call(`/tor?agency=${encodeURIComponent("(a+)+$")}`, { token: tokAlice });
check("regex syntax in agency treated literally", redos.status === 200 && (await json(redos)).data?.length === 0);
const dot = await json(await call(`/admin/users?q=${encodeURIComponent(".*")}`, { token: tokAdam }));
check("admin search '.*' is literal (no match-all)", dot.meta?.total === 0);
const proto = await call(`/tor/${torId}/corrections`, { method: "POST", token: tokAlice, json: { fieldPath: "__proto__.polluted", correctedValue: "x" } });
check("prototype path in correction rejected", proto.status === 400);
check("correction with object value rejected", (await call(`/tor/${torId}/corrections`, { method: "POST", token: tokAlice, json: { fieldPath: "title", correctedValue: { $gt: "" } } })).status === 400);
const prefs = await call("/notifications", { method: "PUT", token: tokAlice, json: { email: true, role: "admin" } });
check("notification prefs: extra field rejected", prefs.status === 400);
await call("/notifications", { method: "PUT", token: tokAlice, json: { email: true } });
const aliceNow = await User.findById(alice._id).lean();
check("notification prefs write only notificationPrefs", aliceNow?.role === "user" && aliceNow?.notificationPrefs?.email === true);
const prof = await call("/profile", { method: "PUT", token: tokAlice, json: { companyName: "Alice Co 2", userId: bob._id.toString(), maxContractValue: 999999999 } });
const profDoc = await VendorProfile.findOne({ userId: alice._id }).lean();
check("profile update strips userId / maxContractValue", prof.status === 200 && profDoc?.companyName === "Alice Co 2" && profDoc?.maxContractValue === 0);
check("bob still has no profile after alice's attempt", !(await VendorProfile.exists({ userId: bob._id })));
check("negative money rejected", (await call("/profile", { method: "PUT", token: tokAlice, json: { registeredCapital: -1 } })).status === 400);
check("consent with invalid purpose rejected", (await call("/pdpa/consent", { method: "POST", token: tokAlice, json: { purpose: "x; drop", granted: true } })).status === 400);
const consent = await json(await call("/pdpa/consent", { method: "POST", token: tokAlice, json: { purpose: "data_processing", granted: true }, headers: { "X-Forwarded-For": "6.6.6.6" } }));
check("consent IP not taken from spoofable X-Forwarded-For", consent.data?.ipAddress !== "6.6.6.6");
check("consent status readable (ObjectId match)", ((await json(await call("/pdpa/consent", { token: tokAlice }))).data ?? []).length === 1);

/* ═══ 8. Output encoding (T11) ═════════════════════════════════════ */
group("Email output encoding");
check("HTML special characters escaped", escapeHtml(`<img src=x onerror="alert(1)">&'`) === "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;");
check("internal link kept", safeAppUrl("/procurement/abc") === "http://localhost:3000/procurement/abc");
check("javascript: link replaced", safeAppUrl("javascript:alert(1)") === "http://localhost:3000/");
check("protocol-relative link replaced", safeAppUrl("//evil.example/x") === "http://localhost:3000/");

/* ═══ 9. Account status and deletion (T02, T24) ════════════════════ */
group("Suspension and account deletion");
const tokBob2 = await login(bob._id.toString());
check("admin suspends a user", (await call(`/admin/users/${bob._id}`, { method: "PATCH", token: tokAdam, json: { action: "suspend", reason: "test" } })).status === 200);
check("suspended user's existing token rejected", (await call("/auth/me", { token: tokBob2 })).status === 401);
check("all sessions revoked on suspension", (await AuthSession.countDocuments({ userId: bob._id, revokedAt: null })) === 0);
check("suspended user cannot sign in", (await call("/auth/exchange", { method: "POST", json: { code: await createLoginCode(bob._id.toString()) } })).status === 403);
const tokAlice2 = await login(alice._id.toString());
await AuthSession.updateOne({ sid: sidOf(tokAlice2) }, { $set: { authenticatedAt: new Date(Date.now() - 3600_000) } });
const lateDelete = await call("/pdpa/delete", { method: "POST", token: tokAlice2, json: { confirmEmail: "alice@example.com" } });
check("deletion with an old session needs re-auth", lateDelete.status === 403 && (await json(lateDelete)).error?.code === "REAUTH_REQUIRED");
const tokAlice3 = await login(alice._id.toString());
check("deletion with wrong confirmation rejected", (await call("/pdpa/delete", { method: "POST", token: tokAlice3, json: { confirmEmail: "bob@example.com" } })).status === 400);
check("deletion with fresh sign-in succeeds", (await call("/pdpa/delete", { method: "POST", token: tokAlice3, json: { confirmEmail: "alice@example.com" } })).status === 200);
check("deleted account's token rejected", (await call("/auth/me", { token: tokAlice3 })).status === 401);
check("personal data removed (profile, bookmarks, notifications)", !(await VendorProfile.exists({ userId: alice._id })) && (await Bookmark.countDocuments({ userId: alice._id })) === 0 && (await Notification.countDocuments({ userId: alice._id })) === 0);
check("account anonymised", (await User.findById(alice._id).lean())?.email === `deleted-${alice._id}@icheertor.local`);

/* ═══ 10. Abuse controls (T16) ═════════════════════════════════════ */
group("Rate limiting and secrets");
check("cron endpoint disabled without CRON_SECRET", (await call("/cron/scrape", { method: "POST", headers: { "x-cron-secret": "" } })).status === 401);
let limited: Response | null = null;
for (let i = 0; i < 30 && !limited; i++) {
  const r = await call("/auth/exchange", { method: "POST", json: { code: "z".repeat(43) } });
  if (r.status === 429) limited = r;
}
check("login endpoints rate limited → 429", !!limited);
check("429 has Retry-After", !!limited?.headers.get("retry-after"));
check("429 body code RATE_LIMITED", limited ? (await json(limited)).error?.code === "RATE_LIMITED" : false);

/* ═══ Done ═════════════════════════════════════════════════════════ */
server.close();
await mongoose.disconnect();
await mongo.stop();
console.info = realInfo;
console.warn = realWarn;
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log(`Failed:\n - ${failures.join("\n - ")}`);
process.exit(fail ? 1 : 0);
