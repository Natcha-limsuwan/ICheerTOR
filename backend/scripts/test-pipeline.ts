/**
 * End-to-end check of the ingestion pipeline.
 *
 * Covers the four things that must keep working, in the order they run:
 *
 *   1. software-filter   classifies titles correctly (offline, no network)
 *   2. egp2 API          still answers and still reports open projects
 *   3. phase-mapper      open vs closed is decided by contract status
 *   4. document chain    a stored project id still resolves to a real archive
 *
 * Stages 2-4 need the network; stage 4 also needs data in MongoDB, so run
 * ingest-egp2.ts first. Each stage is skipped rather than failed when its
 * prerequisite is missing, so the offline checks stay useful on their own.
 *
 * Usage (in container):
 *   docker compose --profile tools run --rm tools npx tsx scripts/test-pipeline.ts
 *   ... npx tsx scripts/test-pipeline.ts --offline
 */

import { config } from "dotenv";
config({ path: ".env" });

import mongoose from "mongoose";

import {
  fetchProjects,
  fetchDetail,
  fetchTors,
  ANNOUNCE_TYPE,
} from "../src/services/ingestion/egp2-client";
import { scoreSoftware } from "../src/services/ingestion/software-filter";
import { resolvePhase } from "../src/services/ingestion/phase-mapper";
import { resolveDownloadUrl } from "../src/services/ingestion/egp-document-url";
import TORRecord from "../src/db/models/tor-record";

const offline = process.argv.includes("--offline");
const YEAR = 2569;

let passed = 0;
let failed = 0;
let skipped = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(label: string, why: string) {
  skipped++;
  console.log(`  – ${label} (ข้าม: ${why})`);
}

/* ─── 1. Filter ───────────────────────────────────────────────────── */

/**
 * Titles taken from live BMA data. The "false" group are all cases an earlier
 * flat keyword list got wrong, so they guard against that regression coming
 * back when keywords are next tuned.
 */
const FILTER_CASES: Array<[string, boolean]> = [
  ["ประกวดราคาซื้อยา dextran ๗๐ ๑๐๐ mg/๑๐๐ mL + hypromellose eye drop", false],
  ["โครงการก่อสร้างอุโมงค์ส่วนต่อขยายจากบึงหนองบอน ถึงคลองประเวศบุรีรมย์", false],
  ["โครงการก่อสร้างทำนบเพื่อการเกษตรและแก้ไขปัญหาน้ำท่วม", false],
  ["จ้างเหมาซ่อมบำรุงรักษาระบบทำความเย็นของระบบปรับอากาศ", false],
  ["ซื้อกระดาษถ่ายเอกสาร จำนวน 2 รายการ โดยวิธีเฉพาะเจาะจง", false],
  ["ซื้อวัสดุคอมพิวเตอร์ สำหรับโรงเรียนวัดบางนาใน", false],
  ["จ้างเหมาทำกรงสุนัข", false],
  ["ประกวดราคาจ้างทำความสะอาดอาคาร", false],

  ["ประกวดราคาซื้อชุดโปรแกรมป้องกันไวรัส จำนวน 1,200 ลิขสิทธิ์", true],
  ["ซื้อสิทธิ์การใช้งานซอฟต์แวร์ตามโครงการระบบสนับสนุนการเข้าถึงสารสนเทศ", true],
  ["จ้างพัฒนาปรับปรุงระบบสารสนเทศและเทคโนโลยีการจัดการศึกษา", true],
  ["จ้างบำรุงรักษาระบบสารสนเทศการจัดการงบประมาณ", true],
  ["ประกวดราคาซื้อจัดซื้อลิขสิทธิ์โปรแกรมจัดการสำนักงาน จำนวน 4,922 ลิขสิทธิ์", true],
  ["จัดหาระบบคลาวด์สำหรับระบบสารสนเทศศูนย์บริการสาธารณสุข", true],
  ["บำรุงรักษาระบบคอมพิวเตอร์และอุปกรณ์ระบบโปรแกรมและระบบงานตามโครงการทะเบียนราษฎร", true],
];

function testFilter() {
  console.log("\n[1] software-filter");
  let wrong = 0;
  for (const [title, want] of FILTER_CASES) {
    const got = scoreSoftware(title).isSoftware;
    if (got !== want) {
      wrong++;
      console.log(`      ผิด: "${title.slice(0, 56)}" → ${got ? "software" : "ไม่ใช่"}`);
    }
  }
  check(`กรองถูกต้อง ${FILTER_CASES.length - wrong}/${FILTER_CASES.length}`, wrong === 0);
}

/* ─── 2. Phase mapping ────────────────────────────────────────────── */

function testPhaseMapper() {
  console.log("\n[2] phase-mapper");

  const cases: Array<[string | undefined, string, string, boolean]> = [
    ["ระหว่างดำเนินการ", ANNOUNCE_TYPE.INVITATION, "bidding", true],
    ["ระหว่างดำเนินการ", ANNOUNCE_TYPE.DRAFT_BIDDING, "public_hearing", true],
    ["จัดทำสัญญา/ PO แล้ว", ANNOUNCE_TYPE.INVITATION, "awarded", false],
    ["ส่งงานครบถ้วน", ANNOUNCE_TYPE.INVITATION, "awarded", false],
    ["ยกเลิกโครงการ", ANNOUNCE_TYPE.INVITATION, "cancelled", false],
    // An unseen status must close, never open: showing a closed project as
    // biddable is the failure this product cannot afford.
    ["สถานะใหม่ที่ยังไม่เคยเจอ", ANNOUNCE_TYPE.INVITATION, "awarded", false],
    [undefined, ANNOUNCE_TYPE.INVITATION, "awarded", false],
  ];

  let wrong = 0;
  for (const [status, announce, wantPhase, wantOpen] of cases) {
    const r = resolvePhase(status, announce);
    if (r.phase !== wantPhase || r.isOpen !== wantOpen) {
      wrong++;
      console.log(`      ผิด: "${status ?? "(ว่าง)"}" → ${r.phase}/${r.isOpen}, ควรเป็น ${wantPhase}/${wantOpen}`);
    }
  }
  check(`แยกสถานะถูกต้อง ${cases.length - wrong}/${cases.length}`, wrong === 0);
}

/* ─── 3. egp2 API ─────────────────────────────────────────────────── */

async function testEgp2Api() {
  console.log("\n[3] egp2 API");

  const open = await fetchProjects({
    budgetYear: YEAR,
    masterAnnounceTypeId: ANNOUNCE_TYPE.INVITATION,
    pageSize: 3,
    sortBy: "publishDateDesc",
  });
  check("ค้นหาประกาศเชิญชวนได้", open.totalCount > 0, `${open.totalCount} โครงการ`);

  const row = open.data[0];
  if (!row) {
    skip("ดึงรายละเอียด", "ไม่มีข้อมูลให้ทดสอบ");
    return null;
  }

  const detail = await fetchDetail(row.projectId);
  check("ดึงรายละเอียดได้", detail.projectNumber === row.projectNumber,
    `ราคากลาง ${detail.projectAverageBudget?.toLocaleString("th-TH") ?? "-"}`);

  // Only projects that went to public hearing have a TOR record, so an empty
  // list here is valid data rather than a failure.
  const tors = await fetchTors(row.projectId);
  check("เรียก TOR endpoint ได้", Array.isArray(tors.data),
    tors.data.length ? `มีวันรับฟังความเห็น` : `ไม่มีร่าง TOR (ปกติ)`);

  return row.projectNumber;
}

/* ─── 4. Document chain ───────────────────────────────────────────── */

async function testDocumentChain(fallbackProjectId: string | null) {
  console.log("\n[4] ดึงเอกสารจาก process5");

  let projectIds: string[] = [];
  let fromDb = false;

  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    const records = await TORRecord.find({ tags: "open" })
      .select("metadata.projectId")
      .limit(3)
      .lean();
    projectIds = records.map((r) => r.metadata?.projectId).filter((x): x is string => !!x);
    fromDb = projectIds.length > 0;
  }

  if (!fromDb) {
    if (!fallbackProjectId) {
      skip("ดึงเอกสาร", "ไม่มี projectId ให้ทดสอบ");
      return;
    }
    console.log("      (ไม่มีข้อมูลใน DB — ใช้ projectId จาก API แทน)");
    projectIds = [fallbackProjectId];
  }

  let ok = 0;
  for (const id of projectIds) {
    const doc = await resolveDownloadUrl(id);
    if (doc) {
      ok++;
      console.log(`      ${id} → ${doc.fileName}`);
    } else {
      // e-GP publishes no archive for some projects; expected, not a fault.
      console.log(`      ${id} → ไม่มีชุดเอกสาร (ปกติสำหรับบางโครงการ)`);
    }
  }
  check(`ดึง URL เอกสารได้ ${ok}/${projectIds.length}`, ok > 0);

  if (fromDb) {
    const total = await TORRecord.countDocuments();
    const open = await TORRecord.countDocuments({ tags: "open" });
    console.log(`\n      [DB] ทั้งหมด ${total} รายการ | ยังเปิดรับ ${open}`);
  }
}

/* ─── Run ─────────────────────────────────────────────────────────── */

async function main() {
  console.log("=== ทดสอบ pipeline ===");

  testFilter();
  testPhaseMapper();

  if (offline) {
    skip("egp2 API", "--offline");
    skip("ดึงเอกสาร", "--offline");
  } else {
    try {
      const projectId = await testEgp2Api();
      await testDocumentChain(projectId);
    } catch (error) {
      failed++;
      console.log(`\n  ✗ ต่อเน็ตไม่ได้ หรือ API เปลี่ยน: ${error instanceof Error ? error.message.slice(0, 100) : error}`);
    }
  }

  console.log(`\n=== ผ่าน ${passed} | ไม่ผ่าน ${failed} | ข้าม ${skipped} ===`);

  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
