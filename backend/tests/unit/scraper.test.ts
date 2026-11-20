import test from "node:test";
import assert from "node:assert/strict";
import { zipFixture, pdfFixture } from "../fixtures/documents.js";
import { listEntries, readEntry } from "../../src/services/ingestion/zip-reader.js";
import { pickDocument } from "../../src/services/ingestion/document-picker.js";
import { parseRss } from "../../src/services/ingestion/egp-rss-client.js";
import { extractPdfText } from "../../src/services/ingestion/pdf-text.js";
import { buildAnnouncementSearchUrl, buildDownloadUrl } from "../../src/services/ingestion/egp-document-url.js";

test("SCR-01 #137: ZIP store and deflate preserve independent documents", () => {
  const archive = zipFixture([{ name: "TOR.pdf", content: Buffer.from("scope"), method: 0 }, { name: "doc_123.pdf", content: Buffer.from("qualification ".repeat(50)) }]);
  const entries = listEntries(archive); assert.equal(entries.length, 2);
  assert.equal(readEntry(archive, entries[0]).toString(), "scope");
  assert.equal(readEntry(archive, entries[1]).toString(), "qualification ".repeat(50));
});
test("SCR-02 #137: Unicode and legacy CP874 Thai filenames decode before picking", () => {
  const archive = zipFixture([{ name: "ขอบเขตงาน.pdf", content: Buffer.from("x") },
    { name: Buffer.concat([Buffer.from([0xb7, 0xb4, 0xca, 0xcd, 0xba]), Buffer.from(".pdf")]), content: Buffer.from("y"), utf8: false }]);
  const entries = listEntries(archive); assert.equal(entries[0].name, "ขอบเขตงาน.pdf"); assert.equal(entries[1].name, "ทดสอบ.pdf");
  assert.equal(pickDocument(entries).best?.name, "ขอบเขตงาน.pdf");
});
test("SCR-03 #137: truncated/HTML archives are refused", () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from("<html>Request Rejected</html>"), zipFixture([{ name: "TOR.pdf", content: Buffer.from("x") }]).subarray(0, 20)]) assert.throws(() => listEntries(bytes));
});
test("SCR-04 #137: unsupported compression and corrupt local header are refused", () => {
  const archive = zipFixture([{ name: "TOR.pdf", content: Buffer.from("x") }]);
  const entry = listEntries(archive)[0]; assert.throws(() => readEntry(archive, { ...entry, method: 99 }), /compression/);
  archive.writeUInt32LE(0, entry.offset); assert.throws(() => readEntry(archive, entry), /local header/);
});
test("SCR-05 #137: contract/bond/BOQ-only archive never becomes TOR", () => {
  const result = pickDocument(["contract.pdf", "bond.pdf", "BOQ.pdf", "TOR.pdf.exe"].map(name => ({ name, rawName: name, size: 500 })));
  assert.equal(result.best, null); assert.ok(result.skipReason);
});
test("SCR-06 #137: unknown agency attachment can accompany bidding document but publication copy is excluded", () => {
  const result = pickDocument([{ name: "doc_123.pdf", size: 200 }, { name: "attach_pub_1.pdf", size: 9000 },
    { name: "agency-file.pdf", size: 4000 }].map(entry => ({ ...entry, rawName: entry.name })));
  assert.equal(result.tor?.name, "agency-file.pdf"); assert.equal(result.biddingDoc?.name, "doc_123.pdf");
});
test("SCR-07 #137: RSS decodes entities/CDATA and rejects malformed project identifiers", () => {
  const xml = '<rss><countbyday>2</countbyday><item><title><![CDATA[Website &amp; database]]></title><description>69049037572, e-bidding, invitation</description><pubDate>2026-11-08</pubDate><link>https://example.invalid/?a=1&amp;b=2</link></item><item><description>bad-id, method, label</description></item></rss>';
  const result = parseRss(xml, "D0"); assert.equal(result.countByDay, 2); assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "Website & database"); assert.equal(result.items[0].link, "https://example.invalid/?a=1&b=2");
});
test("SCR-08 #137: untrusted project/archive IDs stay within their query parameter", () => {
  const value = "123&other=456#x";
  const announcement = new URL(buildAnnouncementSearchUrl(value)); assert.equal(announcement.searchParams.get("keywordSearch"), value); assert.equal(announcement.searchParams.has("other"), false);
  assert.equal(new URL(buildDownloadUrl(value)).searchParams.get("fileId"), value);
});
test("SCR-09 #137: actual generated text PDF yields readable text", async () => {
  const result = await extractPdfText(pdfFixture("Scope of work. Deliver a website with search and filters. ".repeat(10)));
  assert.equal(result.pageCount, 1); assert.equal(result.hasTextLayer, true); assert.match(result.pages[0], /Scope of work/);
});
test("SCR-10 #137: a blank/image-only PDF is never reported as readable text", async () => {
  const result = await extractPdfText(pdfFixture()); assert.equal(result.hasTextLayer, false); assert.equal(result.charCount, 0);
});
