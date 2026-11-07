/** Real HTTP + MongoDB integration on an isolated local database of synthetic data.
 * Requires QA mongod on 127.0.0.1:27019. Never reads MONGODB_URI from .env.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env.js";
import { connectDB } from "../../src/db/connection.js";
import User from "../../src/db/models/user.js";
import TORRecord from "../../src/db/models/tor-record.js";
import VendorProfile from "../../src/db/models/vendor-profile.js";
import Bookmark from "../../src/db/models/bookmark.js";
import Notification from "../../src/db/models/notification.js";
import UserCorrection from "../../src/db/models/user-correction.js";
import ConsentRecord from "../../src/db/models/consent-record.js";
import AdminActionLog from "../../src/db/models/admin-action-log.js";

const database = `icheertor_qa_${randomUUID().replaceAll("-", "")}`;
let server: Server;
let base: string;
let a: string, b: string, aToken: string, bToken: string;
let torIds: string[];
const notice = "2026-11-07";
async function request(route: string, token = aToken, method = "GET", body?: unknown) {
  const response = await fetch(`${base}${route}`, { method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  env.MONGODB_URI = `mongodb://127.0.0.1:27019/${database}?serverSelectionTimeoutMS=3000`;
  env.JWT_SECRET = "integration-only-synthetic-secret";
  env.GOOGLE_CLIENT_ID = "synthetic-qa-client";
  env.GOOGLE_CLIENT_SECRET = "synthetic-qa-secret";
  env.SMTP_USER = "";
  await connectDB();
  assert.equal(mongoose.connection.name, database);
  const app = (await import("../../src/app.js")).default;
  server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}/api`;
  const users = await User.create([
    { googleId: "synthetic-google-a", email: "a@example.invalid", name: "Synthetic A" },
    { googleId: "synthetic-google-b", email: "b@example.invalid", name: "Synthetic B" },
  ]);
  [a, b] = users.map(user => user._id.toString());
  [aToken, bToken] = users.map(user => jwt.sign({ id: user._id.toString(), email: user.email, role: "developer", status: "active" }, env.JWT_SECRET, { expiresIn: "10m" }));
  // Include exact price boundaries, same-day rows and >20 records.
  const prices = [499999.99, 500000, 1000000, 1000000.01, ...Array.from({ length: 21 }, () => 750000)];
  const records = await TORRecord.create(prices.map((price, index) => ({
    title: `โครงการ website ${index}`, agencyName: "หน่วยงาน QA", phase: "bidding",
    medianPrice: price, postingDate: new Date("2026-11-01T00:00:00+07:00"),
    submissionDeadline: new Date("2030-01-01"), sourceUrl: `https://example.invalid/${index}`,
    extractionStatus: "completed", tags: ["open", "website"], deduplicationHash: `synthetic-${index}`,
    parsedData: { scopeOfWork: { content: "บำรุงรักษาเว็บไซต์", confidence: 0.91 } },
  })));
  torIds = records.map(record => record._id.toString());
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, database);
    // Finish automatic collection/index creation before dropping the scratch
    // DB; otherwise a pending init can recreate it after dropDatabase().
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("DB-01: current DB role overrides stale developer claim", async () => {
  assert.equal((await request("/admin/users")).status, 403);
  assert.equal((await request("/auth/me")).body.data.role, "user");
});
test("DB-02: consent absence blocks profile writes, explicit grant enables them", async () => {
  assert.equal((await request("/profile", aToken, "POST", { companyName: "Synthetic company", companyAge: 3 })).status, 403);
  assert.equal((await request("/pdpa/consent", aToken, "POST", { purpose: "data_processing", granted: true, noticeVersion: notice })).status, 201);
  const status = await request("/pdpa/consent");
  assert.equal(status.body.data[0].granted, true);
  assert.equal(status.body.data[0].noticeVersion, notice);
  assert.equal((await request("/profile", aToken, "POST", { companyName: "Synthetic company", companyAge: 3, userId: b })).status, 201);
  assert.equal((await VendorProfile.findOne({ userId: a }))?.companyName, "Synthetic company");
  assert.equal(await VendorProfile.countDocuments({ userId: b }), 0);
});
test("DB-03: user B cannot read A profile or delete A bookmark", async () => {
  assert.equal((await request("/profile", bToken)).status, 404);
  const bookmark = await Bookmark.create({ userId: a, torRecordId: torIds[0] });
  assert.equal((await request(`/bookmarks/${bookmark._id}`, bToken, "DELETE")).status, 404);
  assert.equal(await Bookmark.countDocuments({ userId: a }), 1);
});
test("DB-04: actual Mongo keyword expansion and inclusive price boundaries", async () => {
  const result = await request("/tor?q=เว็บไซต์%20บำรุงรักษา&status=open&budgetMin=500000&budgetMax=1000000&limit=100&sortBy=medianPrice&sortOrder=asc");
  assert.equal(result.status, 200);
  assert.equal(result.body.meta.total, 23);
  assert.equal(result.body.data[0].medianPrice, 500000);
  assert.equal(result.body.data.at(-1).medianPrice, 1000000);
});
test("DB-05: equal-day pagination neither repeats nor loses rows", async () => {
  const one = await request("/tor?sortBy=announcedDate&page=1&limit=20");
  const two = await request("/tor?sortBy=announcedDate&page=2&limit=20");
  assert.equal(one.body.data.length, 20);
  assert.equal(two.body.data.length, 5);
  assert.equal(new Set([...one.body.data, ...two.body.data].map(row => row._id)).size, 25);
});
test("DB-06: revoked consent immediately stops profile writes and matching", async () => {
  assert.equal((await request("/pdpa/consent", aToken, "POST", { purpose: "data_processing", granted: false })).status, 201);
  assert.equal((await request("/pdpa/consent")).body.data[0].granted, false);
  assert.equal((await request("/profile", aToken, "PUT", { companyName: "Changed" })).status, 403);
  assert.equal((await request(`/tor/${torIds[0]}/match`)).status, 403);
  const list = await request("/tor?includeMatch=true");
  assert(list.body.data.every(row => row.match === null));
});
test("DB-07: export includes >100 notifications and excludes B data", async () => {
  await Notification.insertMany(Array.from({ length: 105 }, (_, index) => ({ userId: a, type: "system", title: `QA ${index}`, body: "Synthetic" })));
  await Notification.create({ userId: b, type: "system", title: "B only", body: "Synthetic B" });
  const exported = await request("/pdpa/export");
  assert.equal(exported.status, 200);
  assert.equal(exported.body.notifications.length, 105);
  assert(exported.body.notifications.every(item => item.userId === a));
});
test("DB-08: deletion erases linked data and old JWT becomes unusable", async () => {
  await UserCorrection.create({ userId: a, torRecordId: torIds[0], fieldPath: "title", originalValue: "Original", correctedValue: "Synthetic" });
  const log = await AdminActionLog.create({ adminUserId: b, targetUserId: a, action: "verify", previousStatus: "active", newStatus: "active", reason: "Synthetic A name" });
  assert.equal((await request("/pdpa/delete", aToken, "POST", { confirmEmail: "a@example.invalid" })).status, 200);
  assert.equal(await User.findById(a), null);
  for (const model of [VendorProfile, Bookmark, Notification, UserCorrection, ConsentRecord]) assert.equal(await model.countDocuments({ userId: a }), 0);
  const sanitized = await AdminActionLog.findById(log._id);
  assert.equal(sanitized?.targetUserId, null);
  assert.equal(sanitized?.reason, undefined);
  assert.equal((await request("/auth/me")).status, 401);
  assert.equal((await request("/tor")).status, 401);
  assert.equal(await Notification.countDocuments({ userId: b }), 1);
  assert.equal(await TORRecord.countDocuments(), 25);
});
test("DB-09: ban/reinstate and role updates take effect for existing token", async () => {
  await User.findByIdAndUpdate(b, { status: "banned" });
  assert.equal((await request("/auth/me", bToken)).status, 403);
  await User.findByIdAndUpdate(b, { status: "active", role: "admin" });
  assert.equal((await request("/auth/me", bToken)).body.data.role, "admin");
});
