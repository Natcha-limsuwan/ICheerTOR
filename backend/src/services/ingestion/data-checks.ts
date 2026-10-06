/**
 * Where the sources disagree about a project, and what the bid window is now.
 *
 * egp2's status lags reality: a project stays "ระหว่างดำเนินการ" (our
 * "bidding") until the contract is signed, often months after bids closed.
 * The announcement's bid date shows that. Neither is "the truth" on its own,
 * so a disagreement is recorded for the user ("อาจต้องตรวจสอบเอง") and, when
 * it matters, flagged for an admin — never silently resolved.
 *
 * bidWindow is computed on every request (it changes with the clock); the
 * conflicts are stored by the daily jobs so an admin can list them.
 */

import type { ITORRecord } from "../../db/models/tor-record";

export type BidWindowState = "upcoming" | "today" | "closed" | "unknown";

export interface BidWindow {
  state: BidWindowState;
  closesAt: Date | null;
  /** Whole Bangkok calendar days until the bid day; 0 on the day. */
  daysUntil: number | null;
  /** Whole days since bids closed. */
  closedDaysAgo: number | null;
}

/**
 * Status safe to show to bidders. e-GP leaves many projects in `bidding`
 * while the agency evaluates bids, so the submitted closing time wins for
 * display. The stored phase remains untouched for audit and source context.
 */
export type DisplayPhase = "public_hearing" | "bidding" | "closed" | "awarded" | "cancelled";

export function displayPhase(
  phase: Exclude<DisplayPhase, "closed">,
  closesAt: Date | string | null | undefined,
  now = new Date(),
): DisplayPhase {
  const window = bidWindow(closesAt, now);
  return (phase === "public_hearing" || phase === "bidding") && window.state === "closed" ? "closed" : phase;
}

export type ConflictSeverity = "info" | "check";

export interface DataConflict {
  code:
    | "bids_closed_still_open"
    | "hearing_but_announced"
    | "awarded_before_bid_day"
    | "price_mismatch"
    | "extraction_review";
  /** info = shown to users; check = also queued for an admin. */
  severity: ConflictSeverity;
  message: string;
}

export interface DataChecks {
  conflicts: DataConflict[];
  /** An unresolved "check" conflict is present — the admin queue filter. */
  needsCheck: boolean;
  checkedAt: Date;
  /** Codes an admin has looked at; they stop raising needsCheck. */
  resolvedCodes: string[];
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
  resolvedNote?: string | null;
}

/** Past this, "bids closed but egp2 still open" is unusual enough to check. */
export const STALE_AFTER_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const BANGKOK_MS = 7 * 60 * 60 * 1000;
const bangkokDay = (d: Date) => Math.floor((d.getTime() + BANGKOK_MS) / DAY_MS);
const fmtDate = (d: Date) =>
  d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });

export function bidWindow(closesAt: Date | string | null | undefined, now = new Date()): BidWindow {
  if (!closesAt) return { state: "unknown", closesAt: null, daysUntil: null, closedDaysAgo: null };
  const closes = new Date(closesAt);
  if (now.getTime() > closes.getTime()) {
    return {
      state: "closed",
      closesAt: closes,
      daysUntil: null,
      closedDaysAgo: bangkokDay(now) - bangkokDay(closes),
    };
  }
  const daysUntil = bangkokDay(closes) - bangkokDay(now);
  return { state: daysUntil === 0 ? "today" : "upcoming", closesAt: closes, daysUntil, closedDaysAgo: null };
}

type CheckedRecord = Pick<ITORRecord, "phase" | "submissionDeadline" | "parsedData" | "extraction"> & {
  dataChecks?: Pick<DataChecks, "resolvedCodes" | "resolvedBy" | "resolvedAt" | "resolvedNote"> | null;
};

export function computeDataChecks(r: CheckedRecord, now = new Date()): DataChecks {
  const conflicts: DataConflict[] = [];
  const window = bidWindow(r.submissionDeadline, now);
  const keyDates = r.parsedData?.keyDates;

  // The announcement decides whether bids are open; egp2 only says no
  // contract is signed yet, which it keeps saying for months. So this is the
  // normal "closed, awaiting result" state — shown to users, never queued for
  // an admin (it was 39 of 42 open projects on the first run).
  if ((r.phase === "bidding" || r.phase === "public_hearing") && window.state === "closed") {
    const days = window.closedDaysAgo!;
    conflicts.push({
      code: "bids_closed_still_open",
      severity: "info",
      message:
        `ปิดรับข้อเสนอแล้วเมื่อ ${fmtDate(window.closesAt!)} (${days} วันก่อน) — egp2 ยังไม่ประกาศผล` +
        (days > STALE_AFTER_DAYS ? " (นานแล้ว egp2 อาจยังไม่อัปเดต)" : ""),
    });
  }

  if (r.phase === "public_hearing" && keyDates?.submissionDate?.status === "confirmed") {
    conflicts.push({
      code: "hearing_but_announced",
      severity: "check",
      message: "ประกาศเชิญชวนกำหนดวันยื่นแล้ว แต่ egp2 ยังแสดงว่าอยู่ช่วงรับฟังความเห็นร่าง TOR",
    });
  }

  if (r.phase === "awarded" && (window.state === "upcoming" || window.state === "today")) {
    conflicts.push({
      code: "awarded_before_bid_day",
      severity: "check",
      message: `egp2 แสดงว่าได้ผู้รับจ้างแล้ว แต่ประกาศกำหนดวันยื่นเป็น ${fmtDate(window.closesAt!)} ซึ่งยังไม่ถึง`,
    });
  }

  const issues = r.extraction?.issues ?? [];
  for (const i of issues) {
    if ((i.field === "medianPrice" || i.field === "budget") && (i.severity === "review" || i.severity === "corrected")) {
      conflicts.push({ code: "price_mismatch", severity: i.severity === "review" ? "check" : "info", message: i.message });
    }
  }
  const otherReviews = issues.filter((i) => i.severity === "review" && i.field !== "medianPrice" && i.field !== "budget");
  if (otherReviews.length) {
    conflicts.push({
      code: "extraction_review",
      severity: "check",
      message: `ผลอ่าน TOR มี ${otherReviews.length} รายการที่ควรตรวจกับเอกสาร: ${otherReviews.map((i) => i.message).join(" / ").slice(0, 300)}`,
    });
  }

  const resolvedCodes = r.dataChecks?.resolvedCodes ?? [];
  return {
    conflicts,
    needsCheck: conflicts.some((c) => c.severity === "check" && !resolvedCodes.includes(c.code)),
    checkedAt: now,
    resolvedCodes,
    resolvedBy: r.dataChecks?.resolvedBy ?? null,
    resolvedAt: r.dataChecks?.resolvedAt ?? null,
    resolvedNote: r.dataChecks?.resolvedNote ?? null,
  };
}
