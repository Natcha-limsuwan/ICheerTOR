/**
 * Is the data pipeline running? One snapshot for the admin panel.
 *
 * Each stage fails quietly when nobody watches it: the RSS poller missed
 * nine days in October 2026 before anyone noticed, and records sat "failed"
 * on a teammate's misconfigured .env. This gathers what the stages already
 * record — RssPollState, IngestJob, ExtractionLog, TORRecord statuses — and
 * says in plain words what needs attention.
 *
 * assessHealth is pure (snapshot + clock → problems) so the rules are tested
 * without a database.
 */

import TORRecord from "../db/models/tor-record";
import ExtractionLog from "../db/models/extraction-log";
import IngestJob from "../db/models/ingest-job";
import RssPollState from "../db/models/rss-poll-state";
import RssCandidate from "../db/models/rss-candidate";

export type HealthLevel = "ok" | "warning" | "error";

export interface HealthProblem {
  level: Exclude<HealthLevel, "ok">;
  stage: "rss" | "egp2" | "extraction";
  message: string;
}

export interface RssFeedSnapshot {
  announceType: string;
  lastPolledAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastMaintenanceAt: Date | null;
  lastMaintenanceNotice: string | null;
  gaps: number;
  failures: number;
}

export interface PipelineSnapshot {
  rss: RssFeedSnapshot[];
  rssCandidates: Record<string, number>;
  egp2LastJob: {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    counts: Record<string, number> | null;
    error: string | null;
  } | null;
  extraction: {
    byStatus: Record<string, number>;
    /** "pending" in an open phase — waiting for the model. */
    waitingOpen: number;
    /** "processing" whose lock has expired — a stopped run left it. */
    stuck: number;
    needsReview: number;
    needsCheck: number;
    lastExtractedAt: Date | null;
  };
  /** ExtractionLog over the last 7 days. */
  vertex7d: {
    calls: number;
    failures: number;
    failuresByCode: Record<string, number>;
    inputTokens: number;
    outputTokens: number;
  };
}

export interface PipelineHealth extends PipelineSnapshot {
  status: HealthLevel;
  problems: HealthProblem[];
  checkedAt: Date;
}

const HOUR = 3600_000;
/** The RSS window is 20 items; in office hours a 2-hour silence loses data. */
const RSS_STALE_OFFICE_HOURS = 2 * HOUR;
/** Any 3 days without a successful RSS poll means it is not scheduled at all. */
const RSS_STALE_ANY = 72 * HOUR;
const EGP2_STALE = 26 * HOUR;
const EXTRACTION_STALE = 24 * HOUR;

/** Mon–Fri 08:30–17:00 Bangkok — when announcements are published. */
export function isOfficeHours(now: Date): boolean {
  const bkk = new Date(now.getTime() + 7 * HOUR);
  const day = bkk.getUTCDay();
  const minutes = bkk.getUTCHours() * 60 + bkk.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= 8 * 60 + 30 && minutes <= 17 * 60;
}

const ago = (from: Date | null, now: Date) =>
  from ? `${Math.round((now.getTime() - from.getTime()) / HOUR)} ชั่วโมงก่อน` : "ไม่เคย";

export function assessHealth(s: PipelineSnapshot, now = new Date()): HealthProblem[] {
  const problems: HealthProblem[] = [];

  /* RSS */
  if (!s.rss.length) {
    problems.push({ level: "warning", stage: "rss", message: "RSS ยังไม่เคยรัน — ยังไม่ได้ประกาศจากหน่วยงานนอก กทม." });
  }
  for (const f of s.rss) {
    const since = f.lastSuccessAt ? now.getTime() - f.lastSuccessAt.getTime() : Infinity;
    // e-GP's planned downtime, seen after the last success: expected silence.
    const inMaintenance =
      f.lastMaintenanceAt != null &&
      (f.lastSuccessAt == null || f.lastMaintenanceAt > f.lastSuccessAt) &&
      now.getTime() - f.lastMaintenanceAt.getTime() < 6 * HOUR;
    if (inMaintenance) {
      problems.push({
        level: "warning",
        stage: "rss",
        message: `${f.announceType}: e-GP ปิดปรับปรุงระบบ (${f.lastMaintenanceNotice ?? "ไม่ระบุเวลาเปิด"})`,
      });
    } else if (since > RSS_STALE_ANY || (isOfficeHours(now) && since > RSS_STALE_OFFICE_HOURS)) {
      problems.push({
        level: "error",
        stage: "rss",
        message:
          `${f.announceType}: ดึง RSS สำเร็จล่าสุด ${ago(f.lastSuccessAt, now)} — ` +
          (f.lastError ? `error ล่าสุด: ${f.lastError.slice(0, 120)}` : "ตัวดึงไม่ได้รัน (ยังไม่ได้ตั้งเวลา?)"),
      });
    }
    if (f.gaps > 0) {
      problems.push({
        level: "warning",
        stage: "rss",
        message: `${f.announceType}: เคยมีรอบที่รายการอาจหลุด ${f.gaps} ครั้ง — ควรดึงถี่ขึ้น`,
      });
    }
  }
  if ((s.rssCandidates.failed ?? 0) > 0) {
    problems.push({ level: "warning", stage: "rss", message: `สร้าง record จาก RSS ไม่สำเร็จ ${s.rssCandidates.failed} รายการ` });
  }

  /* egp2 */
  const job = s.egp2LastJob;
  if (!job) {
    problems.push({ level: "warning", stage: "egp2", message: "ยังไม่มีประวัติ ingest egp2 (บันทึกเริ่มหลังอัปเดตนี้)" });
  } else if (job.status === "failed") {
    problems.push({ level: "error", stage: "egp2", message: `ingest egp2 ล่าสุดล้มเหลว: ${job.error ?? "ไม่ทราบสาเหตุ"}` });
  } else if (job.status === "running" && now.getTime() - job.startedAt.getTime() > 2 * HOUR) {
    problems.push({ level: "warning", stage: "egp2", message: "ingest egp2 ค้างสถานะกำลังรันเกิน 2 ชั่วโมง" });
  } else if (now.getTime() - (job.finishedAt ?? job.startedAt).getTime() > EGP2_STALE) {
    problems.push({ level: "warning", stage: "egp2", message: `ingest egp2 ล่าสุด ${ago(job.finishedAt ?? job.startedAt, now)}` });
  }

  /* extraction */
  const x = s.extraction;
  if (x.stuck > 0) {
    problems.push({ level: "warning", stage: "extraction", message: `ค้างสถานะกำลังอ่าน ${x.stuck} ฉบับ (run ถูกหยุดกลางทาง)` });
  }
  if ((x.byStatus.failed ?? 0) > 0) {
    problems.push({ level: "warning", stage: "extraction", message: `AI อ่านไม่สำเร็จ ${x.byStatus.failed} ฉบับ` });
  }
  if (x.waitingOpen > 0 && (!x.lastExtractedAt || now.getTime() - x.lastExtractedAt.getTime() > EXTRACTION_STALE)) {
    problems.push({
      level: "warning",
      stage: "extraction",
      message: `มีโครงการที่ยังเปิดรับรอ AI อ่าน ${x.waitingOpen} ฉบับ แต่ AI อ่านล่าสุด ${ago(x.lastExtractedAt, now)}`,
    });
  }
  const v = s.vertex7d;
  if (v.calls >= 5 && v.failures / v.calls > 0.3) {
    problems.push({
      level: "error",
      stage: "extraction",
      message: `Vertex ล้มเหลว ${v.failures}/${v.calls} ครั้งใน 7 วัน (${Object.entries(v.failuresByCode).map(([k, n]) => `${k} ${n}`).join(", ")})`,
    });
  }
  return problems;
}

export function overallLevel(problems: HealthProblem[]): HealthLevel {
  return problems.some((p) => p.level === "error") ? "error" : problems.length ? "warning" : "ok";
}

const countBy = (rows: Array<{ _id: unknown; n: number }>) =>
  Object.fromEntries(rows.map((r) => [String(r._id ?? "unknown"), r.n]));

export async function collectPipelineHealth(now = new Date()): Promise<PipelineHealth> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * HOUR);
  const [rssStates, candidates, lastJob, byStatus, waitingOpen, stuck, needsReview, needsCheck, lastExtracted, logs] =
    await Promise.all([
      RssPollState.find().lean(),
      RssCandidate.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
      IngestJob.findOne({ type: "ingest" }).sort({ startedAt: -1 }).lean(),
      TORRecord.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$extractionStatus", n: { $sum: 1 } } }]),
      TORRecord.countDocuments({ extractionStatus: "pending", phase: { $in: ["public_hearing", "bidding"] } }),
      TORRecord.countDocuments({ extractionStatus: "processing", "extraction.lockedUntil": { $lt: now } }),
      TORRecord.countDocuments({ "extraction.needsReview": true }),
      TORRecord.countDocuments({ "dataChecks.needsCheck": true }),
      TORRecord.findOne({ "extraction.extractedAt": { $ne: null } }).sort({ "extraction.extractedAt": -1 }).select("extraction.extractedAt").lean(),
      ExtractionLog.aggregate<{ _id: { success: boolean; code: string | null }; n: number; input: number; output: number }>([
        { $match: { createdAt: { $gte: weekAgo } } },
        {
          $group: {
            _id: { success: "$success", code: "$errorCode" },
            n: { $sum: 1 },
            input: { $sum: { $ifNull: ["$usage.inputTokens", 0] } },
            output: { $sum: { $ifNull: ["$usage.outputTokens", 0] } },
          },
        },
      ]),
    ]);

  const failuresByCode: Record<string, number> = {};
  let calls = 0;
  let failures = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const l of logs) {
    calls += l.n;
    inputTokens += l.input;
    outputTokens += l.output;
    if (!l._id.success) {
      failures += l.n;
      failuresByCode[l._id.code ?? "error"] = (failuresByCode[l._id.code ?? "error"] ?? 0) + l.n;
    }
  }

  const snapshot: PipelineSnapshot = {
    rss: rssStates.map((s) => ({
      announceType: s.announceType,
      lastPolledAt: s.lastPolledAt ?? null,
      lastSuccessAt: s.lastSuccessAt ?? null,
      lastError: s.lastError ?? null,
      lastMaintenanceAt: s.lastMaintenanceAt ?? null,
      lastMaintenanceNotice: s.lastMaintenanceNotice ?? null,
      gaps: s.stats?.gaps ?? 0,
      failures: s.stats?.failures ?? 0,
    })),
    rssCandidates: countBy(candidates),
    egp2LastJob: lastJob
      ? {
          status: lastJob.status,
          startedAt: lastJob.startedAt,
          finishedAt: lastJob.finishedAt ?? null,
          counts: (lastJob.counts as unknown as Record<string, number>) ?? null,
          error: lastJob.failures?.[0]?.message ?? null,
        }
      : null,
    extraction: {
      byStatus: countBy(byStatus),
      waitingOpen,
      stuck,
      needsReview,
      needsCheck,
      lastExtractedAt: lastExtracted?.extraction?.extractedAt ?? null,
    },
    vertex7d: { calls, failures, failuresByCode, inputTokens, outputTokens },
  };

  const problems = assessHealth(snapshot, now);
  return { ...snapshot, status: overallLevel(problems), problems, checkedAt: now };
}
