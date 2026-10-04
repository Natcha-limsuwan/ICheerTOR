/**
 * Run TOR extraction for the records waiting in the queue, and save results.
 *
 * Vertex AI is only ever called from here — never inside an API request (a
 * TOR takes 20–95 s, and express mode has a small per-minute quota). The API
 * reads what this script stored.
 *
 * Queue: open projects (public hearing first, soonest hearing close first)
 * whose extractionStatus is "pending", plus "processing" ones whose lock
 * expired (a crashed run). Each record is claimed with a lock before the
 * call, so two runs never pay for the same TOR.
 *
 * --refresh-dates does not call the model. For extracted records whose
 * submission date is still "pending" it re-reads the e-GP announcement: the
 * date is filled in once the agency fixes it. If the TOR file itself changed
 * (a new version was published), the record goes back to the queue.
 *
 * Usage (in container):
 *   docker compose --profile tools run --rm tools npm run extract -- --dry-run
 *   docker compose --profile tools run --rm tools npm run extract -- --limit=10
 *   ... npm run extract -- --only=69049037973
 *   ... npm run extract -- --retry-failed          # also failed ones under the attempt cap
 *   ... npm run extract -- --only=69049037973 --force   # take over a record a stopped run left locked
 *   ... npm run extract -- --refresh-dates         # no model calls
 */

import { config } from "dotenv";
config({ path: ".env" });

import mongoose, { type Types } from "mongoose";

import TORRecord, { type ITORRecord } from "../src/db/models/tor-record";
import ExtractionLog from "../src/db/models/extraction-log";
import { extractTor, prepareDocuments } from "../src/services/ai/tor-parser";
import { activePrompt } from "../src/services/ai/prompts";
import { getModelId } from "../src/services/ai/vertex-client";
import { fetchProjectArchive } from "../src/services/ingestion/egp-client";

/* ─── Args ──────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const LIMIT = Number(arg("limit") ?? 10);
const ONLY = arg("only");
/** Seconds between model calls — express mode's quota is per minute. */
const DELAY_S = Number(arg("delay") ?? 20);
const DRY_RUN = argv.includes("--dry-run");
const RETRY_FAILED = argv.includes("--retry-failed");
const REFRESH_DATES = argv.includes("--refresh-dates");
/** With --only: ignore the lock of a run that was stopped (Ctrl+C) mid-call. */
const FORCE = argv.includes("--force") && Boolean(ONLY);

/** Give up on a record after this many failed attempts. */
const MAX_ATTEMPTS = 3;
/** Longer than one call with all its retries (3 × 180 s + back-off). */
const LOCK_MS = 15 * 60 * 1000;
const OPEN_PHASES = ["public_hearing", "bidding"] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtS = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/* ─── Queue ─────────────────────────────────────────────────────────── */

type QueueRecord = Pick<
  ITORRecord,
  "title" | "agencyName" | "phase" | "budget" | "medianPrice" | "publicHearingEnd" | "postingDate" | "extraction" | "extractionStatus" | "metadata" | "sourceDocuments" | "parsedData"
> & { _id: Types.ObjectId };

const QUEUE_FIELDS =
  "title agencyName phase budget medianPrice publicHearingEnd postingDate extraction extractionStatus metadata sourceDocuments";

async function loadQueue(): Promise<QueueRecord[]> {
  const now = new Date();
  const waiting: Record<string, unknown>[] = [
    { extractionStatus: "pending" },
    FORCE
      ? { extractionStatus: "processing" }
      : { extractionStatus: "processing", "extraction.lockedUntil": { $lt: now } },
  ];
  if (RETRY_FAILED) waiting.push({ extractionStatus: "failed", "extraction.attempts": { $lt: MAX_ATTEMPTS } });

  const records = (await TORRecord.find({
    "metadata.projectId": ONLY ?? { $exists: true },
    // --only runs whatever phase the project is in.
    ...(ONLY ? {} : { phase: { $in: OPEN_PHASES } }),
    $or: waiting,
  })
    .select(QUEUE_FIELDS)
    .lean()) as unknown as QueueRecord[];

  // Public hearing first — the window for comments is short — then the
  // soonest hearing close, then the newest.
  const rank = (r: QueueRecord) => (r.phase === "public_hearing" ? 0 : 1);
  const LAST = 8.64e15; // max Date — records without a hearing close go last
  const ts = (d: Date | undefined, missing: number) => (d ? new Date(d).getTime() : missing);
  return records
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        ts(a.publicHearingEnd, LAST) - ts(b.publicHearingEnd, LAST) ||
        ts(b.postingDate, 0) - ts(a.postingDate, 0),
    )
    .slice(0, LIMIT);
}

/** Take the record, or return null if another run already has it. */
async function claim(r: QueueRecord): Promise<boolean> {
  const now = new Date();
  const res = await TORRecord.updateOne(
    {
      _id: r._id,
      extractionStatus: r.extractionStatus,
      ...(FORCE ? {} : { $or: [{ "extraction.lockedUntil": null }, { "extraction.lockedUntil": { $lt: now } }] }),
    },
    { $set: { extractionStatus: "processing", "extraction.lockedUntil": new Date(now.getTime() + LOCK_MS) } },
  );
  return res.modifiedCount === 1;
}

/* ─── Extraction ────────────────────────────────────────────────────── */

type RunResult = "completed" | "skipped" | "failed" | "stop";

async function extractOne(r: QueueRecord): Promise<RunResult> {
  const projectNumber = r.metadata!.projectId!;
  const t0 = Date.now();
  const outcome = await extractTor(
    {
      projectNumber,
      title: r.title,
      agencyName: r.agencyName,
      phase: r.phase,
      budget: r.budget ?? null,
      medianPriceFromSource: r.medianPrice ?? null,
    },
    (message) => console.log(`    ${fmtS(Date.now() - t0).padStart(7)}  ${message}`),
  );
  process.stdout.write("    ");
  const durationMs = Date.now() - t0;
  let modelVersion = "unknown";
  try {
    modelVersion = getModelId();
  } catch {
    /* reported by the failure below */
  }

  if (outcome.status === "completed") {
    const { update, meta } = outcome;
    await TORRecord.updateOne(
      { _id: r._id },
      {
        $set: {
          parsedData: update.parsedData,
          summary: update.summary,
          redFlags: update.redFlags,
          sourceDocuments: update.sourceDocuments,
          ...(update.submissionDeadline ? { submissionDeadline: update.submissionDeadline } : {}),
          extractionStatus: "completed",
          extraction: {
            promptVersion: meta.promptVersion,
            modelVersion: meta.modelVersion,
            extractedAt: new Date(),
            attempts: 0,
            needsReview: meta.needsReview,
            durationMs: meta.durationMs,
            inputTokens: meta.inputTokens,
            outputTokens: meta.outputTokens,
            issues: meta.issues.map(({ severity, field, message }) => ({ severity, field, message })),
          },
        },
        $unset: {
          extractionError: 1,
          ...(update.submissionDeadline ? {} : { submissionDeadline: 1 }),
        },
      },
    );
    await ExtractionLog.create({
      torRecordId: r._id,
      promptVersion: meta.promptVersion,
      modelVersion: meta.modelVersion ?? modelVersion,
      success: true,
      durationMs: meta.durationMs ?? durationMs,
      usage: { inputTokens: meta.inputTokens, outputTokens: meta.outputTokens },
      pdfSha256: outcome.pdf?.sha256,
      pdfSizeBytes: outcome.pdf?.sizeBytes,
      rawResponse: outcome.rawResponse,
    });
    const k = update.parsedData.keyDates!;
    const date = k.submissionDate.status === "confirmed" ? k.submissionDate.date : "ยังไม่ประกาศ";
    console.log(
      `✓ ${fmtS(durationMs)} | คุณสมบัติ ${update.parsedData.qualifications.length} | ` +
        `ยื่น ${date} | red flag ${update.redFlags.length}` +
        `${meta.needsReview ? " | ⚠ ควรตรวจ" : ""} | token ${meta.inputTokens}/${meta.outputTokens}`,
    );
    return "completed";
  }

  if (outcome.status === "skipped") {
    await TORRecord.updateOne(
      { _id: r._id },
      {
        $set: {
          extractionStatus: "skipped",
          "extraction.skipReason": outcome.skipReason,
          sourceDocuments: outcome.sourceDocuments,
        },
        $unset: { "extraction.lockedUntil": 1 },
      },
    );
    console.log(`– ข้าม: ${outcome.skipReason}`);
    return "skipped";
  }

  // Failed. Quota and outages send the record back to the queue; other
  // errors count towards the attempt cap.
  const attempts = (r.extraction?.attempts ?? 0) + 1;
  const giveUp = !outcome.retryable || attempts >= MAX_ATTEMPTS;
  await TORRecord.updateOne(
    { _id: r._id },
    {
      $set: {
        extractionStatus: giveUp ? "failed" : "pending",
        extractionError: outcome.error.slice(0, 500),
        "extraction.attempts": attempts,
      },
      $unset: { "extraction.lockedUntil": 1 },
    },
  );
  await ExtractionLog.create({
    torRecordId: r._id,
    promptVersion: activePrompt.version,
    modelVersion,
    success: false,
    error: outcome.error.slice(0, 2000),
    errorCode: outcome.errorCode,
    durationMs,
  });
  console.log(`✗ ${outcome.errorCode}: ${outcome.error.slice(0, 120)}${giveUp ? "" : " (กลับเข้าคิว)"}`);
  // No point burning through the queue while the quota is gone or Vertex is down.
  return outcome.errorCode === "rate_limited" || outcome.errorCode === "circuit_open" ? "stop" : "failed";
}

/* ─── Refreshing dates (no model) ───────────────────────────────────── */

async function refreshDates(): Promise<void> {
  const records = (await TORRecord.find({
    "metadata.projectId": ONLY ?? { $exists: true },
    ...(ONLY ? {} : { phase: { $in: OPEN_PHASES } }),
    extractionStatus: "completed",
    // --only re-reads one project even when its date is already confirmed.
    ...(ONLY ? {} : { "parsedData.keyDates.submissionDate.status": { $ne: "confirmed" } }),
  })
    .select(`${QUEUE_FIELDS} parsedData.keyDates`)
    .limit(LIMIT)
    .lean()) as unknown as QueueRecord[];

  console.log(`[dates] วันยื่นที่ยังไม่ประกาศ ${records.length} โครงการ${DRY_RUN ? " | DRY RUN" : ""}\n`);
  let confirmed = 0;
  let requeued = 0;
  for (const r of records) {
    const pn = r.metadata!.projectId!;
    process.stdout.write(`  ${pn} ... `);
    if (DRY_RUN) {
      console.log(r.title.slice(0, 60));
      continue;
    }
    try {
      const archive = await fetchProjectArchive(pn);
      if (!archive) {
        console.log("ไม่มีชุดเอกสาร");
        continue;
      }
      const prepared = await prepareDocuments(archive.zip, {
        zipFileName: archive.info.fileName,
        stage: archive.info.stage,
      });

      // A new TOR file means the requirements may have changed: extract again.
      const oldTor = r.sourceDocuments?.find((d) => d.kind === "tor")?.sha256;
      const newTor = prepared.sourceDocuments.find((d) => d.kind === "tor")?.sha256;
      if (oldTor && newTor && oldTor !== newTor) {
        await TORRecord.updateOne({ _id: r._id }, { $set: { extractionStatus: "pending" } });
        requeued++;
        console.log("TOR เปลี่ยน → เข้าคิวอ่านใหม่");
        continue;
      }

      const { submissionDate, contractDuration, documentStage, announcedDate, documentFeePeriod, announcementDates } =
        prepared.facts;
      // Announcement facts are refreshed as a set: a final announcement
      // replaces everything read from the draft.
      const set: Record<string, unknown> = {
        "parsedData.keyDates.documentStage": documentStage,
        "parsedData.keyDates.announcedDate": announcedDate,
        "parsedData.keyDates.documentFeePeriod": documentFeePeriod,
        "parsedData.keyDates.announcementDates": announcementDates,
      };
      if (submissionDate.status === "confirmed") {
        set["parsedData.keyDates.submissionDate"] = submissionDate;
        set.submissionDeadline = submissionDate.closesAt;
        confirmed++;
      }
      if (contractDuration && r.parsedData?.keyDates?.contractDurationDays?.source !== "bidding_doc") {
        set["parsedData.keyDates.contractDurationDays"] = {
          value: contractDuration.days,
          confidence: 1,
          rawText: contractDuration.rawText,
          source: "bidding_doc",
        };
      }
      await TORRecord.updateOne({ _id: r._id }, { $set: set });
      console.log(
        submissionDate.status === "confirmed"
          ? `ยื่น ${submissionDate.date} ${submissionDate.startTime}–${submissionDate.endTime}`
          : documentStage === "draft"
            ? "ยังเป็นร่าง — ยังไม่ประกาศวันยื่น"
            : "ประกาศแล้วแต่ยังไม่ระบุวันยื่น",
      );
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message : e}`);
    }
    await sleep(2000); // e-GP's WAF blocks rapid requests
  }
  console.log(`\n[dates] ได้วันยื่นเพิ่ม ${confirmed} | TOR เปลี่ยนต้องอ่านใหม่ ${requeued}`);
}

/* ─── Main ──────────────────────────────────────────────────────────── */

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ต้องมี MONGODB_URI ใน .env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  if (REFRESH_DATES) {
    await refreshDates();
    await mongoose.disconnect();
    return;
  }

  const queue = await loadQueue();
  console.log(
    `[extract] prompt ${activePrompt.version} | ${queue.length} โครงการ` +
      `${DRY_RUN ? " | DRY RUN" : ` | เว้น ${DELAY_S} วินาทีระหว่างฉบับ`}\n`,
  );

  const counts: Record<RunResult, number> = { completed: 0, skipped: 0, failed: 0, stop: 0 };
  for (const [i, r] of queue.entries()) {
    const label = `  [${i + 1}/${queue.length}] ${r.metadata?.projectId} ${r.phase.padEnd(14)} ${r.title.slice(0, 50)}`;
    if (DRY_RUN) {
      console.log(label);
      continue;
    }
    if (!(await claim(r))) {
      console.log(`${label}\n    – มี run อื่นกำลังอ่านอยู่ (ถ้า run นั้นถูกหยุดไปแล้ว ใช้ --only=<เลขโครงการ> --force)`);
      continue;
    }
    console.log(label);
    const result = await extractOne(r);
    counts[result]++;
    if (result === "stop") {
      console.log("\n  หยุด: โควตา Vertex หมดหรือ Vertex ไม่พร้อม — รันใหม่ภายหลัง");
      break;
    }
    if (result !== "skipped" && i < queue.length - 1) await sleep(DELAY_S * 1000);
  }

  if (!DRY_RUN) {
    console.log(
      `\n[extract] สำเร็จ ${counts.completed} | ข้าม ${counts.skipped} | ล้มเหลว ${counts.failed + counts.stop}`,
    );
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("\n[fatal]", e);
  await mongoose.disconnect();
  process.exit(1);
});
