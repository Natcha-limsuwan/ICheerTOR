/**
 * Decide the budget and reference price shown to users, from three sources.
 *
 *   egp2 API          primary — official, and on every record from ingest
 *   e-GP announcement exact text with the amount in words ("ราคากลางของงาน…
 *                     เป็นเงินทั้งสิ้น X บาท"), and the bid bond in doc_ (5 %
 *                     of the budget)
 *   TOR, read by AI   a scan — may misread a digit (23,398,000 → 23,388,000)
 *
 * egp2 wins unless it is clearly broken. It has dropped digits before
 * (ราคากลาง 3,398,000 on a 23,398,000 project), which the announcement shows
 * and corrects. Any other disagreement keeps egp2 and asks a person to check.
 *
 * Note: BMA TORs often call the reference price "วงเงินงบประมาณ"; the budget
 * proper is egp2's projectBudget, which e-GP bases the bid bond on.
 */

import type { IMedianPrice } from "../../db/models/tor-record";
import type { ArchiveFacts } from "../ingestion/archive-facts";
import type { ValidationIssue } from "./validate-extraction";

export interface PriceSources {
  egp2Budget?: number | null;
  egp2MedianPrice?: number | null;
  facts: Pick<ArchiveFacts, "medianPrice" | "bidBond">;
  /** Figures the model read from the TOR, whatever the TOR called them. */
  documentFigures?: Array<number | null | undefined>;
}

export interface ResolvedPrices {
  medianPrice: IMedianPrice;
  /** Budget for the rules (¼-of-budget, past-work share): egp2's. */
  budget: number | null;
  issues: ValidationIssue[];
}

const fmt = (n: number) => n.toLocaleString("th-TH");
/** e-GP's bid bond is 5 % of the budget. */
const BID_BOND_SHARE = 0.05;

/**
 * egp2's ราคากลาง is normally close to the budget. One far off it is a typo
 * in the source. True when there is no budget to compare with.
 */
export function isPlausibleMedianPrice(median: number, budget: number | null | undefined): boolean {
  return !budget || (median >= budget * 0.3 && median <= budget * 1.5);
}

/** "3398000" is "23398000" with digits missing. */
export function hasDroppedDigits(short: number, full: number): boolean {
  const a = String(Math.round(short));
  const b = String(Math.round(full));
  if (a.length >= b.length) return false;
  let i = 0;
  for (const ch of b) if (ch === a[i]) i++;
  return i === a.length;
}

export function resolvePrices(src: PriceSources): ResolvedPrices {
  const issues: ValidationIssue[] = [];
  const budget = src.egp2Budget ?? null;
  const egp2 = src.egp2MedianPrice ?? null;
  const announced = src.facts.medianPrice;
  const fromTor = (src.documentFigures ?? []).filter((v): v is number => v != null && v > 0);

  let medianPrice: IMedianPrice;
  const egp2Usable = egp2 != null && egp2 > 0 && isPlausibleMedianPrice(egp2, budget);

  if (egp2Usable && (!announced || announced.value === egp2)) {
    medianPrice = { value: egp2, confidence: 1, source: "egp2" };
  } else if (egp2Usable && announced && hasDroppedDigits(egp2, announced.value)) {
    medianPrice = { value: announced.value, confidence: 1, source: "announcement" };
    issues.push({
      severity: "corrected",
      field: "medianPrice",
      message: `ราคากลางใน egp2 ${fmt(egp2)} บาท เลขตกหล่น — ใช้ ${fmt(announced.value)} บาทตามประกาศ e-GP`,
      from: egp2,
      to: announced.value,
    });
  } else if (egp2Usable && announced) {
    // Both official and they disagree: egp2 stays, a person decides.
    medianPrice = { value: egp2, confidence: 0.5, source: "egp2" };
    issues.push({
      severity: "review",
      field: "medianPrice",
      message: `ราคากลาง egp2 ${fmt(egp2)} บาท ไม่ตรงกับประกาศ e-GP ${fmt(announced.value)} บาท`,
      from: egp2,
      to: announced.value,
    });
  } else if (announced) {
    medianPrice = { value: announced.value, confidence: 1, source: "announcement" };
    if (egp2 != null) {
      const what = !egp2
        ? "ไม่มีราคากลาง (0)"
        : hasDroppedDigits(egp2, announced.value)
          ? `เป็น ${fmt(egp2)} บาท เลขตกหล่น`
          : `เป็น ${fmt(egp2)} บาท ผิดปกติเมื่อเทียบกับงบ`;
      issues.push({
        severity: "corrected",
        field: "medianPrice",
        message: `egp2 ${what} — ใช้ ${fmt(announced.value)} บาทตามประกาศ e-GP`,
        from: egp2,
        to: announced.value,
      });
    }
  } else {
    // No announcement figure. A broken egp2 value is still not shown as
    // authoritative; the TOR's figure stands in, marked for review.
    const tor = fromTor.find((v) => isPlausibleMedianPrice(v, budget)) ?? null;
    medianPrice = { value: tor, confidence: tor != null ? 0.5 : 0, source: tor != null ? "document" : null };
    if (egp2 != null) {
      issues.push({
        severity: "review",
        field: "medianPrice",
        message:
          `ราคากลางใน egp2 ${fmt(egp2)} บาท ผิดปกติเมื่อเทียบกับงบ ${fmt(budget ?? 0)} บาท และไม่พบในประกาศ` +
          (tor != null ? ` — ใช้ ${fmt(tor)} บาทจาก TOR ไปก่อน` : ""),
        from: egp2,
        to: tor,
      });
    }
  }

  // The TOR agrees with neither: most likely a misread scan. Shown, not used.
  if (medianPrice.value != null && fromTor.length && !fromTor.includes(medianPrice.value)) {
    const near = fromTor.find((v) => Math.abs(v - medianPrice.value!) / medianPrice.value! < 0.01);
    if (near != null) {
      issues.push({
        severity: "info",
        field: "documentPrices",
        message: `TOR (อ่านจากสแกน) ได้ ${fmt(near)} บาท ต่างจากราคากลาง ${fmt(medianPrice.value)} บาทเล็กน้อย — น่าจะอ่านเลขผิด`,
      });
    }
  }

  // Budget: egp2 only, checked against the bid bond (5 % of the budget).
  const bond = src.facts.bidBond;
  if (budget && bond && Math.abs(bond.value / BID_BOND_SHARE - budget) > budget * 0.01) {
    issues.push({
      severity: "info",
      field: "budget",
      message:
        `หลักประกันการเสนอราคา ${fmt(bond.value)} บาท ไม่ใช่ 5% ของงบ egp2 ${fmt(budget)} บาท ` +
        `(5% ของ ${fmt(bond.value / BID_BOND_SHARE)} บาท)`,
    });
  } else if (!budget && bond) {
    issues.push({
      severity: "review",
      field: "budget",
      message: `egp2 ไม่มีวงเงินงบประมาณ — จากหลักประกันการเสนอราคาน่าจะเป็น ${fmt(bond.value / BID_BOND_SHARE)} บาท`,
    });
  }

  return { medianPrice, budget, issues };
}
