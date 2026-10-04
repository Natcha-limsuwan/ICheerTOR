/**
 * Check that Vertex AI is set up correctly, one layer at a time.
 *
 *   1. config       .env has project / location / model, key file is readable
 *   2. text         a one-line prompt round-trips (auth, API enabled, model id)
 *   3. pdf          (--pdf=<projectNumber>) a real e-GP TOR goes through the
 *                   same chain the pipeline will use: archive → pick TOR →
 *                   Gemini. Nothing is written to disk or to MongoDB.
 *
 * Each failure prints what usually causes it, so a setup mistake is found at
 * the step that caused it rather than deep inside the extraction pipeline.
 *
 * Usage (in container):
 *   docker compose --profile tools run --rm tools npx tsx scripts/vertex-smoke-test.ts
 *   docker compose --profile tools run --rm tools npx tsx scripts/vertex-smoke-test.ts --pdf=69049097411
 */

import { config } from "dotenv";
config({ path: ".env" });

import { existsSync, readFileSync } from "fs";

import { env } from "../src/config/env";
import {
  getAuthMode,
  getVertexClient,
  getModelId,
  VertexConfigError,
} from "../src/services/ai/vertex-client";
import { fetchProjectArchive } from "../src/services/ingestion/egp-client";
import { listEntries, readEntry } from "../src/services/ingestion/zip-reader";
import { pickDocument } from "../src/services/ingestion/document-picker";

const pdfArg = process.argv.find((a) => a.startsWith("--pdf="))?.split("=")[1];

/** Map the errors people actually hit during setup to what fixes them. */
function hint(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const express = getAuthMode() === "express";
  if (/API key not valid|API_KEY_INVALID|UNAUTHENTICATED|401/i.test(msg)) {
    return "API key ไม่ถูกต้อง — คัดลอก key จากหน้า express mode ใหม่ ใส่ VERTEX_AI_API_KEY โดยไม่มีช่องว่าง/เครื่องหมายคำพูด";
  }
  if (express && /PERMISSION_DENIED|403/i.test(msg)) {
    return "express mode ไม่รองรับ model นี้ หรือครบ 90 วันแล้ว — ลองรุ่นที่ Vertex AI Studio ของ express mode มีให้เลือก";
  }
  if (express && /NOT_FOUND|404/i.test(msg)) {
    return "ไม่พบ model — ใช้ model ID ตามที่ Vertex AI Studio (express mode) แสดง";
  }
  if (/Could not load the default credentials|ENOENT/i.test(msg)) {
    return "หา key ไม่เจอ — ตรวจ GOOGLE_APPLICATION_CREDENTIALS ว่าเป็น path ใน container (/app/secrets/gcp-key.json)";
  }
  if (/SERVICE_DISABLED|has not been used in project|API.*disabled/i.test(msg)) {
    return "ยังไม่ได้เปิด Vertex AI API — ไปที่ APIs & Services แล้ว Enable \"Vertex AI API\"";
  }
  if (/BILLING|billing/i.test(msg)) {
    return "project ยังไม่ได้ผูก billing account";
  }
  if (/PERMISSION_DENIED|403/i.test(msg)) {
    return "service account ไม่มีสิทธิ์ — ให้ role \"Vertex AI User\" (roles/aiplatform.user) ใน project นี้";
  }
  if (/NOT_FOUND|404|was not found|does not have access/i.test(msg)) {
    return "ไม่พบ model — ตรวจ VERTEX_AI_MODEL ให้ตรงกับ Model Garden และลองตั้ง VERTEX_AI_LOCATION=global";
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg)) {
    return "ติด quota/rate limit — รอสักครู่แล้วลองใหม่ หรือขอเพิ่ม quota";
  }
  return "ดูข้อความ error ด้านบน";
}

function fail(step: string, error: unknown): never {
  const msg = error instanceof Error ? error.message : String(error);
  console.log(`  ✗ ${step}\n    ${msg.slice(0, 400)}\n    → ${hint(error)}`);
  process.exit(1);
}

async function main() {
  /* ─── 1. Config ─────────────────────────────────────────────────── */

  console.log("[1] config");
  const mode = getAuthMode();
  if (mode === "express") {
    const k = env.VERTEX_AI_API_KEY;
    console.log(`  mode     express (API key ${k.slice(0, 3)}…${k.slice(-2)})`);
    console.log(`  model    ${env.VERTEX_AI_MODEL || "(ว่าง)"}`);
  } else {
    console.log("  mode     project (service account)");
    console.log(`  project  ${env.VERTEX_AI_PROJECT_ID || "(ว่าง)"}`);
    console.log(`  location ${env.VERTEX_AI_LOCATION || "(ว่าง)"}`);
    console.log(`  model    ${env.VERTEX_AI_MODEL || "(ว่าง)"}`);
  }

  const keyPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (mode === "express") {
    // The API key is the whole credential; a key file is not read.
  } else if (keyPath) {
    if (!existsSync(keyPath)) {
      fail("key file", new Error(`ENOENT: ไม่พบไฟล์ ${keyPath}`));
    }
    try {
      const key = JSON.parse(readFileSync(keyPath, "utf-8")) as { client_email?: string; project_id?: string };
      console.log(`  key      ${key.client_email ?? "?"}`);
      if (key.project_id && key.project_id !== env.VERTEX_AI_PROJECT_ID) {
        // Not fatal — a key may be granted access to another project — but usually a typo.
        console.log(`  ! key มาจาก project "${key.project_id}" ไม่ตรงกับ VERTEX_AI_PROJECT_ID`);
      }
    } catch (e) {
      fail("key file อ่านเป็น JSON ไม่ได้", e);
    }
  } else {
    console.log("  key      (ไม่ได้ตั้ง — จะใช้ gcloud application-default login ถ้ามี)");
  }

  let ai: ReturnType<typeof getVertexClient>;
  let model: string;
  try {
    ai = getVertexClient();
    model = getModelId();
  } catch (e) {
    if (e instanceof VertexConfigError) fail("config", e);
    throw e;
  }
  console.log("  ✓ ครบ");

  /* ─── 2. Text round-trip ────────────────────────────────────────── */

  console.log("\n[2] text");
  try {
    const t0 = Date.now();
    const res = await ai.models.generateContent({
      model,
      contents: "ตอบกลับคำเดียวว่า OK",
      config: { temperature: 0, maxOutputTokens: 256, abortSignal: AbortSignal.timeout(60_000) },
    });
    const u = res.usageMetadata;
    console.log(`  ✓ "${res.text?.trim()}" ใน ${Date.now() - t0} ms (tokens in ${u?.promptTokenCount} / out ${u?.candidatesTokenCount})`);
  } catch (e) {
    fail("เรียก Gemini ไม่สำเร็จ", e);
  }

  if (!pdfArg) {
    console.log("\nผ่าน — ลองต่อด้วย --pdf=<projectNumber> เพื่อทดสอบกับ TOR จริง");
    return;
  }

  /* ─── 3. Real TOR PDF ───────────────────────────────────────────── */

  console.log(`\n[3] pdf จากโครงการ ${pdfArg}`);
  let pdf: Buffer;
  try {
    const archive = await fetchProjectArchive(pdfArg);
    if (!archive) fail("e-GP", new Error("โครงการนี้ไม่มีชุดเอกสารเผยแพร่"));
    const entries = listEntries(archive.zip);
    const pick = pickDocument(entries);
    if (!pick.best) fail("เลือกเอกสาร", new Error(pick.skipReason ?? "ไม่มีเอกสารที่ใช้ได้"));
    const entry = entries.find((e) => e.rawName === pick.best!.rawName)!;
    pdf = readEntry(archive.zip, entry);
    console.log(`  ✓ ${archive.info.fileName} → ${pick.best.name} (${pick.best.kind}, ${(pdf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    fail("ดึงเอกสารจาก e-GP ไม่สำเร็จ", e);
  }

  try {
    const t0 = Date.now();
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } },
            { text: "เอกสารนี้คือ TOR การจัดซื้อจัดจ้างของ กทม. ตอบเป็น JSON ตาม schema" },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            isTor: { type: "BOOLEAN" },
            pageCount: { type: "INTEGER" },
            projectName: { type: "STRING" },
            summary: { type: "STRING", description: "สรุปขอบเขตงาน 2-3 ประโยค ภาษาไทย" },
          },
          required: ["isTor", "pageCount", "projectName", "summary"],
        },
        abortSignal: AbortSignal.timeout(180_000),
      },
    });
    const u = res.usageMetadata;
    console.log(`  ✓ ${Date.now() - t0} ms | tokens in ${u?.promptTokenCount} / out ${u?.candidatesTokenCount}`);
    console.log(JSON.stringify(JSON.parse(res.text ?? "{}"), null, 2).replace(/^/gm, "    "));
  } catch (e) {
    fail("ส่ง PDF ให้ Gemini ไม่สำเร็จ", e);
  }

  console.log("\nผ่านทุกขั้น — พร้อมทำ extraction pipeline");
}

main().catch((e) => fail("unexpected", e));
