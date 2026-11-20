/** Bounded localhost-only load test. Never uses .env DB or third-party services. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import type { Express } from "express";
import type { Server } from "node:http";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env.js";
import { connectDB } from "../../src/db/connection.js";
import User from "../../src/db/models/user.js";
import TORRecord from "../../src/db/models/tor-record.js";

const output = path.resolve(process.env.TEST_EVIDENCE_DIR ?? "../docs/testing/evidence");
const database = `icheertor_qa_load_${randomUUID().replaceAll("-", "")}`;
const records = 5000, registeredUsers = 1000, minimumRequestsPerUser = 20, maximumRequestsPerUser = 5000;
const p95LimitMs = 2000; // Local demo acceptance budget, not a numeric SRS requirement.
const scenarios: any[] = [];
let server: Server | undefined, cleaned = false, failed = false;
const startedAt = new Date().toISOString();
async function main() {
  mkdirSync(output, { recursive: true });
  env.MONGODB_URI = `mongodb://127.0.0.1:27019/${database}?serverSelectionTimeoutMS=3000`;
  env.JWT_SECRET = randomUUID(); env.GOOGLE_CLIENT_ID = "load-synthetic-client"; env.GOOGLE_CLIENT_SECRET = "load-synthetic-secret";
  env.SMTP_USER = ""; env.SMTP_PASS = ""; env.VERTEX_AI_API_KEY = ""; env.SCRAPER_APPROVED_ORIGINS = [];
  await connectDB(); assert.equal(mongoose.connection.name, database);
  const users = await User.insertMany(Array.from({ length: registeredUsers }, (_, index) => ({
    googleId: `load-${index}`, email: `load-${index}@example.invalid`, name: `Load fixture ${index}`, role: "user", status: "active",
  })));
  const rows = await TORRecord.insertMany(Array.from({ length: records }, (_, index) => ({
    title: `Website procurement ${index}`, agencyName: `Synthetic agency ${index % 20}`, phase: "bidding",
    medianPrice: (index + 1) * 1000, budget: (index + 1) * 1000, postingDate: new Date("2026-11-01"),
    submissionDeadline: new Date("2030-01-01"), tags: ["open", "website"], extractionStatus: "completed",
    sourceUrl: "https://example.invalid/load", deduplicationHash: `load-${index}`,
    parsedData: { scopeOfWork: { content: "Website development for a synthetic agency", confidence: 0.9 },
      qualifications: [{ criterion: "Software team", type: "personnel", confidence: 0.9 }] },
    summary: { overview: "Website development", confidence: 0.9 },
  })));
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  assert.equal(await User.countDocuments(), registeredUsers); assert.equal(await TORRecord.countDocuments(), records);
  const tokens = users.slice(0, 50).map(user => jwt.sign({ id: user._id.toString() }, env.JWT_SECRET, { expiresIn: "10m" }));
  const { default: app } = await import("../../src/app.js") as unknown as { default: Express };
  server = await new Promise<Server>(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const address = server.address(); assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const routes = [
    "/api/tor?limit=20&sortBy=medianPrice&sortOrder=asc",
    "/api/tor?q=เว็บไซต์&budgetMin=500000&budgetMax=1000000&sortBy=medianPrice&sortOrder=asc",
    `/api/tor/${rows[0]._id}`,
    "/api/tor?includeMatch=true&openOnly=true&limit=20",
  ];
  const perform = async (route: string, token: string) => {
    const response = await fetch(origin + route, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200); const body = await response.json();
    if (route.includes("?")) {
      assert.equal(body.data.length, 20);
      if (route.includes("budgetMin")) {
        assert.equal(body.meta.total, 501);
        assert(body.data.every((row: any) => row.medianPrice >= 500000 && row.medianPrice <= 1000000));
      } else assert.equal(body.meta.total, records);
    } else assert.equal(body.data._id, rows[0]._id.toString());
  };
  for (const route of routes) await perform(route, tokens[0]); // Exclude initialization from measured runs.
  for (const concurrency of [1, 10, 50]) {
    const latencies: number[] = [], errors: Record<string, number> = {};
    let active = 0, maxInFlight = 0;
    const memoryBefore = process.memoryUsage().rss, begin = performance.now();
    const targetDurationMs = concurrency === 50 ? 30_000 : 10_000;
    await Promise.all(Array.from({ length: concurrency }, (_, worker) => (async () => {
      for (let index = 0; index < maximumRequestsPerUser && (index < minimumRequestsPerUser || performance.now() - begin < targetDurationMs); index++) {
        const t0 = performance.now(); active++; maxInFlight = Math.max(maxInFlight, active);
        try { await perform(routes[(worker + index) % routes.length], tokens[worker]); }
        catch (error) {
          const label = error instanceof assert.AssertionError ? "response_contract" : error instanceof Error && /timeout|abort/i.test(error.name) ? "timeout" : "request_error";
          errors[label] = (errors[label] ?? 0) + 1;
        } finally { active--; latencies.push(performance.now() - t0); }
      }
    })()));
    const durationMs = performance.now() - begin;
    latencies.sort((a, b) => a - b);
    const percentile = (p: number) => latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)];
    const errorCount = Object.values(errors).reduce((sum, count) => sum + count, 0);
    const result = { concurrency, distinctActiveUsers: concurrency, requests: latencies.length, maxInFlight, durationMs, targetDurationMs,
      requestsPerSecond: latencies.length / (durationMs / 1000), p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
      errors, errorCount, errorRate: errorCount / latencies.length, rssBeforeBytes: memoryBefore, rssAfterBytes: process.memoryUsage().rss,
      status: errorCount === 0 && percentile(0.95) <= p95LimitMs && maxInFlight === concurrency && durationMs >= targetDurationMs ? "PASS" : "FAIL" };
    scenarios.push(result); console.log(`${result.status} ${concurrency} users: ${latencies.length} requests, p95 ${result.p95Ms.toFixed(1)} ms, ${errorCount} errors`);
    if (result.status !== "PASS") failed = true;
  }
}
async function cleanup() {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, database); await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await mongoose.connection.dropDatabase(); await mongoose.disconnect(); cleaned = true;
  }
}
main().catch(() => { failed = true; console.error("Load setup/run failed; see recorded status. No credentials logged."); }).finally(async () => {
  try { await cleanup(); } catch { failed = true; console.error("Scratch database cleanup failed"); }
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, "load-results.json"), JSON.stringify({ startedAt, node: process.version, platform: os.platform(), arch: os.arch(),
    cpuCount: os.cpus().length, totalMemoryBytes: os.totalmem(), fixture: { registeredUsers, parsedTORs: records },
    minimumRequestsPerUser, maximumRequestsPerUser, routes: ["list", "bilingual search + price", "detail", "list + consent-aware matching"],
    acceptance: { p95Ms: p95LimitMs, allowedErrorRate: 0, concurrentUsers: 50, note: "p95 budget is a local demo criterion; SRS specifies 50 concurrent users, 1000 accounts and 5000 TORs without a numeric latency SLA." },
    scenarios, scratchDatabaseRemoved: cleaned, status: !failed && scenarios.length === 3 && cleaned ? "PASS" : "FAIL",
    limitations: "Bounded closed-loop localhost run: 10s at 1/10 users, 30s at 50 users, capped at 5000 requests/user. Not a soak/capacity or distributed production test. Does not prove queue architecture or AI/provider throughput. Frontend is not part of measured HTTP latency.",
  }, null, 2) + "\n");
  if (failed || !cleaned) process.exitCode = 1;
});
