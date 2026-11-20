/** Real Express + MongoDB query semantics. Scratch DB only on QA port 27019. */
import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { Server } from "node:http";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env.js";
import { connectDB } from "../../src/db/connection.js";
import User from "../../src/db/models/user.js";
import TORRecord from "../../src/db/models/tor-record.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipFixture, pdfFixture } from "../fixtures/documents.js";
import { extractionFixture } from "../fixtures/extraction.js";
import { prepareDocuments, buildModelParts, callModel, toRecordUpdate } from "../../src/services/ai/tor-parser.js";
import { activePrompt } from "../../src/services/ai/prompts/index.js";
import { payloadFingerprint } from "../../src/services/ai/payload-privacy.js";
import { getVertexClient } from "../../src/services/ai/vertex-client.js";
import { validateExtraction } from "../../src/services/ai/validate-extraction.js";
const database = `icheertor_qa_testing_${randomUUID().replaceAll("-", "")}`;
let server: Server | undefined, origin: string, token: string;
async function request(query: string) {
  const response = await fetch(`${origin}/api/tor${query}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  env.MONGODB_URI = `mongodb://127.0.0.1:27019/${database}?serverSelectionTimeoutMS=3000`;
  env.JWT_SECRET = randomUUID(); env.GOOGLE_CLIENT_ID = "synthetic-client"; env.GOOGLE_CLIENT_SECRET = "synthetic-secret";
  await connectDB();
  const user = await User.create({ googleId: "testing-search", email: "search@example.invalid", name: "Search fixture" });
  token = jwt.sign({ id: user._id.toString() }, env.JWT_SECRET, { expiresIn: "10m" });
  const fixtures = [
    { title: "Website development", agencyName: "Agency (QA)", medianPrice: 0, tags: ["open", "cloud"] },
    { title: "พัฒนาเว็บไซต์", agencyName: "Agency (QA)", medianPrice: 500000, tags: ["open", "cloud"] },
    { title: "Website maintenance", agencyName: "Other", medianPrice: 1000000, tags: ["open", "database"] },
    { title: "Database only", agencyName: "Other", medianPrice: 2000000, tags: ["open"], extractionStatus: "pending" as const },
    { title: "Website closed", agencyName: "Other", medianPrice: 750000, tags: ["closed"], phase: "awarded" as const, submissionDeadline: new Date("2020-01-01") },
  ];
  await TORRecord.create(fixtures.map((fixture, index) => ({ phase: "bidding" as const, postingDate: new Date("2026-11-01"),
    submissionDeadline: new Date("2030-01-01"), extractionStatus: "completed" as const, sourceUrl: `https://example.invalid/${index}`,
    deduplicationHash: `testing-${index}`, summary: { overview: "Software procurement" }, ...fixture })));
  const { default: app } = await import("../../src/app.js") as unknown as { default: Express };
  server = await new Promise<Server>(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const address = server.address(); assert(address && typeof address !== "string"); origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, database);
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
test("INT-01 #140: default parsed scope excludes pending while all/new include it", async () => {
  assert.equal((await request("")).body.meta.total, 4);
  assert.equal((await request("?scope=all")).body.meta.total, 5);
  assert.equal((await request("?scope=new")).body.meta.total, 5);
});
test("INT-02 #140: literal agency, phase, technology, keyword and inclusive prices compose", async () => {
  const result = await request("?q=website&agency=Agency%20(QA)&phase=bidding&techStack=cloud&budgetMin=500000&budgetMax=500000");
  assert.equal(result.status, 200); assert.equal(result.body.meta.total, 1); assert.equal(result.body.data[0].title, "พัฒนาเว็บไซต์");
});
test("INT-03 #140: explicit zero lower/upper bounds return a zero-price record", async () => {
  const result = await request("?budgetMin=0&budgetMax=0"); assert.equal(result.body.meta.total, 1); assert.equal(result.body.data[0].medianPrice, 0);
});
test("INT-04 #140: closed status and openOnly reflect deadlines and phase", async () => {
  const closed = await request("?status=closed"); assert.equal(closed.body.meta.total, 1); assert.equal(closed.body.data[0].phase, "awarded");
  const open = await request("?openOnly=true"); assert.equal(open.body.meta.total, 3); assert(open.body.data.every((row: any) => row.phase === "bidding"));
});
test("INT-05 #140: ascending/descending price sort and pagination preserve result order", async () => {
  const asc = await request("?sortBy=medianPrice&sortOrder=asc&limit=2");
  const next = await request("?sortBy=medianPrice&sortOrder=asc&limit=2&page=2");
  assert.deepEqual([...asc.body.data, ...next.body.data].map((row: any) => row.medianPrice), [0, 500000, 750000, 1000000]);
  assert.equal((await request("?sortBy=medianPrice&sortOrder=desc")).body.data[0].medianPrice, 1000000);
});
test("INT-06 #140: invalid prices, repeated query values and invalid scope are rejected", async () => {
  for (const query of ["budgetMin=-1", "budgetMax=Infinity", "budgetMin=2&budgetMax=1", "budgetMin=bad", "q=a&q=b", "agency=a&agency=b", "page=0", "limit=1.5", "scope=unknown"]) {
    assert.equal((await request(`?${query}`)).status, 400, query);
  }
});
test("INT-08 #140: bracketed Mongo operators are not interpreted as query objects", async () => {
  const result = await request("?agency[$ne]=a&q[$regex]=.*");
  assert.equal(result.status, 200); assert.equal(result.body.meta.total, 4);
});
test("INT-07 #140: no results and empty later page have valid metadata", async () => {
  const empty = await request("?q=zzzz-no-result"); assert.deepEqual(empty.body.data, []); assert.equal(empty.body.meta.total, 0);
  const later = await request("?page=999"); assert.deepEqual(later.body.data, []); assert.equal(later.body.meta.total, 4);
});
test("INT-09 #140: ZIP -> reviewed payload -> simulated LLM -> validation -> MongoDB -> API", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "icheertor-pipeline-test-"));
  const original = { key: env.VERTEX_AI_API_KEY, model: env.VERTEX_AI_MODEL, manifest: env.AI_PRIVACY_REVIEW_MANIFEST };
  try {
    const prepared = await prepareDocuments(zipFixture([{ name: "TOR.pdf", content: pdfFixture("Synthetic website scope and procurement qualifications. ".repeat(10)) }]));
    assert.equal(prepared.skipReason, undefined);
    const context = { title: "Synthetic parsed project", agencyName: "Synthetic agency", fileName: "TOR.pdf", documentKind: "tor" };
    const parts = buildModelParts(activePrompt, prepared, context);
    const manifest = path.join(directory, "review.json");
    await writeFile(manifest, JSON.stringify({ version: 1, approvals: parts.map(part => {
      const { kind, sha256 } = payloadFingerprint(part);
      return { kind, sha256, piiRemoved: true, reviewedAt: new Date().toISOString() };
    }) }));
    env.VERTEX_AI_API_KEY = "synthetic-key"; env.VERTEX_AI_MODEL = "synthetic-model"; env.AI_PRIVACY_REVIEW_MANIFEST = manifest;
    const provider = mock.method(getVertexClient().models, "generateContent", async () => ({ text: JSON.stringify(extractionFixture()), usageMetadata: {} }));
    const parsed = await callModel(activePrompt, prepared, context);
    const validated = validateExtraction(parsed.output, { budget: 2000000 });
    const update = toRecordUpdate(validated.output, prepared.facts, prepared.sourceDocuments, { phase: "bidding", budget: 2000000 });
    const record = await TORRecord.create({ ...context, ...update, phase: "bidding", postingDate: new Date("2026-11-01"),
      sourceUrl: "https://example.invalid/pipeline", extractionStatus: "completed", deduplicationHash: "pipeline-fixture" });
    const result = await request(`/${record._id}`);
    assert.equal(result.status, 200); assert.equal(result.body.data.summary.overview, "Develop a website");
    assert.equal(result.body.data.parsedData.qualifications[0].minimumValue, 600000);
    assert.equal(result.body.data.parsedData.qualifications[0].confidence, 0.92);
    assert.equal(result.body.data.parsedData.documentPrices.medianPrice.value, 1000000);
    assert.equal(result.body.data.parsedData.evaluationCriteria.confidence, 0.95);
    assert.equal(provider.mock.callCount(), 1); assert.equal(result.body.data.sourceDocuments.length, 1);
  } finally {
    mock.restoreAll(); env.VERTEX_AI_API_KEY = original.key; env.VERTEX_AI_MODEL = original.model; env.AI_PRIVACY_REVIEW_MANIFEST = original.manifest;
    await rm(directory, { recursive: true, force: true });
  }
});
