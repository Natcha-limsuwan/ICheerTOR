import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { listEntries, readEntry, ZIP_LIMITS } from "../src/services/ingestion/zip-reader.js";
import { assertProcurementUrl, procurementFetch, readLimitedBody } from "../src/services/ingestion/safe-fetch.js";
import { extractPdfText } from "../src/services/ingestion/pdf-text.js";

/** Small synthetic archives exercise boundaries without downloading real documents. */
function archive(name = "tor.pdf", plain = Buffer.from("%PDF-1.7 test"), declared = plain.length, attrs = 0) {
  const filename = Buffer.from(name), compressed = deflateRawSync(plain);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(declared, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(declared, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(attrs >>> 0, 38);
  const offset = local.length + filename.length + compressed.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}

const valid = archive();
assert.equal(readEntry(valid, listEntries(valid)[0]).toString(), "%PDF-1.7 test");
assert.throws(() => listEntries(Buffer.alloc(10)));
assert.throws(() => listEntries(archive("../tor.pdf")));
assert.throws(() => listEntries(archive("/tor.pdf")));
assert.throws(() => listEntries(archive("link.pdf", undefined, undefined, 0xa000 << 16)));
assert.throws(() => listEntries(archive("tor.pdf", undefined, ZIP_LIMITS.entry + 1)));
const bomb = archive("tor.pdf", Buffer.alloc(10000), 10);
assert.throws(() => readEntry(bomb, listEntries(bomb)[0]));
const count = Buffer.from(valid); count.writeUInt16LE(501, count.length - 12);
assert.throws(() => listEntries(count));
assert.throws(() => readEntry(valid, { ...listEntries(valid)[0], size: 1 }));
await assert.rejects(extractPdfText(Buffer.from("<html>not a PDF</html>")), /Invalid or oversized PDF/);

assert.equal(assertProcurementUrl("https://egp2.bangkok.go.th/appapi/api").hostname, "egp2.bangkok.go.th");
for (const url of ["http://process5.gprocurement.go.th", "https://127.0.0.1/", "https://process5.gprocurement.go.th.evil.test/", "https://user@process5.gprocurement.go.th/", "https://process5.gprocurement.go.th:444/"]) {
  assert.throws(() => assertProcurementUrl(url));
}
await assert.rejects(readLimitedBody(new Response("oversize"), 3));
await assert.rejects(readLimitedBody(new Response("x", { headers: { "Content-Length": "1000" } }), 3));
assert.equal((await readLimitedBody(new Response("ok"), 2)).toString(), "ok");

const original = globalThis.fetch;
let calls = 0;
try {
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } }); };
  await assert.rejects(procurementFetch("https://process5.gprocurement.go.th/file", {}, 100));
  assert.equal(calls, 1, "private redirect must never be requested");
  calls = 0;
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Response(null, { status: 302, headers: { Location: "/next" } }) : new Response("ok"); };
  assert.equal((await procurementFetch("https://process5.gprocurement.go.th/file", {}, 100)).body.toString(), "ok");
  calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { Location: "/loop" } }); };
  await assert.rejects(procurementFetch("https://process5.gprocurement.go.th/file", {}, 100));
  assert.equal(calls, 4);
} finally { globalThis.fetch = original; }
console.log("Ingestion security checks passed (ZIP boundaries, decompression, streaming limits, egress and redirects).");
