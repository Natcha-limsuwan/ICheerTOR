import { IParsedData, IRedFlag } from "../../db/models/tor-record";

/**
 * Rule-based red flags. Deterministic — no model calls.
 *
 * Only serious problems, and only ones code can check: a flag users learn to
 * ignore is worse than none. The model's riskClauses are evidence, not
 * verdicts — in the first eval runs most of them were normal BMA practice
 * (dealer letters for licensed products, the standard 0.20 %/day penalty,
 * brand names in a licence renewal). So each rule re-checks the evidence
 * against a threshold or drops it:
 *
 *   RF-001  brand or spec lock      brand_lock/narrow_spec clause, not
 *                                   "or equivalent", not a dealer letter,
 *                                   and not a renewal/maintenance of an
 *                                   existing system
 *   RF-002  past-work bar too high  required contract value > 50 % of budget
 *   RF-004  penalty above the rule  a daily rate above 0.20 %
 *
 * TOR/bidding-document conflicts (e.g. a penalty computed on the whole
 * contract value in one and on undelivered goods in the other) are shown
 * as documentConflicts, not here — BMA rules on those, it is not a lock-in.
 */

type Phase = "public_hearing" | "bidding" | "awarded" | "cancelled";

export interface RedFlagContext {
  phase: Phase;
  /** วงเงินงบประมาณ from egp2. Falls back to the document's own figure. */
  budget?: number | null;
}

/** Past-work requirements above this share of the budget shut out bidders. */
const MAX_WORK_SHARE = 0.5;
/** Highest daily penalty the procurement regulation allows, in percent. */
const MAX_DAILY_PENALTY = 0.2;

const DEALER_LETTER = /แต่งตั้ง.{0,20}ตัวแทนจำหน่าย|ตัวแทนจำหน่าย.{0,40}แต่งตั้ง/;
const OR_EQUIVALENT = /เทียบเท่า|or equivalent/i;
/** Renewing or maintaining an existing system has to name its products. */
const EXISTING_SYSTEM_WORK = new Set(["license", "maintenance"]);

const ACTION: Record<"comment" | "consider", string> = {
  comment: "ยื่นความคิดเห็นในช่วงรับฟังความคิดเห็นร่าง TOR พร้อมเหตุผลและข้อเสนอที่เปิดการแข่งขันมากขึ้น",
  consider: "ประเมินว่าบริษัทผ่านเงื่อนไขนี้หรือไม่ก่อนเตรียมยื่นข้อเสนอ หากเห็นว่าไม่เป็นธรรมสามารถสอบถามหน่วยงานได้",
};

const fmt = (n: number) => n.toLocaleString("th-TH");

export function analyzeRedFlags(parsed: IParsedData, ctx: RedFlagContext): IRedFlag[] {
  if (ctx.phase === "awarded" || ctx.phase === "cancelled") return [];
  const action = ctx.phase === "public_hearing" ? ACTION.comment : ACTION.consider;
  const flags: IRedFlag[] = [];

  // RF-001
  if (!EXISTING_SYSTEM_WORK.has(parsed.workType ?? "")) {
    for (const r of parsed.riskClauses ?? []) {
      if (r.category !== "brand_lock" && r.category !== "narrow_spec") continue;
      if (DEALER_LETTER.test(r.clauseText) || OR_EQUIVALENT.test(r.clauseText)) continue;
      flags.push({
        ruleId: "RF-001",
        severity: "critical",
        clauseText: r.clauseText,
        reason: `ระบุยี่ห้อหรือคุณลักษณะเฉพาะโดยไม่มี "หรือเทียบเท่า" — ${r.reason}`,
        recommendedAction: action,
      });
    }
  }

  // RF-002
  const budget =
    ctx.budget ?? parsed.documentPrices?.budget.value ?? parsed.medianPrice?.value ?? null;
  if (budget) {
    for (const q of parsed.qualifications) {
      if (q.type !== "contract_value" || typeof q.minimumValue !== "number") continue;
      const share = q.minimumValue / budget;
      if (share <= MAX_WORK_SHARE) continue;
      flags.push({
        ruleId: "RF-002",
        severity: share >= 1 ? "critical" : "warning",
        clauseText: q.criterion,
        reason:
          `ต้องมีผลงานขั้นต่ำ ${fmt(q.minimumValue)} บาท = ${Math.round(share * 100)}% ของงบ ` +
          `${fmt(budget)} บาท (ปกติไม่เกิน ${MAX_WORK_SHARE * 100}%)`,
        recommendedAction: action,
      });
    }
  }

  // RF-004
  for (const r of parsed.riskClauses ?? []) {
    if (r.category !== "unusual_penalty") continue;
    const rate = dailyPenaltyPercent(r.clauseText);
    if (rate == null || rate <= MAX_DAILY_PENALTY) continue;
    flags.push({
      ruleId: "RF-004",
      severity: "warning",
      clauseText: r.clauseText,
      reason: `ค่าปรับร้อยละ ${rate} ต่อวัน สูงกว่าอัตราตามระเบียบ (ไม่เกินร้อยละ ${MAX_DAILY_PENALTY})`,
      recommendedAction: action,
    });
  }

  return flags;
}

/** "ร้อยละ ๐.๕๐ ... ต่อวัน" → 0.5. Null unless the clause is a daily rate. */
export function dailyPenaltyPercent(text: string): number | null {
  const ascii = text.replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)));
  const m = /ร้อยละ\s*(\d+(?:\.\d+)?)/.exec(ascii);
  return m && /ต่อวัน|วันละ/.test(ascii) ? Number(m[1]) : null;
}
