/**
 * Test TOR Match Alert Preparation Script
 *
 * Simulates finding matched users for a TOR record and previewing/dispatching
 * the resulting in-app and email notifications.
 *
 * Usage:
 *   npx tsx scripts/test-match-alert.ts --dry-run                 # simulate on first available TOR
 *   npx tsx scripts/test-match-alert.ts --tor=<torId> --dry-run  # simulate for specific TOR
 *   npx tsx scripts/test-match-alert.ts --tor=<torId>            # dispatch alerts for real
 */

import { config } from "dotenv";
config({ path: ".env" });

import { connectDB } from "../src/db/connection.js";
import TORRecord from "../src/db/models/tor-record.js";
import { evaluateAndAlertForTor } from "../src/services/notification/tor-match-alerter.js";

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const torArg = argv.find((a) => a.startsWith("--tor="))?.split("=")[1];
const minScoreArg = argv.find((a) => a.startsWith("--min-score="))?.split("=")[1];

async function main() {
  await connectDB();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  iCheerTOR — TOR Match Alert Preview & Test");
  console.log("═══════════════════════════════════════════════════════════\n");

  let torId = torArg;
  if (!torId) {
    const sample = await TORRecord.findOne({
      "parsedData.qualifications.0": { $exists: true },
    })
      .select("_id title agencyName")
      .lean();

    if (!sample) {
      console.log("❌ ไม่พบ TORRecord ที่มีข้อมูล qualifications ในระบบ");
      process.exit(1);
    }
    torId = sample._id.toString();
    console.log(`📌 ไม่ได้ระบุ --tor, ใช้ตัวอย่าง: ${sample.title} (${torId})\n`);
  }

  const minFitScore = minScoreArg ? parseFloat(minScoreArg) : 0.5;

  console.log(`🔍 กำลังประเมินการจับคู่ (Mode: ${DRY_RUN ? "DRY-RUN (จำลอง)" : "LIVE DISPATCH"})...`);
  console.log(`   เกณฑ์คะแนนขั้นต่ำ: ${minFitScore * 100}%\n`);

  try {
    const summary = await evaluateAndAlertForTor(torId, {
      dryRun: DRY_RUN,
      minFitScore,
    });

    console.log("───────────────────────────────────────────────────────────");
    console.log(`โครงการ: ${summary.projectTitle}`);
    console.log(`จำนวนผู้ใช้ที่ประเมิน: ${summary.totalUsersEvaluated}`);
    console.log(`ผู้ใช้ที่ตรงกับเงื่อนไข (Matched): ${summary.matchedUsersCount}`);
    console.log(`การแจ้งเตือนในระบบที่สร้าง: ${summary.notificationsCreated}`);
    console.log(`อีเมลที่ส่งออก: ${summary.emailsSent}`);
    console.log("───────────────────────────────────────────────────────────\n");

    for (const ev of summary.evaluations) {
      const matchIcon = ev.matched ? "✅ MATCH" : "❌ NO MATCH";
      console.log(`• [${matchIcon}] ${ev.userName} (${ev.userEmail})`);
      console.log(`  - คะแนนความเหมาะสม: ${ev.fitScore != null ? `${Math.round(ev.fitScore * 100)}%` : "N/A"}`);
      console.log(`  - สถานะคุณสมบัติ: ${ev.eligibilityStatus}`);
      console.log(`  - ผลลัพธ์: ${ev.reason}`);
    }

    console.log("\n✨ เสร็จสิ้นการทดสอบ");
    process.exit(0);
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาด:", error);
    process.exit(1);
  }
}

main();
