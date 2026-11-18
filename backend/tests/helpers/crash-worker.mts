/** Invoked only by resilience.test.mts with its generated fixture URI. */
import assert from "node:assert/strict";
import mongoose from "mongoose";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const { uri, id } = JSON.parse(input);
assert.equal(process.env.NODE_ENV, "test");
assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/icheertor_resilience_disposable\?/);
assert(!/:2701[78]\//.test(uri));
await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
const { claimExtraction } = await import("../../src/services/extraction-lease.js");
const owner = await claimExtraction(id, "pending", 60000);
assert(owner);
console.log(JSON.stringify({ owner }));
// Deliberately exit without releasing the lease or finishing the job.
process.exit(23);
