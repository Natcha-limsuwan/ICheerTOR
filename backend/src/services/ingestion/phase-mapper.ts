/**
 * Decide which stage of its life a project is in.
 *
 * The announcement type alone is not enough, and trusting it was a real bug:
 * a project keeps its "ประกาศเชิญชวน" announcement on file forever, so reading
 * only that marked already-signed contracts as still open for bids. Of 101
 * records ingested that way, 53 were in fact closed.
 *
 * Showing a closed project as biddable is the one mistake this product must
 * not make — the SRS is explicit that users must never be misled into thinking
 * they can still submit. So `masterContractAvailableName`, which tracks the
 * contract itself, decides the phase, and the announcement type only fills in
 * the remaining ambiguity between a draft hearing and an open invitation.
 */

import { ANNOUNCE_TYPE } from "./egp2-client";

export type Phase = "public_hearing" | "bidding" | "awarded" | "cancelled";

/**
 * Contract-status values observed in egp2 for BMA, grouped by what they mean
 * for a bidder. Unknown values are treated as closed rather than open: being
 * wrongly hidden costs a user one opportunity, being wrongly shown as open
 * wastes their time and breaks trust.
 */
const CANCELLED = ["ยกเลิกโครงการ", "ยกเลิกประกาศ"];

/** The contract exists or the work is done — nothing left to bid on. */
const CLOSED = [
  "จัดทำสัญญา/ PO แล้ว",
  "ส่งงานตามกำหนด",
  "ส่งงานครบถ้วน",
  "ส่งงานล่าช้า",
  "ตรวจรับแล้ว",
  "เบิกจ่ายแล้ว",
  "สิ้นสุดสัญญา",
];

/** Procurement is running: no contract yet, so a bid may still be possible. */
const IN_PROGRESS = ["ระหว่างดำเนินการ", "อยู่ระหว่างดำเนินการ"];

export interface PhaseResult {
  phase: Phase;
  /** True when a user could still act on this project. */
  isOpen: boolean;
  /** Plain-language explanation, stored so the decision can be audited. */
  reason: string;
}

export function resolvePhase(
  contractStatus: string | null | undefined,
  announceTypeId: string | null | undefined,
): PhaseResult {
  const status = (contractStatus ?? "").trim();

  if (CANCELLED.some((s) => status.includes(s))) {
    return { phase: "cancelled", isOpen: false, reason: `ยกเลิกแล้ว (${status})` };
  }

  if (CLOSED.some((s) => status.includes(s))) {
    return { phase: "awarded", isOpen: false, reason: `ได้ผู้รับจ้างแล้ว (${status})` };
  }

  if (IN_PROGRESS.some((s) => status.includes(s))) {
    // No contract yet. The announcement type separates a draft still open for
    // comment (time to prepare) from an invitation (bids being taken). An
    // invitation stays "ระหว่างดำเนินการ" after submission closes too, while
    // bids are evaluated — egp2 gives no bid deadline, so the reason says so.
    if (announceTypeId === ANNOUNCE_TYPE.DRAFT_BIDDING) {
      return {
        phase: "public_hearing",
        isOpen: true,
        reason: "ช่วงเตรียมตัว — ร่าง TOR เปิดรับฟังความเห็น ยังไม่เปิดให้ยื่นข้อเสนอ",
      };
    }
    return {
      phase: "bidding",
      isOpen: true,
      reason: "ช่วงเสนอราคา — ประกาศเชิญชวนแล้ว ยังไม่มีสัญญา (อาจปิดรับข้อเสนอแล้วและอยู่ระหว่างพิจารณา)",
    };
  }

  // An unrecognised status is closed by default, and says so, so that a new
  // value from e-GP shows up in the data instead of silently misleading users.
  return {
    phase: "awarded",
    isOpen: false,
    reason: status
      ? `ไม่รู้จักสถานะ "${status}" — ถือว่าปิดไว้ก่อนเพื่อความปลอดภัย`
      : "ไม่มีข้อมูลสถานะสัญญา — ถือว่าปิดไว้ก่อน",
  };
}
