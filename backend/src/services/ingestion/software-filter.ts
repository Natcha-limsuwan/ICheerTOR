/**
 * Decide whether a procurement record is software work.
 *
 * The API has no software category, so classification is ours to make. It runs
 * on the title and project type — text we already have from the API — so it
 * costs nothing and happens before any document is fetched or any LLM is
 * called.
 *
 * Keywords are tiered rather than flat, because a flat list let single broad
 * words carry a record on their own: "ระบบ" alone matched a drainage tunnel and
 * "คอมพิวเตอร์" matched eye drops bought with a computerised dispenser. So:
 *
 *   strong (+4)        one hit is enough — "ซอฟต์แวร์", "พัฒนาระบบ"
 *   weak (+1)          broad words; two or more needed to reach the threshold
 *   exclude (-5)       construction, medicine, cleaning — outranks any match
 *   hardwareOnly (-4)  buying machines with no development work
 *
 * hardwareOnly is separate from exclude because a purchase can be both: "ซื้อ
 * ระบบจัดเก็บภาพทางการแพทย์พร้อมโปรแกรม" is hardware plus real software work,
 * and a strong hit should still be able to outweigh the penalty.
 *
 * Every decision carries its reason so the keyword list can be tuned against
 * real misses instead of guesswork.
 *
 * Pass the project title only, not the agency name: agency names contain
 * keywords too ("สำนักงานพัฒนาระบบสาธารณสุข" hits "พัฒนาระบบ"), which let
 * every purchase that agency made through as software.
 */

import keywords from "./keywords/software-keywords.json";

const STRONG_WEIGHT = 4;
const WEAK_WEIGHT = 1;
const EXCLUDE_WEIGHT = -5;
const HARDWARE_WEIGHT = -4;

/** At or above this, treat as software. */
export const SOFTWARE_THRESHOLD = 4;
/** Between this and the threshold: keep, but flag for human review. */
export const UNCERTAIN_THRESHOLD = 2;

export interface FilterResult {
  isSoftware: boolean;
  /** True when the score is positive but weak — worth a human look. */
  isUncertain: boolean;
  score: number;
  /** Strong and weak hits combined, for display. */
  matched: string[];
  strong: string[];
  weak: string[];
  excluded: string[];
  hardware: string[];
  reason: string;
}

function hits(list: string[], haystack: string): string[] {
  return list.filter((k) => haystack.includes(k.toLowerCase()));
}

export function scoreSoftware(...texts: Array<string | undefined>): FilterResult {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();

  const strong = hits(keywords.strong, haystack);
  const weak = hits(keywords.weak, haystack);
  const excluded = hits(keywords.exclude, haystack);
  const hardware = hits(keywords.hardwareOnly, haystack);

  const score =
    strong.length * STRONG_WEIGHT +
    weak.length * WEAK_WEIGHT +
    excluded.length * EXCLUDE_WEIGHT +
    hardware.length * HARDWARE_WEIGHT;

  const isSoftware = score >= UNCERTAIN_THRESHOLD;
  const isUncertain = isSoftware && score < SOFTWARE_THRESHOLD;
  const matched = [...strong, ...weak];

  let reason: string;
  if (!isSoftware) {
    if (excluded.length) {
      reason = `ตกรอบ: เป็นงานประเภทอื่น (${excluded.join(", ")})`;
    } else if (hardware.length && !strong.length) {
      reason = `ตกรอบ: ซื้อฮาร์ดแวร์อย่างเดียว (${hardware.join(", ")})`;
    } else if (weak.length && !strong.length) {
      reason = `ตกรอบ: พบแต่คำกว้าง (${weak.join(", ")}) ไม่พอชี้ว่าเป็นงาน software`;
    } else {
      reason = "ตกรอบ: ไม่พบคำที่เกี่ยวกับ software";
    }
  } else if (isUncertain) {
    reason = `ก้ำกึ่ง: ${matched.join(", ")} — คะแนน ${score} ควรให้คนตรวจ`;
  } else {
    reason = `เข้าเกณฑ์: ${(strong.length ? strong : matched).join(", ")}`;
  }

  return { isSoftware, isUncertain, score, matched, strong, weak, excluded, hardware, reason };
}
