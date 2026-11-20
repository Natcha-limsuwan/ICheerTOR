/** Supplementary attacks. Only the MongoDB instance created below is used. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const uri = mongo.getUri("icheertor_security_gaps_disposable");
assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
assert(!/:2701[78][/,]/.test(uri), "Refusing a normal development database port");
Object.assign(process.env, {
  NODE_ENV: "test", MONGODB_URI: uri, JWT_SECRET: crypto.randomBytes(48).toString("hex"),
  GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
  FRONTEND_URL: "http://host.docker.internal:4300", TRUST_PROXY: "0", RATE_LIMIT_API_MAX: "300",
  SMTP_USER: "", SMTP_PASS: "", VERTEX_AI_API_KEY: "", VERTEX_AI_PROJECT_ID: "",
  GOOGLE_APPLICATION_CREDENTIALS: "", ADMIN_EMAILS: "", CRON_SECRET: "",
});
assert.equal(process.env.MONGODB_URI, uri);
const { default: app } = await import("../src/app.js");
const { connectDB } = await import("../src/db/connection.js");
const { default: Counter } = await import("../src/db/models/rate-limit-counter.js");
const { logSecurityEvent } = await import("../src/utils/security-log.js");
const { env: testEnvironment } = await import("../src/config/env.js");
assert.equal(testEnvironment.MONGODB_URI, uri, "Refusing any database except our generated fixture");
await connectDB();
assert.equal(mongoose.connection.name, "icheertor_security_gaps_disposable");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const nativeFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  assert.equal(url.origin, base, "Refusing to send a test request outside the owned fixture");
  return nativeFetch(input, { ...init, redirect: "manual" });
}) as typeof fetch;
let passed = 0;
function check(name: string, ok: boolean) { assert(ok, name); passed++; console.log("PASS " + name); }
try {
  const { internalNavigationPath } = await import("../../frontend/lib/api/internal-navigation.ts");
  const navigationBase = "https://frontend.example.invalid/profile";
  check("internal navigation preserves a relative path", internalNavigationPath("/procurement?page=2", navigationBase) === "/procurement?page=2");
  check("internal navigation normalizes an own-origin URL", internalNavigationPath("https://frontend.example.invalid/bookmarks", navigationBase) === "/bookmarks");
  for (const value of ["javascript:alert(1)", " \tJaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//evil.example.invalid", "https://frontend.example.invalid.evil.example.invalid"]) {
    check("internal router refuses " + value.split(":")[0].trim(), internalNavigationPath(value, navigationBase) === null);
  }
  // Must be the first auth-limited request: express-rate-limit runs each validation once per limiter.
  const limiterErrors: string[] = [];
  const originalLimiterError = console.error;
  try {
    console.error = (...args) => limiterErrors.push(args.map(a => `${String(a)} ${(a as { code?: string })?.code ?? ""}`).join(" "));
    const exchange = await fetch(base + "/api/auth/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "a".repeat(43), browserVerifier: "b".repeat(43) }) });
    check("auth request passes both api and auth limiters", exchange.status === 400);
  } finally { console.error = originalLimiterError; }
  check("api and auth limiters do not trigger ERR_ERL_DOUBLE_COUNT", !limiterErrors.some(line => line.includes("ERR_ERL_DOUBLE_COUNT")));
  const counterIds = (await Counter.find({}).select("_id").lean()).map(c => String(c._id));
  check("api and auth limiters keep separate shared counters", counterIds.some(id => id.startsWith("api:")) && counterIds.some(id => id.startsWith("auth:")));
  for (const method of ["TRACE", "PROPFIND"]) {
    // Fetch forbids TRACE, so use Node's HTTP client for protocol-level tests.
    const { request } = await import("node:http");
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(base + "/api/health", { method }, res => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.end();
    });
    check(method + " rejected with 405", status === 405);
  }
  const logged: string[] = [];
  const originalWarn = console.warn;
  try {
    console.warn = line => logged.push(String(line));
    logSecurityEvent("authz_denied", { userAgent: 'agent\n{"event":"fake_success"}\r\n', path: "/synthetic" }, "warn");
  } finally { console.warn = originalWarn; }
  check("log-injection payload stays one physical JSON line", logged.length === 1 && !/[\r\n]/.test(logged[0]));
  check("log event cannot be forged by control characters", JSON.parse(logged[0]).event === "authz_denied" && JSON.parse(logged[0]).userAgent.includes("\n"));
  const httpLogs: string[] = [];
  try {
    console.warn = line => httpLogs.push(String(line));
    const response = await fetch(base + "/api/auth/me", { headers: { Authorization: "Bearer synthetic-invalid", "User-Agent": 'agent\t{"event":"fake_success"}' } });
    check("HTTP request with injected-looking User-Agent remains unauthorized", response.status === 401);
  } finally { console.warn = originalWarn; }
  check("HTTP User-Agent cannot forge a security log event", httpLogs.length === 1 && !/[\r\n]/.test(httpLogs[0]) && JSON.parse(httpLogs[0]).event === "session_rejected");
  const { connect } = await import("node:net");
  const rawReply = await new Promise<string>((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port: Number(new URL(base).port) });
    let reply = "";
    socket.on("connect", () => socket.write('GET /api/health HTTP/1.1\r\nHost: localhost\r\nUser-Agent: agent\r\n{"event":"fake_success"}\r\nConnection: close\r\n\r\n'));
    socket.on("data", data => reply += data.toString());
    socket.on("end", () => resolve(reply));
    socket.on("error", reject);
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("Raw HTTP fixture timed out")); });
  });
  check("invalid newline-injected HTTP header is rejected by the server", rawReply.startsWith("HTTP/1.1 400"));

  // This collection belongs exclusively to the disposable replica set above.
  await Counter.deleteMany({});
  let accepted = 0;
  for (let i = 0; i < 300; i++) if ((await fetch(base + "/api/health")).status === 200) accepted++;
  check("global API limit accepts the first 300 requests", accepted === 300);
  const limited = await fetch(base + "/api/health");
  check("global API request 301 returns 429", limited.status === 429);
  check("global API limit includes Retry-After", Number(limited.headers.get("retry-after")) > 0);
  const realNow = Date.now;
  try {
    const future = realNow() + 15 * 60_000 + 1000;
    Date.now = () => future;
    check("global API limit recovers after the real configured window", (await fetch(base + "/api/health")).status === 200);
  } finally { Date.now = realNow; }

  // Stop ONLY our own MongoMemoryReplSet, never a configured/shared service.
  const errors: string[] = [];
  const originalError = console.error;
  try {
    console.error = (...args) => errors.push(args.map(String).join(" "));
    await mongo.stop();
    const outage = await fetch(base + "/api/profile", { headers: { Authorization: "Bearer synthetic-invalid-token" } });
    const text = await outage.text();
    check("database outage fails closed with generic 500", outage.status === 500 && JSON.parse(text).error?.message === "Internal server error");
    check("database outage does not disclose URI, stack or driver internals", !/mongodb:|MongoServer|stack|ECONNREFUSED/.test(text));
    check("database outage is logged internally", errors.some(line => line.includes('"type":"http_error"')));
  } finally { console.error = originalError; }
  console.log(`${passed} supplementary checks passed, 0 failed`);
} finally {
  globalThis.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await mongoose.disconnect();
  await mongo.stop();
}
