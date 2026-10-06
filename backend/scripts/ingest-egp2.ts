/**
 * Ingest BMA software procurement that is still open, from egp2.bangkok.go.th.
 *
 * This replaces ingest-bma.ts. The govspending API it used only publishes step
 * 5 (signed contracts), so every record it returned was already awarded —
 * useless for a tool whose job is to tell a software house what it can still
 * bid on. egp2 publishes the draft and invitation stages, and is the only
 * source that carries a hearing deadline.
 *
 * Documents are NOT downloaded here. Only the e-GP project number is stored,
 * and the archive URL is resolved on demand when a user asks for it, per the
 * advisor's instruction not to keep PDFs locally.
 *
 * Usage (in container):
 *   # ดูสรุปว่าจะบันทึกอะไร โดยยังไม่เขียน DB
 *   docker compose --profile tools run --rm tools npx tsx scripts/ingest-egp2.ts --dry-run
 *   # ดู document เต็ม ๆ ที่จะเขียนลง MongoDB
 *   ... npx tsx scripts/ingest-egp2.ts --dry-run --json
 *   # เขียนจริง
 *   ... npx tsx scripts/ingest-egp2.ts
 *   ... npx tsx scripts/ingest-egp2.ts --year=2570 --include-awarded
 *
 * PDPA: no bidder names or tax ids are read from this source.
 */

import { config } from "dotenv";
config({ path: ".env" });

import mongoose from "mongoose";
import crypto from "crypto";

import {
  fetchAllProjects,
  fetchDetail,
  fetchTors,
  ANNOUNCE_TYPE,
  type Egp2ProjectRow,
} from "../src/services/ingestion/egp2-client";
import { scoreSoftware, type FilterResult } from "../src/services/ingestion/software-filter";
import { resolvePhase } from "../src/services/ingestion/phase-mapper";
import { buildAnnouncementSearchUrl } from "../src/services/ingestion/egp-document-url";
import TORRecord from "../src/db/models/tor-record";

const MONGODB_URI = process.env.MONGODB_URI;

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
/** With --dry-run, print the full document instead of a summary line. */
const showJson = argv.includes("--json");
const includeAwarded = argv.includes("--include-awarded");
const yearArg = argv.find((a) => a.startsWith("--year="));
/** Current budget year by default — earlier years are long since awarded. */
const YEAR = Number(yearArg?.split("=")[1] ?? 2569);

/**
 * Announcement stages worth scanning. The phase is NOT taken from here — a
 * project keeps its invitation announcement long after the contract is signed,
 * so the contract status decides it (see phase-mapper.ts).
 */
const STAGES: Array<{ id: string; name: string }> = [
  { id: ANNOUNCE_TYPE.INVITATION, name: "ประกาศเชิญชวน" },
  { id: ANNOUNCE_TYPE.DRAFT_BIDDING, name: "ร่างเอกสารประกวดราคา" },
];

/** Stable key for a project, so re-runs update rather than duplicate. */
function dedupeHash(projectNumber: string): string {
  return crypto.createHash("sha256").update(`egp2:${projectNumber}`).digest("hex").slice(0, 32);
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

interface Candidate {
  row: Egp2ProjectRow;
  filter: FilterResult;
  stage: (typeof STAGES)[number];
}

async function main() {
  if (!MONGODB_URI && !dryRun) {
    console.error("ต้องมี MONGODB_URI ใน .env (หรือใช้ --dry-run)");
    process.exit(1);
  }

  console.log(`[plan] egp2 | ปีงบ ${YEAR}${dryRun ? " | DRY RUN" : ""}`);

  /* ─── 1. Fetch the open stages ──────────────────────────────────── */

  const byProject = new Map<string, Candidate>();

  const stages = includeAwarded
    ? [...STAGES, { id: ANNOUNCE_TYPE.WINNER, name: "ประกาศผู้ชนะ" }]
    : STAGES;

  for (const stage of stages) {
    process.stdout.write(`  [${stage.name}] `);
    const rows = await fetchAllProjects(
      { budgetYear: YEAR, masterAnnounceTypeId: stage.id, pageSize: 200 },
      { onPage: (n, t) => process.stdout.write(`\r  [${stage.name}] ${n}/${t}      `) },
    );
    // A project can appear under several stages. Invitation is listed first,
    // so a project already open for bids is not demoted back to its own draft.
    let added = 0;
    for (const row of rows) {
      if (byProject.has(row.projectNumber)) continue;
      // Title only. Agency names carry keywords of their own — "สำนักงาน
      // พัฒนาระบบสาธารณสุข" hit the strong "พัฒนาระบบ" and let its medical
      // supply purchases in as software.
      const filter = scoreSoftware(row.projectName);
      if (!filter.isSoftware) continue;
      byProject.set(row.projectNumber, { row, filter, stage });
      added++;
    }
    console.log(`\r  [${stage.name}] ${rows.length} โครงการ → software ${added}`.padEnd(64));
  }

  const candidates = [...byProject.values()];
  const uncertain = candidates.filter((c) => c.filter.isUncertain).length;
  console.log(`\n[filter] เข้าเกณฑ์ ${candidates.length} รายการ (ก้ำกึ่ง ${uncertain} — ติด tag ไว้ให้ตรวจ)`);

  if (candidates.length === 0) {
    console.log("ไม่มีข้อมูลให้บันทึก");
    return;
  }

  /* ─── 2. Enrich: reference price + hearing deadline ─────────────── */

  console.log(`\n[enrich] ดึงราคากลางและวันรับฟังความเห็น ...`);

  const docs: Parameters<typeof TORRecord.bulkWrite>[0] = [];
  let withDeadline = 0;
  let failed = 0;
  let stillOpen = 0;

  for (const [i, cand] of candidates.entries()) {
    const { row, filter, stage } = cand;
    process.stdout.write(`\r  ${i + 1}/${candidates.length}   `);

    let referencePrice: number | undefined;
    let purchaseMethod: string | undefined;
    let projectType: string | undefined;
    let contractStatus: string | undefined;
    let hearingStart: Date | undefined;
    let hearingEnd: Date | undefined;
    let torTitle: string | undefined;

    try {
      const detail = await fetchDetail(row.projectId);
      referencePrice = detail.projectAverageBudget ?? undefined;
      purchaseMethod = detail.masterMethodIdName ?? undefined;
      projectType = detail.masterTypeIdName ?? undefined;
      contractStatus = detail.masterContractAvailableName ?? undefined;

      const tors = await fetchTors(row.projectId);
      const tor = tors.data[0];
      if (tor) {
        hearingStart = parseDate(tor.projectTorHearingStartDate);
        hearingEnd = parseDate(tor.projectTorHearingEndDate);
        torTitle = tor.projectTorTitle ?? undefined;
        if (hearingEnd) withDeadline++;
      }
    } catch {
      // One project failing to enrich must not lose the record: the title,
      // agency and budget from the listing are already worth storing.
      failed++;
    }

    // Contract status, not the announcement, decides whether this is still open.
    const phaseResult = resolvePhase(contractStatus, stage.id);
    if (phaseResult.isOpen) stillOpen++;

    const tags = ["software", `y${YEAR}`, phaseResult.phase];
    if (filter.isUncertain) tags.push("uncertain-classification");
    if (purchaseMethod?.includes("e-bidding")) tags.push("e-bidding");
    if (phaseResult.isOpen) tags.push("open");

    docs.push({
      updateOne: {
        filter: { deduplicationHash: dedupeHash(row.projectNumber) },
        update: {
          $set: {
            title: row.projectName,
            agencyName: row.masterOrgDepartmentName || row.masterOrgGroupName || "กรุงเทพมหานคร",
            phase: phaseResult.phase,
            budget: row.projectBudget ?? undefined,
            medianPrice: referencePrice,
            // Without a hearing date there is no real posting date; the
            // first-seen date is set once in $setOnInsert below instead of
            // moving forward on every run.
            ...(hearingStart ? { postingDate: hearingStart } : {}),
            publicHearingStart: hearingStart,
            // The hearing close is the only published deadline. It is NOT the
            // bid submission deadline, so it stays in its own field rather
            // than filling submissionDeadline and overstating what we know.
            publicHearingEnd: hearingEnd,
            sourceUrl: `https://egp2.bangkok.go.th/project-detail/${row.projectId}`,
            officialPortalUrl: buildAnnouncementSearchUrl(row.projectNumber),
            deduplicationHash: dedupeHash(row.projectNumber),
            tags,
            // The reference price comes straight from the agency, so it is
            // source data rather than an LLM guess — full confidence. When
            // egp2 has none, leave the field alone so a value the AI read
            // from the PDF is not wiped on the next run.
            ...(referencePrice != null
              ? { "parsedData.medianPrice": { value: referencePrice, confidence: 1 } }
              : {}),
            metadata: {
              source: "egp2",
              projectId: row.projectNumber,
              egp2ProjectId: row.projectId,
              announceType: stage.name,
              orgGroupName: row.masterOrgGroupName ?? undefined,
              contractStatus,
              projectType,
              purchaseMethod,
              torTitle,
              phaseReason: phaseResult.reason,
              filterScore: filter.score,
              filterReason: filter.reason,
            },
          },
          // Set only when the record is first created. Re-running ingest daily
          // must not reset finished AI extractions back to pending — that
          // would re-parse (and re-pay for) every TOR on every run.
          $setOnInsert: {
            extractionStatus: "pending",
            ...(hearingStart ? {} : { postingDate: new Date() }),
          },
        },
        upsert: true,
      },
    });
  }

  const enrichLine =
    `\r[enrich] เสร็จ — ยังเปิดรับจริง ${stillOpen}/${candidates.length} | มีวัน deadline ${withDeadline}` +
    (failed ? ` | ดึงรายละเอียดไม่ได้ ${failed}` : "");
  console.log(enrichLine.padEnd(80));

  /* ─── 3. Save ───────────────────────────────────────────────────── */

  if (dryRun && showJson) {
    // The exact document that would land in MongoDB, for checking field
    // shape and values before committing a run.
    console.log(`
[dry-run] document ที่จะเขียนลง MongoDB (2 รายการแรก):
`);
    docs.slice(0, 2).forEach((d, i) => {
      const op = d as { updateOne: { filter: unknown; update: { $set: unknown; $setOnInsert: unknown } } };
      console.log(`--- รายการที่ ${i + 1} ---`);
      console.log(`filter: ${JSON.stringify(op.updateOne.filter)}`);
      console.log(JSON.stringify(op.updateOne.update.$set, null, 2));
      console.log(`$setOnInsert: ${JSON.stringify(op.updateOne.update.$setOnInsert)}`);
      console.log();
    });
    console.log(`(ทั้งหมด ${docs.length} รายการ — แสดง 2 รายการแรก)`);
    return;
  }

  if (dryRun) {
    console.log(`\n[dry-run] จะบันทึก ${docs.length} รายการ ตัวอย่าง 5 รายการ:`);
    candidates.slice(0, 5).forEach(({ row, filter, stage }) => {
      console.log(`\n  ${row.projectName.slice(0, 76)}`);
      console.log(`    ${row.masterOrgGroupName} | ${stage.name}`);
      console.log(`    งบ ${(row.projectBudget ?? 0).toLocaleString("th-TH")} | ${filter.reason.slice(0, 60)}`);
      console.log(`    projectNumber ${row.projectNumber} → โหลดเอกสารตอนผู้ใช้กด`);
    });
    return;
  }

  await mongoose.connect(MONGODB_URI!);
  console.log(`\n[db] เชื่อมต่อแล้ว`);

  const result = await TORRecord.bulkWrite(docs);
  console.log(
    `[db] เพิ่มใหม่ ${result.upsertedCount} | อัปเดต ${result.modifiedCount} | ` +
      `ตรงอยู่แล้ว ${docs.length - result.upsertedCount - result.modifiedCount}`,
  );

  const total = await TORRecord.countDocuments();
  const open = await TORRecord.countDocuments({ phase: { $in: ["bidding", "public_hearing"] } });
  console.log(`[db] TORRecord ทั้งหมด ${total} | ที่ยังเปิดรับ ${open}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("\n[fatal]", e);
  process.exit(1);
});
