/** Local DAST fixture. Never reads a configured database or external credentials. */
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

const output = process.argv[2];
if (!output) throw new Error("Usage: tsx scripts/zap-fixture.mts <private-output-directory>");
const port = Number(process.env.ZAP_FIXTURE_PORT ?? "4301");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid fixture port");
const directory = resolve(output);
await mkdir(directory, { recursive: true, mode: 0o700 });
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const disposableUri = mongo.getUri("icheertor_zap_disposable");

// Override inherited settings BEFORE importing the app. No dotenv, real SMTP,
// scheduler, Google, or Vertex credentials are used by this fixture.
Object.assign(process.env, {
  NODE_ENV: "test", MONGODB_URI: disposableUri,
  JWT_SECRET: crypto.randomBytes(48).toString("hex"),
  GOOGLE_CLIENT_ID: "synthetic-zap-client", GOOGLE_CLIENT_SECRET: "synthetic-zap-secret",
  GOOGLE_CALLBACK_URL: `http://localhost:${port}/api/auth/google/callback`,
  FRONTEND_URL: "http://host.docker.internal:4300", ADMIN_EMAILS: "", TRUST_PROXY: "0",
  SESSION_IDLE_TIMEOUT_MINUTES: "120", SESSION_MAX_HOURS: "8",
  RATE_LIMIT_API_MAX: "100000", CRON_SECRET: "",
  SMTP_USER: "", SMTP_PASS: "", VERTEX_AI_API_KEY: "", VERTEX_AI_PROJECT_ID: "",
  GOOGLE_APPLICATION_CREDENTIALS: "", VERTEX_AI_MODEL: "",
});

const { default: app } = await import("../src/app.js");
const { connectDB } = await import("../src/db/connection.js");
const { default: User } = await import("../src/db/models/user.js");
const { default: TORRecord } = await import("../src/db/models/tor-record.js");
const { default: Bookmark } = await import("../src/db/models/bookmark.js");
const { default: Notification } = await import("../src/db/models/notification.js");
const { default: VendorProfile } = await import("../src/db/models/vendor-profile.js");
const { default: ConsentRecord } = await import("../src/db/models/consent-record.js");
const { startSession } = await import("../src/auth/session-service.js");
const { env: testEnvironment } = await import("../src/config/env.js");
assert.equal(testEnvironment.MONGODB_URI, disposableUri, "Refusing any database except our generated fixture");
await connectDB();
await Promise.all([User.init(), Bookmark.init(), VendorProfile.init()]);

const torId = (await TORRecord.collection.insertOne({
  title: "Synthetic ZAP procurement", agencyName: "Synthetic agency", phase: "bidding",
  extractionStatus: "completed", tags: [], parsedData: { qualifications: [] },
  postingDate: new Date(), sourceUrl: "https://egp2.bangkok.go.th/", deduplicationHash: "synthetic-zap-record",
  createdAt: new Date(), updatedAt: new Date(),
})).insertedId;
const comparisonTorId = (await TORRecord.collection.insertOne({
  title: "Second synthetic procurement", agencyName: "Synthetic agency", phase: "bidding",
  extractionStatus: "completed", tags: [], parsedData: { qualifications: [] },
  postingDate: new Date(), sourceUrl: "https://egp2.bangkok.go.th/", deduplicationHash: "synthetic-zap-comparison",
  createdAt: new Date(), updatedAt: new Date(),
})).insertedId;
const identities: Record<string, unknown> = {};
for (const role of ["user", "admin", "developer"] as const) {
  const user = await User.create({
    googleId: `synthetic-${role}`, email: `${role}@example.invalid`, name: `ZAP ${role}`,
    role, status: "active", notificationPrefs: { inApp: true, email: false },
  });
  const bookmark = await Bookmark.create({ userId: user._id, torRecordId: torId });
  const notification = await Notification.create({
    userId: user._id, type: "system", title: "Synthetic notification", body: "Local DAST only",
    channels: { inApp: { sent: true }, email: { sent: false } },
  });
  await VendorProfile.create({ userId: user._id, companyName: `Synthetic ${role} company`, companyAge: 5 });
  await ConsentRecord.create({ userId: user._id, purpose: "data_processing", granted: true, scope: "all" });
  identities[role] = {
    userId: user._id.toString(), bookmarkId: bookmark._id.toString(),
    notificationId: notification._id.toString(), token: (await startSession(user._id.toString(), { userAgent: "isolated-zap" })).token,
  };
}

const server = app.listen(port, "0.0.0.0"); // Docker scanner reaches the host bridge.
await new Promise<void>((ok, fail) => { server.once("listening", ok); server.once("error", fail); });
await writeFile(resolve(directory, "fixture.json"), JSON.stringify({ port, torId: torId.toString(), comparisonTorId: comparisonTorId.toString(), identities }), { mode: 0o600 });
console.log(`Disposable ZAP API ready on port ${port}; synthetic credentials saved privately.`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await mongoose.disconnect();
  await mongo.stop();
}
process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
