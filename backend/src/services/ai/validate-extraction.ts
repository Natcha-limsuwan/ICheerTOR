/**
 * Check an extraction against what the numbers must be, and fix what can be
 * fixed without guessing.
 *
 * The model reads scans; scans turn ๘ into ๕. Several thresholds in a BMA
 * TOR are not free choices, though — they follow Comptroller General's
 * Department rules from the project budget, which we have from egp2. So:
 *
 *   amount in words ≠ digits          use the words (a misread digit is far
 *                                      likelier than misread words) — corrected
 *   registered capital ≠ rule tier    flag for review, keep what was read — an
 *                                      agency may set its own figure
 *   "1 ใน 4 ของงบประมาณ"              compute from the budget — filled
 *   net worth "must be positive"      0 — filled
 *   past-work value > 50% of budget   flag for review
 *
 * Nothing here calls the model; it is deterministic and cheap to re-run.
 */

import { env } from "../../config/env";
import { parseThaiAmountWords } from "./thai-number";
import type { TorExtractionV3, QualificationV3 } from "./prompts/v3";
import type { PriceFieldV4, TorExtractionV4 } from "./prompts/v4";

export type IssueSeverity = "corrected" | "filled" | "review" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  field: string;
  message: string;
  /** Value the model returned. */
  from?: unknown;
  /** Value after correction, or the expected value for "review". */
  to?: unknown;
}

export interface ValidationContext {
  /** วงเงินงบประมาณ from egp2 — the figure e-GP bases bid bonds on. */
  budget?: number | null;
  medianPriceFromSource?: number | null;
}

export interface ValidationResult<T> {
  output: T;
  issues: ValidationIssue[];
  needsReview: boolean;
}

/**
 * Minimum paid-up registered capital by project budget, per the
 * Comptroller General's Department circular ว 124 (2023).
 * [upper bound of budget (inclusive), minimum capital]
 */
const CAPITAL_TIERS: Array<[number, number]> = [
  [1_000_000, 0],
  [5_000_000, 1_000_000],
  [10_000_000, 2_000_000],
  [20_000_000, 3_000_000],
  [60_000_000, 8_000_000],
  [150_000_000, 20_000_000],
  [300_000_000, 60_000_000],
  [500_000_000, 100_000_000],
  [Infinity, 200_000_000],
];

export function requiredRegisteredCapital(budget: number): number {
  return CAPITAL_TIERS.find(([upTo]) => budget <= upTo)![1];
}

const QUARTER_OF_BUDGET = /1\s*ใน\s*4|๑\s*ใน\s*๔|หนึ่งในสี่|ร้อยละ\s*(25|๒๕)\s*ของ(มูลค่า)?(วงเงิน)?งบประมาณ/;
const MUST_BE_POSITIVE = /(แสดง)?ค่าเป็นบวก/;
/** A duration quote must name a period of work or delivery with a number. */
const DURATION_EVIDENCE = /(ดำเนินการ|แล้วเสร็จ|ส่งมอบ|ปฏิบัติงาน|ระยะเวลา).*[\d๐-๙]+\s*(วัน|เดือน|ปี)/;
/** Licence terms and warranties — not how long the work takes. */
const NOT_A_DURATION = /subscription|(อายุ|ระยะเวลา)(การใช้งาน|ใช้สิทธิ|สิทธิ|ลิขสิทธิ์|license)|รับประกัน/i;
/** Past-work requirements above this share of the budget are unusual. */
const MAX_WORK_SHARE = 0.5;

const fmt = (n: number) => n.toLocaleString("th-TH");

/** v4 splits the document's figures into budget and medianPrice, each with words. */
const isV4 = (o: TorExtractionV3 | TorExtractionV4): o is TorExtractionV4 => "budget" in o;

export function validateExtraction<T extends TorExtractionV3 | TorExtractionV4>(
  input: T,
  ctx: ValidationContext,
): ValidationResult<T> {
  const output = structuredClone(input);
  const issues: ValidationIssue[] = [];
  const budget = ctx.budget ?? (isV4(input) ? input.budget.value : null) ?? input.medianPrice.value ?? null;

  // v4 items carry clauseNumber too; spreading keeps it.
  output.qualifications = (output.qualifications as QualificationV3[]).map((q, i): QualificationV3 => {
    const field = `qualifications[${i}]`;
    const next = { ...q };

    // Words beat digits.
    if (next.amountWords && next.minimumNumber != null) {
      const fromWords = parseThaiAmountWords(next.amountWords);
      if (fromWords != null && fromWords !== next.minimumNumber) {
        issues.push({
          severity: "corrected",
          field: `${field}.minimumNumber`,
          message: `ตัวเลข ${fmt(next.minimumNumber)} ไม่ตรงกับคำอ่าน "${next.amountWords}" — ใช้ค่าจากคำอ่าน`,
          from: next.minimumNumber,
          to: fromWords,
        });
        next.minimumNumber = fromWords;
      }
    }

    // Shares of the budget are computed, not read.
    if (next.minimumNumber == null && budget && QUARTER_OF_BUDGET.test(next.criterion)) {
      next.minimumNumber = budget / 4;
      next.unit = "THB";
      issues.push({
        severity: "filled",
        field: `${field}.minimumNumber`,
        message: `คำนวณ 1 ใน 4 ของวงเงินงบประมาณ ${fmt(budget)} บาท`,
        to: next.minimumNumber,
      });
    }

    if (next.type === "net_worth" && next.minimumNumber == null && MUST_BE_POSITIVE.test(next.criterion)) {
      next.minimumNumber = 0;
      next.unit = "THB";
      issues.push({ severity: "filled", field: `${field}.minimumNumber`, message: "มูลค่าสุทธิต้องเป็นบวก → 0", to: 0 });
    }

    // Registered capital follows the budget tier.
    if (next.type === "registered_capital" && next.minimumNumber != null && ctx.budget) {
      const expected = requiredRegisteredCapital(ctx.budget);
      if (expected > 0 && next.minimumNumber !== expected) {
        issues.push({
          severity: "review",
          field: `${field}.minimumNumber`,
          message:
            `ทุนจดทะเบียนที่อ่านได้ ${fmt(next.minimumNumber)} บาท ไม่ตรงกับเกณฑ์กรมบัญชีกลาง ` +
            `สำหรับงบ ${fmt(ctx.budget)} บาท (${fmt(expected)} บาท) — อาจอ่านตัวเลขผิด`,
          from: next.minimumNumber,
          to: expected,
        });
      }
    }

    if (next.type === "contract_value" && next.minimumNumber != null && budget) {
      const share = next.minimumNumber / budget;
      if (share > MAX_WORK_SHARE) {
        issues.push({
          severity: "review",
          field: `${field}.minimumNumber`,
          message: `ผลงานขั้นต่ำ ${fmt(next.minimumNumber)} บาท เป็น ${Math.round(share * 100)}% ของงบ — สูงผิดปกติหรืออ่านผิด`,
          from: next.minimumNumber,
        });
      }
    }

    if (next.minimumNumber == null) next.unit = null;

    if (next.confidence < env.AI_CONFIDENCE_THRESHOLD && !next.isBoilerplate) {
      issues.push({
        severity: "review",
        field: `${field}.confidence`,
        message: `ความมั่นใจต่ำ (${next.confidence}) — "${next.criterion.slice(0, 60)}"`,
      });
    }
    return next;
  }) as T["qualifications"];

  // The document's figures and egp2's can legitimately differ (revisions,
  // budget and reference price labelled the other way round) — and egp2 has
  // typos of its own (a ราคากลาง of 3,398,000 on a 23,398,000 project). So a
  // difference is shown, never blocked on or "fixed".
  const sources = [ctx.medianPriceFromSource, ctx.budget].filter((v): v is number => v != null && v > 0);
  const compare = (field: string, label: string, read: number | null) => {
    if (read == null || !sources.length || sources.includes(read)) return;
    issues.push({
      severity: "info",
      field,
      message:
        `${label}ในเอกสาร ${fmt(read)} บาท ไม่ตรงกับระบบ e-GP ` +
        `(${sources.map((s) => `${fmt(s)} บาท`).join(" / ")})`,
      from: read,
      to: sources,
    });
  };

  if (isV4(output)) {
    const v4 = output as TorExtractionV4;

    // A duration needs a quoted sentence that states one — not a licence
    // term ("Subscription ระยะเวลา 3 ปี" became 1095 days) or a warranty.
    const days = v4.scopeOfWork.contractDurationDays;
    const evidence = v4.scopeOfWork.contractDurationText ?? "";
    if (days != null && (!DURATION_EVIDENCE.test(evidence) || NOT_A_DURATION.test(evidence))) {
      issues.push({
        severity: "corrected",
        field: "scopeOfWork.contractDurationDays",
        message: `ตัดระยะเวลาดำเนินการ ${days} วัน — หลักฐาน "${evidence.slice(0, 60)}" ไม่ใช่ระยะเวลาดำเนินการ`,
        from: days,
        to: null,
      });
      v4.scopeOfWork = { ...v4.scopeOfWork, contractDurationDays: null, contractDurationText: null };
    }

    v4.budget = checkWords(v4.budget, "budget.value", issues);
    v4.medianPrice = checkWords(v4.medianPrice, "medianPrice.value", issues);
    // Compared with egp2 and the e-GP announcement in resolve-prices.ts.
  } else {
    compare("medianPrice.value", "วงเงิน", output.medianPrice.value);
  }

  // The model also reports "conflicts" where both texts say the same thing
  // or one document is merely silent. Neither is a conflict for the user.
  const same = (a: string, b: string) =>
    a.replace(/[\s.,()]/g, "") === b.replace(/[\s.,()]/g, "");
  // "(ไม่ได้ระบุตัวเลขในร่างเอกสาร ...)" — the model wraps silence in brackets too.
  const SILENT = /^[\s("'“]*(ไม่ระบุ|ไม่มี|ไม่ได้(ระบุ|กำหนด|กล่าวถึง))/;
  const before = output.documentConflicts?.length ?? 0;
  output.documentConflicts = (output.documentConflicts ?? []).filter(
    (c) => !same(c.torText, c.biddingDocText) && !SILENT.test(c.torText.trim()) && !SILENT.test(c.biddingDocText.trim()),
  );
  if (output.documentConflicts.length < before) {
    issues.push({
      severity: "info",
      field: "documentConflicts",
      message: `ตัดรายการ "ขัดกัน" ที่ข้อความเหมือนกันหรือฉบับหนึ่งไม่ได้ระบุ ${before - output.documentConflicts.length} รายการ`,
    });
  }

  if (output.documentConflicts.length) {
    issues.push({
      severity: "info",
      field: "documentConflicts",
      message: `TOR กับเอกสารประกวดราคาขัดกัน ${output.documentConflicts.length} เรื่อง`,
    });
  }

  return { output, issues, needsReview: issues.some((i) => i.severity === "review") };
}

/** Words beat digits for the document's own price figures too. */
function checkWords(p: PriceFieldV4, field: string, issues: ValidationIssue[]): PriceFieldV4 {
  if (!p.amountWords || p.value == null) return p;
  const fromWords = parseThaiAmountWords(p.amountWords);
  if (fromWords == null || fromWords === p.value) return p;
  issues.push({
    severity: "corrected",
    field,
    message: `ตัวเลข ${fmt(p.value)} ไม่ตรงกับคำอ่าน "${p.amountWords}" — ใช้ค่าจากคำอ่าน`,
    from: p.value,
    to: fromWords,
  });
  return { ...p, value: fromWords };
}
