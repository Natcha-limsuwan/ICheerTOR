/**
 * Poll the CGD e-GP RSS feed for new announcements nationwide.
 *
 * Each poll fetches the draft-for-hearing (B0) and invitation (D0) feeds,
 * finds project numbers not seen in the previous window, and keeps only those
 * whose title is confidently software work (rss_candidates). --ingest then
 * turns new candidates into TORRecords for the extraction queue.
 *
 * The feed shows only the newest 20 items, so it must be polled often
 * (~15 min in office hours). Each poll warns when the window moved past
 * everything seen before — a sign items were missed.
 *
 * Usage (in container):
 *   docker compose --profile tools run --rm tools npm run rss -- --dry-run      # fetch and show, write nothing
 *   docker compose --profile tools run --rm tools npm run rss                   # one poll, store candidates
 *   docker compose --profile tools run --rm tools npm run rss -- --ingest       # one poll + create records
 *   docker compose --profile tools run --rm tools npm run rss -- --ingest-only  # create records from stored candidates
 *   docker compose --profile tools run --rm tools npm run rss -- --watch --ingest   # every 15 min, Mon–Fri 08:30–17:00
 *   docker compose --profile tools run --rm tools npm run rss -- --report       # what has been seen and kept
 *
 * Options: --types=B0,D0  --interval=15 (minutes)  --hours=08:30-17:00  --all-days
 */

import { config } from "dotenv";
config({ path: ".env" });

import mongoose from "mongoose";

import RssCandidate from "../src/db/models/rss-candidate";
import RssPollState from "../src/db/models/rss-poll-state";
import { RSS_TYPES, type RssAnnounceType } from "../src/services/ingestion/egp-rss-client";
import { pollOnce } from "../src/services/ingestion/rss-poll";
import { ingestCandidate } from "../src/services/ingestion/rss-ingest";

const argv = process.argv.slice(2);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const DRY_RUN = argv.includes("--dry-run");
const INGEST = argv.includes("--ingest");
const INGEST_ONLY = argv.includes("--ingest-only");
const WATCH = argv.includes("--watch");
const REPORT = argv.includes("--report");
const ALL_DAYS = argv.includes("--all-days");
const INTERVAL_MIN = Number(arg("interval") ?? 15);
const [HOURS_FROM, HOURS_TO] = (arg("hours") ?? "08:30-17:00").split("-");
const TYPES = (arg("types") ?? "B0,D0").split(",").map((t) => t.trim()) as RssAnnounceType[];

for (const t of TYPES) {
  if (!(t in RSS_TYPES)) {
    console.error(`ไม่รู้จักประเภท ${t} — ใช้ได้: ${Object.keys(RSS_TYPES).join(", ")}`);
    process.exit(1);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false });
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Office hours in Bangkok, Mon–Fri unless --all-days. */
function inWindow(now = new Date()): boolean {
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  const day = bkk.getUTCDay();
  if (!ALL_DAYS && (day === 0 || day === 6)) return false;
  const m = bkk.getUTCHours() * 60 + bkk.getUTCMinutes();
  return m >= minutes(HOURS_FROM) && m <= minutes(HOURS_TO);
}

async function poll(): Promise<void> {
  const results = await pollOnce(TYPES, {
    dryRun: DRY_RUN,
    onRetry: (type, attempt, waitMs) => console.log(`  ${type}: ลองใหม่ครั้งที่ ${attempt + 1} หลังรอ ${waitMs / 1000} วินาที`),
  });
  for (const r of results) {
    if (!r.ok) {
      console.log(`  ✗ ${r.announceType}: ${r.error}`);
      continue;
    }
    console.log(
      `  ${r.announceType} วันนี้ ${r.countByDay ?? "?"} | ได้ ${r.items} | ใหม่ ${r.fresh} | เก็บ ${r.kept} | ก้ำกึ่ง ${r.uncertain}` +
        (r.gap ? " | ⚠ อาจมีรายการหลุด — ควรดึงถี่ขึ้น" : ""),
    );
    for (const k of r.keptItems) console.log(`      + ${k.projectNumber} (${k.score}) ${k.title.slice(0, 80)}`);
    for (const p of r.promoted) console.log(`      → ${p} ออกประกาศเชิญชวนแล้ว: public_hearing → bidding`);
  }
}

async function ingest(): Promise<void> {
  const queue = await RssCandidate.find({ status: "new" }).sort({ firstSeenAt: 1 }).limit(50);
  if (!queue.length) return;
  console.log(`  [ingest] ${queue.length} รายการ`);
  for (const c of queue) {
    try {
      const { result, note } = await ingestCandidate(c);
      console.log(`    ${result.padEnd(7)} ${c.projectNumber} ${note ?? ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await RssCandidate.updateOne(
        { _id: c._id },
        { $set: { status: c.attempts + 1 >= 5 ? "failed" : "new", note: msg.slice(0, 300) }, $inc: { attempts: 1 } },
      );
      console.log(`    failed  ${c.projectNumber} ${msg.slice(0, 120)}`);
    }
    await sleep(2_000); // e-GP's document service is shared too
  }
}

async function report(): Promise<void> {
  for (const s of await RssPollState.find().lean()) {
    console.log(
      `${s.announceType}: ดึง ${s.stats.polls} ครั้ง (พลาด ${s.stats.failures}) | ใหม่ ${s.stats.seen} | เก็บ ${s.stats.kept} | ` +
        `ก้ำกึ่ง ${s.stats.uncertain} | อาจหลุด ${s.stats.gaps} ครั้ง | สำเร็จล่าสุด ${s.lastSuccessAt?.toISOString() ?? "-"}` +
        (s.lastError ? ` | error ล่าสุด: ${s.lastError.slice(0, 80)}` : ""),
    );
  }
  const byStatus = await RssCandidate.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]);
  console.log("candidates:", byStatus.map((x) => `${x._id} ${x.n}`).join(", ") || "-");
  for (const c of await RssCandidate.find().sort({ firstSeenAt: -1 }).limit(15).lean()) {
    console.log(`  ${c.status.padEnd(8)} ${c.projectNumber} ${c.announceType} ${c.title.slice(0, 70)}${c.note ? ` — ${c.note.slice(0, 40)}` : ""}`);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ต้องมี MONGODB_URI ใน .env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  if (REPORT) {
    await report();
  } else if (INGEST_ONLY) {
    await ingest();
  } else if (!WATCH) {
    console.log(`[rss] ${stamp()} | ${TYPES.join(", ")}${DRY_RUN ? " | DRY RUN" : ""}`);
    await poll();
    if (INGEST && !DRY_RUN) await ingest();
  } else {
    console.log(`[rss] watch ทุก ${INTERVAL_MIN} นาที | ${ALL_DAYS ? "ทุกวัน" : "จ–ศ"} ${HOURS_FROM}–${HOURS_TO} | Ctrl+C เพื่อหยุด`);
    let stop = false;
    process.on("SIGINT", () => (stop = true));
    while (!stop) {
      if (inWindow()) {
        console.log(`\n[rss] ${stamp()}`);
        await poll();
        if (INGEST && !DRY_RUN) await ingest();
      }
      for (let waited = 0; waited < INTERVAL_MIN * 60_000 && !stop; waited += 5_000) await sleep(5_000);
    }
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("\n[fatal]", e);
  await mongoose.disconnect();
  process.exit(1);
});
