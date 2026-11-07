import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "../../src/config/env.js";
import { assertPayloadReviewed, payloadFingerprint, redactPersonalText, PrivacyReviewRequiredError, writePayloadReview } from "../../src/services/ai/payload-privacy.js";
import { buildModelParts, callModel, type PreparedDocuments } from "../../src/services/ai/tor-parser.js";
import { activePrompt } from "../../src/services/ai/prompts/index.js";
import { getVertexClient } from "../../src/services/ai/vertex-client.js";
const originalManifest = env.AI_PRIVACY_REVIEW_MANIFEST;
const originalKey = env.VERTEX_AI_API_KEY, originalModel = env.VERTEX_AI_MODEL;
const directories: string[] = [];
afterEach(() => {
  mock.restoreAll(); env.AI_PRIVACY_REVIEW_MANIFEST = originalManifest;
  env.VERTEX_AI_API_KEY = originalKey; env.VERTEX_AI_MODEL = originalModel;
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function directory() { const result = mkdtempSync(path.join(tmpdir(), "icheertor-privacy-qa-")); directories.push(result); return result; }
const prepared = {
  pdf: { bytes: Buffer.from("%PDF-synthetic-scanned-image"), entry: { name: "tor.pdf" } },
  biddingDoc: { fileName: "doc.pdf", text: "Contact qa@example.invalid นาย สมชาย ใจดี 081-234-5678" },
} as PreparedDocuments;
const context = { title: "QA website", agencyName: "QA", fileName: "tor.pdf", documentKind: "tor" };
function approve(parts: ReturnType<typeof buildModelParts>, reviewedAt = new Date().toISOString()) {
  const file = path.join(directory(), "review.json");
  writeFileSync(file, JSON.stringify({ version: 1, approvals: parts.map(part => {
    const { kind, sha256 } = payloadFingerprint(part); return { kind, sha256, piiRemoved: true, reviewedAt };
  }) }));
  env.AI_PRIVACY_REVIEW_MANIFEST = file;
}
test("PII-05: scrub obvious identifiers including Thai digits, preserve amounts and month/legal words", () => {
  const source = "นาย สมชาย ใจดี\nqa@example.invalid ๐๘๑-๒๓๔-๕๖๗๘ 1-2345-67890-12-3\nมิถุนายน นายจ้าง งบ 1,000,000 บาท";
  const result = redactPersonalText(source);
  for (const token of ["สมชาย", "ใจดี", "qa@example.invalid", "081-234", "67890"]) assert.equal(result.includes(token), false);
  for (const token of ["มิถุนายน", "นายจ้าง", "1,000,000"]) assert.equal(result.includes(token), true);
});
test("PII-06: PDF including an uninspected scan and prompt are refused before any API client call", async () => {
  env.AI_PRIVACY_REVIEW_MANIFEST = "";
  await assert.rejects(callModel(activePrompt, prepared, context), PrivacyReviewRequiredError);
  env.AI_PRIVACY_REVIEW_MANIFEST = path.join(directory(), "missing.json");
  await assert.rejects(callModel(activePrompt, prepared, context), PrivacyReviewRequiredError);
});
test("PII-07: every exact PDF and rendered-text part requires approval; altered bytes refused", () => {
  const parts = buildModelParts(activePrompt, prepared, context);
  approve(parts.slice(0, 1)); assert.throws(() => assertPayloadReviewed(parts), PrivacyReviewRequiredError);
  approve(parts); assert.doesNotThrow(() => assertPayloadReviewed(parts));
  assert.throws(() => assertPayloadReviewed([{ text: "changed" }, parts[0]]), PrivacyReviewRequiredError);
  assert.throws(() => assertPayloadReviewed([{ inlineData: { mimeType: "application/pdf", data: Buffer.from("changed scan").toString("base64") } }, parts[1]]), PrivacyReviewRequiredError);
});
test("PII-08: stale, future, false and malformed approvals cannot authorize a payload", () => {
  const parts = buildModelParts(activePrompt, prepared, context);
  for (const date of ["invalid", new Date(Date.now() - 31 * 86400000).toISOString(), new Date(Date.now() + 86400000).toISOString()]) {
    approve(parts, date); assert.throws(() => assertPayloadReviewed(parts), PrivacyReviewRequiredError);
  }
  approve(parts);
  const file = JSON.parse(readFileSync(env.AI_PRIVACY_REVIEW_MANIFEST, "utf8")); file.approvals[0].piiRemoved = false;
  writeFileSync(env.AI_PRIVACY_REVIEW_MANIFEST, JSON.stringify(file));
  assert.throws(() => assertPayloadReviewed(parts), PrivacyReviewRequiredError);
});
test("PII-09: approved synthetic payload reaches mocked SDK with scrubbed text/output", async () => {
  env.VERTEX_AI_API_KEY = "synthetic-qa-key"; env.VERTEX_AI_MODEL = "synthetic-qa-model";
  const parts = buildModelParts(activePrompt, prepared, context); approve(parts);
  const invoke = mock.method(getVertexClient().models, "generateContent", async (request: any) => {
    const text = request.contents[0].parts[1].text;
    assert.equal(text.includes("qa@example.invalid"), false); assert.equal(text.includes("สมชาย"), false);
    return { text: JSON.stringify({ summary: "qa@example.invalid 081-234-5678", confidence: 0.8 }), usageMetadata: {} };
  });
  const output = await callModel<any>(activePrompt, prepared, context);
  assert.equal(invoke.mock.callCount(), 1); assert.equal(output.output.summary.includes("qa@example.invalid"), false);
  assert.equal(output.output.summary.includes("081-234"), false); assert.equal(output.output.confidence, 0.8);
});
test("PII-10: local review exports are unapproved, preserve bytes and never overwrite", () => {
  const parts = buildModelParts(activePrompt, prepared, context), target = directory();
  writePayloadReview(parts, target);
  const manifest = JSON.parse(readFileSync(path.join(target, "review.json"), "utf8"));
  assert.equal(manifest.approvals.every((entry: any) => entry.piiRemoved === false), true);
  assert.deepEqual(readFileSync(path.join(target, "part-1.pdf")), prepared.pdf!.bytes);
  assert.throws(() => writePayloadReview(parts, target), /EEXIST/);
});

test("PII-11: a locally redacted replacement is sent instead of the original scan", async () => {
  env.VERTEX_AI_API_KEY = "synthetic-qa-key"; env.VERTEX_AI_MODEL = "synthetic-qa-model";
  const parts = buildModelParts(activePrompt, prepared, context); approve(parts);
  const clean = Buffer.from("%PDF-synthetic-redacted-image");
  const replacement = path.join(directory(), "clean.pdf"); writeFileSync(replacement, clean);
  const manifest = JSON.parse(readFileSync(env.AI_PRIVACY_REVIEW_MANIFEST, "utf8"));
  manifest.approvals[0].sourceSha256 = payloadFingerprint(parts[0]).sha256;
  manifest.approvals[0].sha256 = payloadFingerprint({ inlineData: { mimeType: "application/pdf", data: clean.toString("base64") } }).sha256;
  manifest.approvals[0].filePath = replacement;
  writeFileSync(env.AI_PRIVACY_REVIEW_MANIFEST, JSON.stringify(manifest));
  const invoke = mock.method(getVertexClient().models, "generateContent", async (request: any) => {
    assert.deepEqual(Buffer.from(request.contents[0].parts[0].inlineData.data, "base64"), clean);
    return { text: "{}", usageMetadata: {} };
  });
  const result = await callModel(activePrompt, prepared, context);
  assert.equal(result.inputPdf?.sha256, manifest.approvals[0].sha256); assert.equal(invoke.mock.callCount(), 1);
  writeFileSync(replacement, "changed after review");
  await assert.rejects(callModel(activePrompt, prepared, context), PrivacyReviewRequiredError);
  assert.equal(invoke.mock.callCount(), 1);
});
