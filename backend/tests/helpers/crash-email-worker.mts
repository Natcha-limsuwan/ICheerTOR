/** Invoked only by integrity.test.mts with its generated fixture URI. */
import assert from "node:assert/strict";
import mongoose from "mongoose";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { uri, notificationId, userId } = JSON.parse(input);
assert.equal(process.env.NODE_ENV, "test");
assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/icheertor_integrity_disposable\?/);
assert(!/:2701[78]\//.test(uri));
await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
const { deliverEmailOnce } = await import("../../src/services/notification/delivery.js");
await deliverEmailOnce(notificationId, userId, async () => {
  // Claimed, "handed to SMTP", then the worker dies before recording the outcome.
  console.log(JSON.stringify({ claimed: true }));
  process.exit(23);
});
