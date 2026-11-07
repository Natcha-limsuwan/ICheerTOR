/** Offline QA of real handlers with stubbed persistence. No server or real data. */
import assert from "node:assert/strict";
import { afterEach, before, beforeEach, mock, test } from "node:test";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env.js";
import { authenticate } from "../../src/middleware/auth.js";
import torRoutes from "../../src/routes/tor.routes.js";
import profileRoutes from "../../src/routes/profile.routes.js";
import pdpaRoutes from "../../src/routes/pdpa.routes.js";
import bookmarkRoutes from "../../src/routes/bookmark.routes.js";
import notificationRoutes from "../../src/routes/notification.routes.js";
import adminRoutes from "../../src/routes/admin.routes.js";
import TORRecord from "../../src/db/models/tor-record.js";
import User from "../../src/db/models/user.js";
import VendorProfile from "../../src/db/models/vendor-profile.js";
import Bookmark from "../../src/db/models/bookmark.js";
import ConsentRecord from "../../src/db/models/consent-record.js";
import Notification from "../../src/db/models/notification.js";
import UserCorrection from "../../src/db/models/user-correction.js";
import AdminActionLog from "../../src/db/models/admin-action-log.js";
import { retryPendingDeletions } from "../../src/services/pdpa/data-deleter.js";
import { dispatchNotification } from "../../src/services/notification/dispatcher.js";
import { parseThaiDate, formatThaiDate } from "../../../frontend/lib/utils/date-converter.js";
import { formatThaiBaht, parseThaiBaht } from "../../../frontend/lib/utils/currency-formatter.js";

const userId = "000000000000000000000001";
const otherId = "000000000000000000000002";
const account = { id: userId, email: "qa@example.invalid", name: "QA fixture", role: "user", status: "active" };
const app = express();
app.use("/tor", torRoutes);
app.use("/profile", profileRoutes);
app.use("/pdpa", pdpaRoutes);
app.use("/bookmarks", bookmarkRoutes);
app.use("/notifications", notificationRoutes);
app.use("/admin", adminRoutes);
app.get("/protected", authenticate, (_req, res) => res.json({ allowed: true }));
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: { message: error.message } });
});

before(() => {
  env.JWT_SECRET = "qa-only-synthetic-secret-never-used-for-real-users";
  env.MONGODB_URI = "mongodb://127.0.0.1:1/qa_do_not_connect";
  // connectDB() captured this cache on import. Mark it connected only to allow
  // model stubs below; fail fast if any unmocked operation tries persistence.
  globalThis.mongooseCache!.conn = mongoose;
  mongoose.set("bufferCommands", false);
  mongoose.connect = (() => { throw new Error("QA forbids real database connections"); }) as typeof mongoose.connect;
  globalThis.fetch = (() => { throw new Error("QA forbids external requests"); }) as typeof fetch;
});
afterEach(() => mock.restoreAll());
beforeEach(() => {
  mock.method(User, "findById", () => chain({ _id: userId, ...account }));
  mock.method(ConsentRecord, "findOne", () => chain({ granted: true, noticeVersion: "2026-11-07" }));
});

function token(overrides: Record<string, unknown> = {}) {
  return jwt.sign({ ...account, ...overrides }, env.JWT_SECRET, { expiresIn: "5m" });
}

/** Exercise Express routing in process, without opening a TCP port. */
function request(path: string, options: { method?: string; body?: unknown; auth?: string | null } = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Handler timeout: ${path}`)), 1500);
    const req = new IncomingMessage(new Socket());
    req.url = path;
    req.method = options.method ?? "GET";
    req.headers = {};
    if (options.auth !== null) req.headers.authorization = `Bearer ${options.auth ?? token()}`;
    Object.assign(req, { body: options.body ?? {} });
    const res = new ServerResponse(req);
    res.end = ((body: string) => {
      clearTimeout(timer);
      resolve({ status: res.statusCode, body: body ? JSON.parse(String(body)) : null });
      return res;
    }) as typeof res.end;
    app(req, res);
  });
}

function chain(value: unknown) {
  const q: any = {};
  for (const name of ["sort", "skip", "limit", "select", "populate"]) q[name] = () => q;
  q.lean = async () => value;
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(value).then(resolve);
  return q;
}

function listStub() {
  const captured: any = {};
  const q = chain([]);
  for (const name of ["sort", "skip", "limit", "select"]) q[name] = (value: unknown) => { captured[name] = value; return q; };
  mock.method(TORRecord, "find", (filter: unknown) => { captured.filter = filter; return q; });
  mock.method(TORRecord, "countDocuments", () => Promise.resolve(0));
  return captured;
}

test("SEC-01: all private route families reject a missing token", async () => {
  for (const path of ["/tor", "/profile", "/pdpa/export", "/bookmarks", "/notifications", "/admin/users"]) {
    assert.equal((await request(path, { auth: null })).status, 401, path);
  }
});
test("SEC-02: invalid signature and expired token are rejected", async () => {
  assert.equal((await request("/protected", { auth: "invalid" })).status, 401);
  const expired = jwt.sign(account, env.JWT_SECRET, { expiresIn: -1 });
  assert.equal((await request("/protected", { auth: expired })).status, 401);
});
test("SEC-03: current banned and suspended account statuses are rejected", async () => {
  const user = { ...account, status: "suspended" };
  mock.method(User, "findById", () => chain(user));
  for (const status of ["banned", "suspended"]) {
    user.status = status;
    assert.equal((await request("/protected")).status, 403);
  }
});
test("SEC-04: ordinary user cannot access admin routes", async () => {
  assert.equal((await request("/admin/users")).status, 403);
});
test("SEC-05 / BUG-01: token issued before an account ban must stop working", async () => {
  mock.method(User, "findById", () => chain({ ...account, status: "banned", deletedAt: new Date() }));
  assert.equal((await request("/protected")).status, 403);
});
test("SEC-06: profile reads are scoped to authenticated user", async () => {
  let filter: unknown;
  mock.method(VendorProfile, "findOne", (value: unknown) => { filter = value; return chain(null); });
  assert.equal((await request(`/profile?userId=${otherId}`)).status, 404);
  assert.deepEqual(filter, { userId });
});
test("SEC-07: bookmark deletion includes owner filter", async () => {
  let filter: unknown;
  mock.method(Bookmark, "findOneAndDelete", async (value: unknown) => { filter = value; return null; });
  assert.equal((await request(`/bookmarks/${otherId}`, { method: "DELETE" })).status, 404);
  assert.deepEqual(filter, { _id: otherId, userId });
});
test("SEC-08: marking notification read includes owner filter", async () => {
  let filter: unknown;
  mock.method(Notification, "findOneAndUpdate", async (value: unknown) => { filter = value; return null; });
  assert.equal((await request(`/notifications/${otherId}/read`, { method: "PATCH" })).status, 404);
  assert.deepEqual(filter, { _id: otherId, userId });
});

test("PD-01: deleting an account requires matching confirmation email", async () => {
  const update = mock.method(User, "findByIdAndUpdate", async () => null);
  assert.equal((await request("/pdpa/delete", { method: "POST", body: { confirmEmail: "wrong@example.invalid" } })).status, 400);
  assert.equal(update.mock.callCount(), 0);
});
test("PD-02 / BUG-02: data collection requires consent under NFR-PD1", async () => {
  mock.method(ConsentRecord, "findOne", () => chain({ granted: false }));
  mock.method(VendorProfile, "findOne", async () => null);
  mock.method(VendorProfile, "create", async () => ({ userId, companyName: "QA synthetic" }));
  assert.equal((await request("/profile", { method: "POST", body: { companyName: "QA synthetic" } })).status, 403);
});
test("PD-03 / BUG-03: consent status aggregates using ObjectId, matching stored userId", async () => {
  let pipeline: any;
  mock.method(ConsentRecord, "aggregate", async (value: unknown) => { pipeline = value; return []; });
  assert.equal((await request("/pdpa/consent")).status, 200);
  assert(pipeline[0].$match.userId instanceof mongoose.Types.ObjectId, "Mongoose does not cast aggregation pipeline strings to ObjectId");
});
test("PD-04 / BUG-04: deletion must remove or schedule linked profile data", async () => {
  mock.method(User, "findByIdAndUpdate", async () => ({ _id: userId }));
  const remove = mock.method(VendorProfile, "deleteOne", async () => ({ deletedCount: 1 }));
  for (const model of [Bookmark, Notification, UserCorrection, ConsentRecord]) mock.method(model, "deleteMany", async () => ({ deletedCount: 1 }));
  for (const model of [AdminActionLog, UserCorrection, User]) mock.method(model, "updateMany", async () => ({ modifiedCount: 1 }));
  const finalRemoval = mock.method(User, "deleteOne", async () => ({ deletedCount: 1 }));
  const result = await request("/pdpa/delete", { method: "POST", body: { confirmEmail: account.email } });
  assert.equal(result.status, 200);
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(finalRemoval.mock.callCount(), 1);
  assert.equal(result.body.data.deleted, true);
});
test("PD-05 / BUG-13: personal-data export must not silently truncate notifications", async () => {
  mock.method(User, "findById", () => chain(account));
  mock.method(VendorProfile, "findOne", () => chain(null));
  for (const model of [Bookmark, UserCorrection, ConsentRecord]) mock.method(model, "find", () => chain([]));
  const notifications = Array.from({ length: 105 }, (_, i) => ({ _id: String(i), userId, title: `Synthetic notification ${i}` }));
  const q = chain(notifications);
  let exported = notifications;
  q.limit = (limit: number) => { exported = notifications.slice(0, limit); return q; };
  q.lean = async () => exported;
  mock.method(Notification, "find", () => q);
  const result = await request("/pdpa/export");
  assert.equal(result.status, 200);
  assert.equal(result.body.notifications.length, 105);
});

test("FR-B-01: persistence schema rejects out-of-range extraction confidence", async () => {
  for (const confidence of [-0.1, 1.1]) {
    const record = new TORRecord({ parsedData: { scopeOfWork: { content: "Synthetic", confidence } } });
    const error = await record.validate().then(() => null, error => error);
    assert(error?.errors["parsedData.scopeOfWork.confidence"]);
  }
  const record = new TORRecord({ parsedData: { scopeOfWork: { content: "Synthetic", confidence: 0.91 } } });
  const error = await record.validate().then(() => null, error => error);
  assert.equal(error?.errors["parsedData.scopeOfWork.confidence"], undefined);
});

test("SEC-09: removed account is rejected and current role overrides JWT", async () => {
  mock.method(User, "findById", () => chain(null));
  assert.equal((await request("/protected")).status, 401);
  mock.method(User, "findById", () => chain({ ...account, role: "user" }));
  assert.equal((await request("/admin/users", { auth: token({ role: "developer" }) })).status, 403);
});
test("PD-06: outdated notice or revoked consent prevents profile updates", async () => {
  const latest = { granted: true, noticeVersion: "old-version" };
  mock.method(ConsentRecord, "findOne", () => chain(latest));
  assert.equal((await request("/profile", { method: "PUT" })).status, 403);
  latest.granted = false; latest.noticeVersion = "2026-11-07";
  assert.equal((await request("/profile", { method: "PUT" })).status, 403);
});
test("PD-07: grant requires the current notice version and a recognized purpose", async () => {
  const create = mock.method(ConsentRecord, "create", async () => ({}));
  for (const body of [
    { purpose: "data_processing", granted: true },
    { purpose: "data_processing", granted: true, noticeVersion: "old" },
    { purpose: "unrecognized", granted: true, noticeVersion: "2026-11-07" },
  ]) assert.equal((await request("/pdpa/consent", { method: "POST", body })).status, 400);
  assert.equal(create.mock.callCount(), 0);
});
test("PD-08: partial deletion remains pending, retry worker completes it", async () => {
  let blocked = false, removed = false, fail = true;
  mock.method(User, "findByIdAndUpdate", async (_id: unknown, update: any) => { blocked = update.$set.status === "banned" && Boolean(update.$set.deletedAt); return { _id: userId }; });
  mock.method(VendorProfile, "deleteOne", async () => { if (fail) throw new Error("Synthetic temporary failure"); return { deletedCount: 1 }; });
  for (const model of [Bookmark, Notification, UserCorrection, ConsentRecord]) mock.method(model, "deleteMany", async () => ({ deletedCount: 1 }));
  for (const model of [AdminActionLog, UserCorrection, User]) mock.method(model, "updateMany", async () => ({ modifiedCount: 1 }));
  mock.method(User, "deleteOne", async () => { removed = true; return { deletedCount: 1 }; });
  mock.method(User, "find", () => chain([{ _id: userId }]));
  mock.method(console, "error", () => {});
  const response = await request("/pdpa/delete", { method: "POST", body: { confirmEmail: account.email } });
  assert.equal(response.status, 202);
  assert.equal(response.body.data.status, "pending");
  assert(blocked); assert(!removed);
  fail = false;
  await retryPendingDeletions();
  assert(removed);
});
test("PD-09: withdrawn consent prevents creating a match notification", async () => {
  mock.method(ConsentRecord, "findOne", () => chain({ granted: false, noticeVersion: "2026-11-07" }));
  const create = mock.method(Notification, "create", async () => { throw new Error("Must not create notification"); });
  await assert.rejects(dispatchNotification({ userId, type: "new_match", title: "Synthetic", body: "Synthetic" }), /consent/);
  assert.equal(create.mock.callCount(), 0);
});

test("FR-A-01: keyword, scope, phase, status and inclusive price range coexist", async () => {
  const captured = listStub();
  assert.equal((await request("/tor?q=เว็บไซต์&phase=bidding&status=open&budgetMin=500000&budgetMax=1000000")).status, 200);
  assert.deepEqual(captured.filter.medianPrice, { $gte: 500000, $lte: 1000000 });
  assert.equal(captured.filter.phase, "bidding");
  assert(captured.filter.$and.some((condition: any) => condition.extractionStatus === "completed"));
  assert(captured.filter.$and.some((condition: any) => condition.$and?.[0]?.$or?.[0]?.title?.$regex.includes("website")));
  assert(captured.filter.$and.some((condition: any) => condition.tags === "open"));
});
test("FR-A-02: lower-only, upper-only, zero and equal price bounds", async () => {
  const captured = listStub();
  for (const [query, expected] of [
    ["budgetMin=0", { $gte: 0 }], ["budgetMax=500000", { $lte: 500000 }],
    ["budgetMin=500000&budgetMax=500000", { $gte: 500000, $lte: 500000 }],
  ] as const) {
    assert.equal((await request(`/tor?${query}`)).status, 200);
    assert.deepEqual(captured.filter.medianPrice, expected);
  }
});
test("FR-A-03: invalid price ranges rejected before querying records", async () => {
  const captured = listStub();
  for (const query of ["budgetMin=-1", "budgetMax=NaN", "budgetMax=Infinity", "budgetMin=2&budgetMax=1", "budgetMin=1&budgetMin=2", "budgetMin=%20"]) {
    assert.equal((await request(`/tor?${query}`)).status, 400, query);
  }
  assert.equal(captured.filter, undefined);
});
test("FR-A-04: date, price and deadline sort directions plus pagination", async () => {
  const captured = listStub();
  for (const sortBy of ["medianPrice", "submissionDeadline", "postingDate"]) {
    assert.equal((await request(`/tor?sortBy=${sortBy}&sortOrder=asc&page=2&limit=20`)).status, 200);
    assert.deepEqual(captured.sort, { [sortBy]: 1 });
    assert.equal(captured.skip, 20);
    assert.equal(captured.limit, 20);
  }
  await request("/tor?sortBy=announcedDate");
  assert.deepEqual(captured.sort, { "parsedData.keyDates.announcedDate": -1, postingDate: -1 });
});
test("FR-A-05: invalid query types, oversized search, scope and status are rejected", async () => {
  listStub();
  for (const query of ["q=x&q=y", `q=${"x".repeat(201)}`, "scope=invalid", "status=invalid"]) {
    assert.equal((await request(`/tor?${query}`)).status, 400, query);
  }
});
test("FR-A-06 / BUG-05: invalid pagination must not reach database as NaN", async () => {
  listStub();
  assert.equal((await request("/tor?page=abc&limit=abc")).status, 400);
});
test("FR-A-07 / BUG-06: regex characters in agency names must be literal", async () => {
  const captured = listStub();
  await request("/tor?agency=%2E%2A");
  const regex = new RegExp(captured.filter.agencyName.$regex, "i");
  assert.equal(regex.test("unrelated agency"), false);
});
test("FR-A-08 / BUG-07: malformed techStack arrays must return 400 instead of 500", async () => {
  listStub();
  mock.method(console, "error", () => {});
  assert.equal((await request("/tor?techStack=react&techStack=node")).status, 400);
});

test("TH-01: Thai month names, abbreviations and BE numeric dates parse", () => {
  for (const input of ["15 สิงหาคม 2569", "15 ส.ค. 2569", "15/08/2569"]) {
    const date = parseThaiDate(input)!;
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 7);
    assert.equal(date.getDate(), 15);
  }
});
test("TH-02: Thai Baht formatting and parsing of regular amounts", () => {
  assert.match(formatThaiBaht(1234567.5), /1,234,567\.50/);
  assert.equal(parseThaiBaht("฿1,234,567.50"), 1234567.5);
});
test("TH-03 / BUG-08: nonexistent Thai dates must not silently roll over", () => {
  assert.equal(parseThaiDate("31/02/2569"), null);
});
test("TH-04 / BUG-09: explicitly requesting Gregorian dates must use Gregorian year", () => {
  assert.match(formatThaiDate(new Date(2026, 7, 15), false), /2026/);
});
test("TH-05 / BUG-10: Thai digits must be accepted by Thai date helper", () => {
  assert.equal(parseThaiDate("๑๕/๐๘/๒๕๖๙")?.getFullYear(), 2026);
});
