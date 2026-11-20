/** Consent, duplicate delivery and review integrity against an owned disposable replica set. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
const uri = mongo.getUri("icheertor_integrity_disposable");
const ownedPort = Number(new URL(uri).port);
assert(![27017, 27018].includes(ownedPort));
Object.assign(process.env, {
  NODE_ENV: "test", MONGODB_URI: uri, JWT_SECRET: crypto.randomBytes(48).toString("hex"),
  GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic", ADMIN_EMAILS: "",
  VERTEX_AI_API_KEY: "", VERTEX_AI_PROJECT_ID: "", VERTEX_AI_MODEL: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  SMTP_USER: "", SMTP_PASS: "", FRONTEND_URL: "https://frontend.example.invalid",
});
const originalConnect = net.Socket.prototype.connect;
const originalFetch = globalThis.fetch;
net.Socket.prototype.connect = function (...args: any[]) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === "object" ? first : { port: first, host: typeof args[1] === "string" ? args[1] : "localhost" };
  assert(["127.0.0.1", "localhost", "::1"].includes(options.host ?? "localhost") && Number(options.port) === ownedPort, "External network connection forbidden in integrity tests");
  return originalConnect.apply(this, args as any);
} as typeof originalConnect;
globalThis.fetch = async () => { throw new Error("Unmocked fetch forbidden"); };
const { env } = await import("../src/config/env.js");
assert.equal(env.MONGODB_URI, uri);
const { connectDB } = await import("../src/db/connection.js");
await connectDB();
assert.equal(mongoose.connection.name, "icheertor_integrity_disposable");
const { default: User } = await import("../src/db/models/user.js");
const { default: TORRecord } = await import("../src/db/models/tor-record.js");
const { default: Notification } = await import("../src/db/models/notification.js");
const { default: ConsentRecord } = await import("../src/db/models/consent-record.js");
const { processingAllowed } = await import("../src/services/pdpa/processing-permission.js");
const { dispatchNotification } = await import("../src/services/notification/dispatcher.js");
const { notifyUsersOfNewTors } = await import("../src/services/notification/ingest-notifier.js");
const { createNotificationOnce, deliverEmailOnce, MAX_EMAIL_ATTEMPTS } = await import("../src/services/notification/delivery.js");
const { claimExtraction, commitOwnedExtraction, updateOwnedExtraction, LeaseLostError } = await import("../src/services/extraction-lease.js");
const { applyChanges, ReviewConflictError } = await import("../src/services/tor-review.js");
await Promise.all([User.init(), TORRecord.init(), Notification.init(), ConsentRecord.init()]);

let passed = 0;
function check(name: string, ok: boolean) { assert(ok, name); passed++; console.log("PASS " + name); }
async function rejects(name: string, work: () => Promise<unknown>, type?: any) { await assert.rejects(work, type); check(name, true); }
let seq = 0;
const makeUser = (prefs = { inApp: true, email: true }) => {
  seq++;
  return User.create({ googleId: `synthetic-integrity-${seq}`, email: `user${seq}@example.invalid`, name: `Synthetic ${seq}`, status: "active", role: "user", notificationPrefs: prefs });
};
const makeTor = (name: string, extra: Record<string, unknown> = {}) =>
  TORRecord.create({ title: name, agencyName: "Synthetic", phase: "bidding", postingDate: new Date(), sourceUrl: "https://example.invalid", deduplicationHash: name, ...extra });
const consent = (userId: unknown, granted: boolean) => ConsentRecord.create({ userId, purpose: "data_processing", granted, scope: "all" });
/** Fake SMTP that counts provider calls; never opens a connection. */
function smtp(outcomes: boolean[] = []) {
  const calls: string[] = [];
  const send = async (to: string) => { calls.push(to); const ok = outcomes.length ? outcomes.shift()! : true; return ok ? { success: true, messageId: "synthetic" } : { success: false, error: "synthetic SMTP outage" }; };
  return { calls, send };
}

try {
  console.log("── Consent states (legacy default retained, explicit withdrawal enforced)");
  const noRecord = await makeUser();
  check("no consent record keeps legacy processing (not evidence of consent)", await processingAllowed(noRecord._id.toString()));
  const granted = await makeUser(); await consent(granted._id, true);
  check("explicit grant allows processing", await processingAllowed(granted._id.toString()));
  const withdrawn = await makeUser(); await consent(withdrawn._id, true); await consent(withdrawn._id, false);
  check("latest withdrawal blocks processing", !(await processingAllowed(withdrawn._id.toString())));
  const regranted = await makeUser(); await consent(regranted._id, false); await consent(regranted._id, true);
  check("re-grant after withdrawal allows processing again", await processingAllowed(regranted._id.toString()));
  const blockedSmtp = smtp();
  await rejects("withdrawn account cannot receive a dispatched notification", () => dispatchNotification({ userId: withdrawn._id, type: "system", title: "t", body: "b" }, blockedSmtp.send as any));
  check("withdrawn account causes no SMTP call and no stored notification", blockedSmtp.calls.length === 0 && await Notification.countDocuments({ userId: withdrawn._id }) === 0);
  const noRecordSmtp = smtp();
  await dispatchNotification({ userId: noRecord._id, type: "system", title: "t", body: "b" }, noRecordSmtp.send as any);
  check("no-record account still follows legacy delivery", noRecordSmtp.calls.length === 1);

  console.log("── Consent and preference rechecked at retry time");
  const retryUser = await makeUser();
  const firstTry = smtp([false]);
  const failedFirst = await dispatchNotification({ userId: retryUser._id, type: "system", title: "Retry", body: "b", dedupeKey: "retry-consent" }, firstTry.send as any);
  check("first SMTP failure is recorded as failed", (await Notification.findById(failedFirst.notificationId).lean())?.channels.email.state === "failed");
  await consent(retryUser._id, false);
  const retryAfterWithdrawal = smtp();
  const outcome = await deliverEmailOnce(failedFirst.notificationId, retryUser._id, () => retryAfterWithdrawal.send(retryUser.email));
  check("withdrawal between attempts stops the retry before SMTP", outcome.status === "skipped" && retryAfterWithdrawal.calls.length === 0);
  const prefsUser = await makeUser();
  const failedPrefs = await dispatchNotification({ userId: prefsUser._id, type: "system", title: "Prefs", body: "b", dedupeKey: "retry-prefs" }, smtp([false]).send as any);
  await User.updateOne({ _id: prefsUser._id }, { $set: { "notificationPrefs.email": false } });
  const retryAfterOptOut = smtp();
  await deliverEmailOnce(failedPrefs.notificationId, prefsUser._id, () => retryAfterOptOut.send(prefsUser.email));
  check("email opt-out between attempts stops the retry before SMTP", retryAfterOptOut.calls.length === 0);

  console.log("── Duplicate delivery: concurrency, retry, interruption");
  const concurrentUser = await makeUser();
  const concurrentSmtp = smtp();
  const results = await Promise.all(Array.from({ length: 10 }, () =>
    dispatchNotification({ userId: concurrentUser._id, type: "system", title: "Once", body: "b", dedupeKey: "concurrent-event" }, concurrentSmtp.send as any)));
  check("10 concurrent dispatches of one event store one notification", await Notification.countDocuments({ userId: concurrentUser._id, dedupeKey: "concurrent-event" }) === 1);
  check("10 concurrent dispatches call SMTP exactly once", concurrentSmtp.calls.length === 1);
  check("9 concurrent dispatches report a duplicate", results.filter(r => r.duplicate).length === 9);

  const retryDelivery = await makeUser();
  const flaky = smtp([false, true]);
  const input = { userId: retryDelivery._id, type: "system" as const, title: "Flaky", body: "b", dedupeKey: "retry-event" };
  await dispatchNotification(input, flaky.send as any);
  await dispatchNotification(input, flaky.send as any);
  await dispatchNotification(input, flaky.send as any);
  const delivered = await Notification.findOne({ userId: retryDelivery._id, dedupeKey: "retry-event" }).lean();
  check("retry after SMTP failure delivers once, then stops", flaky.calls.length === 2 && delivered?.channels.email.state === "sent" && delivered.channels.email.sent === true);
  check("retry keeps a single in-app notification", await Notification.countDocuments({ userId: retryDelivery._id }) === 1);

  const capped = await makeUser();
  const alwaysDown = smtp(Array(MAX_EMAIL_ATTEMPTS + 2).fill(false));
  for (let i = 0; i < MAX_EMAIL_ATTEMPTS + 2; i++) await dispatchNotification({ userId: capped._id, type: "system", title: "Down", body: "b", dedupeKey: "capped-event" }, alwaysDown.send as any);
  check(`SMTP attempts are capped at ${MAX_EMAIL_ATTEMPTS}`, alwaysDown.calls.length === MAX_EMAIL_ATTEMPTS);

  const crashUser = await makeUser();
  const pending = await createNotificationOnce({ userId: crashUser._id, type: "system", title: "Crash", body: "b", dedupeKey: "crash-event", channels: { inApp: { sent: true }, email: { sent: false, state: "pending" } } });
  const child = spawn(process.execPath, ["--import", "tsx", "tests/helpers/crash-email-worker.mts"], { cwd: process.cwd(), env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = ""; child.stderr.on("data", data => stderr += data);
  child.stdin.end(JSON.stringify({ uri, notificationId: pending.id, userId: crashUser._id.toString() }));
  const exit = await new Promise<number | null>((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  assert.equal(exit, 23, stderr);
  const interrupted = await Notification.findById(pending.id).lean();
  check("real worker dies after claiming the email; state stays sending", interrupted?.channels.email.state === "sending" && interrupted.channels.email.sent === false);
  const afterCrash = smtp();
  const rerun = await dispatchNotification({ userId: crashUser._id, type: "system", title: "Crash", body: "b", dedupeKey: "crash-event" }, afterCrash.send as any);
  check("unknown-outcome email is not resent automatically (no duplicate, possible miss)", rerun.duplicate && afterCrash.calls.length === 0);

  console.log("── New-TOR broadcast reruns");
  await User.updateMany({}, { $set: { status: "suspended" } }); // isolate the broadcast audience
  const broadcastUsers = await Promise.all([makeUser(), makeUser()]);
  const tors = await Promise.all([makeTor("broadcast-a"), makeTor("broadcast-b")]);
  const torIds = tors.map(t => t._id);
  const broadcastSmtp = smtp();
  const sendNewTor = (async (data: { to: string }) => broadcastSmtp.send(data.to)) as any;
  const [first, concurrent] = await Promise.all([
    notifyUsersOfNewTors(torIds, { sendEmail: sendNewTor }),
    notifyUsersOfNewTors([...torIds].reverse(), { sendEmail: sendNewTor }),
  ]);
  check("concurrent broadcasts of the same batch notify each user once", first.notificationsCreated + concurrent.notificationsCreated === 2 && await Notification.countDocuments({ userId: { $in: broadcastUsers.map(u => u._id) } }) === 2);
  check("concurrent broadcasts send one email per user", broadcastSmtp.calls.length === 2 && new Set(broadcastSmtp.calls).size === 2);
  const repeated = await notifyUsersOfNewTors(torIds, { sendEmail: sendNewTor });
  check("rerunning the same ingest batch sends nothing new", repeated.notificationsCreated === 0 && repeated.alreadyNotified === 2 && broadcastSmtp.calls.length === 2);
  await consent(broadcastUsers[0]._id, false);
  const third = await makeTor("broadcast-c");
  const afterWithdrawal = await notifyUsersOfNewTors([third._id], { sendEmail: sendNewTor });
  check("broadcast skips a withdrawn user", afterWithdrawal.notificationsCreated === 1 && !broadcastSmtp.calls.slice(2).includes(broadcastUsers[0].email));

  console.log("── Review status vs. changed AI content");
  const verified = (note: string) => ({ review: { status: "verified", reviewedBy: "synthetic-admin", reviewedAt: new Date(), note, editedFields: ["title"] }, extractionStatus: "pending" });
  // Before: the former two-step write. An interruption after the data write leaves new AI output labelled verified.
  const legacy = await makeTor("review-legacy", verified("checked"));
  const legacyOwner = await claimExtraction(legacy._id.toString(), "pending", 60000);
  await updateOwnedExtraction(legacy._id.toString(), legacyOwner!, { $set: { title: "new AI reading", extractionStatus: "completed" } });
  const legacyState = await TORRecord.findById(legacy._id).lean();
  check("BEFORE: interrupted two-step write shows new AI content as verified", legacyState?.title === "new AI reading" && legacyState.review?.status === "verified");
  // After: one transaction.
  const atomic = await makeTor("review-atomic", verified("checked"));
  const atomicOwner = await claimExtraction(atomic._id.toString(), "pending", 60000);
  await commitOwnedExtraction(atomic._id.toString(), atomicOwner!, { $set: { title: "new AI reading", extractionStatus: "completed" } });
  const atomicState = await TORRecord.findById(atomic._id).lean();
  check("AFTER: new AI content and outdated review commit together", atomicState?.title === "new AI reading" && atomicState.review?.status === "outdated");
  const lost = await makeTor("review-lease-lost", verified("checked"));
  const lostOwner = await claimExtraction(lost._id.toString(), "pending", 60000);
  await TORRecord.updateOne({ _id: lost._id }, { $set: { "extraction.lockedUntil": new Date(Date.now() - 1) } });
  await rejects("expired worker cannot commit a reading", () => commitOwnedExtraction(lost._id.toString(), lostOwner!, { $set: { title: "stale AI reading" } }), LeaseLostError);
  const lostState = await TORRecord.findById(lost._id).lean();
  check("failed commit rolls back the outdated mark too", lostState?.title === "review-lease-lost" && lostState.review?.status === "verified");
  const unreviewed = await makeTor("review-none", { extractionStatus: "pending" });
  const unreviewedOwner = await claimExtraction(unreviewed._id.toString(), "pending", 60000);
  await commitOwnedExtraction(unreviewed._id.toString(), unreviewedOwner!, { $set: { extractionStatus: "completed" } });
  check("a never-reviewed record is not given a review status", !(await TORRecord.findById(unreviewed._id).lean())?.review?.status);

  const raced = await makeTor("review-race", { extractionStatus: "pending" });
  const loadedAt = (await TORRecord.findById(raced._id).lean())!.updatedAt.toISOString();
  const racedOwner = await claimExtraction(raced._id.toString(), "pending", 60000);
  await new Promise(resolve => setTimeout(resolve, 5));
  await commitOwnedExtraction(raced._id.toString(), racedOwner!, { $set: { title: "newer AI reading", extractionStatus: "completed" } });
  await rejects("admin cannot verify content that changed after loading it", () => applyChanges(raced._id.toString(), {}, { id: "synthetic-admin" }, { expectedUpdatedAt: loadedAt }), ReviewConflictError);
  check("rejected stale verification leaves the record unverified", !(await TORRecord.findById(raced._id).lean())?.review?.status);
  const current = (await TORRecord.findById(raced._id).lean())!.updatedAt.toISOString();
  await applyChanges(raced._id.toString(), {}, { id: "synthetic-admin" }, { expectedUpdatedAt: current });
  check("verification with the current version succeeds", (await TORRecord.findById(raced._id).lean())?.review?.status === "verified");

  console.log(`${passed} integrity checks passed, 0 failed`);
} finally {
  globalThis.fetch = originalFetch;
  await mongoose.disconnect();
  await mongo.stop();
  net.Socket.prototype.connect = originalConnect;
}
