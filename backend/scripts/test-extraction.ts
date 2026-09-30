/**
 * Offline checks for the deterministic half of TOR extraction — everything
 * that decides or corrects what the model returns, without calling it:
 *
 *   1. archive-facts          submission date / duration from e-GP forms
 *   2. validate-extraction    words beat digits, duration evidence
 *   3. red-flag-analyzer      only serious, code-checkable flags
 *   4. qualification-matcher  boilerplate skipped, alternative groups
 *
 * Usage (in container):
 *   docker compose --profile tools run --rm tools npm run test:extraction
 */

import { readArchiveFacts, readSubmissionDate } from "../src/services/ingestion/archive-facts";
import { isPlausibleMedianPrice, validateExtraction } from "../src/services/ai/validate-extraction";
import { analyzeRedFlags, dailyPenaltyPercent } from "../src/services/ai/red-flag-analyzer";
import { matchQualifications } from "../src/services/matching/qualification-matcher";
import { parseThaiAmountWords } from "../src/services/ai/thai-number";
import type { TorExtractionV4 } from "../src/services/ai/prompts/v4";
import type { IParsedData, IQualification } from "../src/db/models/tor-record";
import type { IVendorProfile } from "../src/db/models/vendor-profile";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
}
const show = (v: unknown) => JSON.stringify(v);

/* 1 ─────────────────────────────────────────────────────────────────── */

function testArchiveFacts() {
  console.log("\n[1] archive-facts");
  const confirmed = readSubmissionDate([
    {
      fileName: "annoudoc.pdf",
      text:
        "๒. ผู้ยื่นข้อเสนอต้องเสนอราคาทางระบบจัดซื้อจัดจ้างภาครัฐด้วยอิเล็กทรอนิกส์ในวันที่ ๑๖\n" +
        "มีนาคม ๒๕๖๙ระหว่างเวลา๐๙.๐๐น. ถึง๑๒.๐๐น. ซึ่งสามารถ",
    },
  ]);
  check("วันยื่นที่กรอกแล้ว → confirmed", confirmed.status === "confirmed" && confirmed.date === "2026-03-16");
  check("ช่วงเวลา 09:00–12:00", confirmed.startTime === "09:00" && confirmed.endTime === "12:00");
  check("closesAt เป็นเวลาไทย", confirmed.closesAt?.toISOString() === "2026-03-16T05:00:00.000Z");

  const blank = readSubmissionDate([
    { fileName: "annoudoc.pdf", text: "ผู้ยื่นข้อเสนอต้องเสนอราคาทางระบบ ... ในวันที่\nระหว่างเวลา น. ถึง น. ซึ่ง" },
  ]);
  check("แบบฟอร์มยังว่าง → pending", blank.status === "pending" && blank.date === null && blank.rawText != null);

  const bad = readSubmissionDate([
    { fileName: "a.pdf", text: "เสนอราคาทางระบบในวันที่ ๓๑ กุมภาพันธ์ ๒๕๖๙ ระหว่างเวลา ๐๙.๐๐ น. ถึง ๑๒.๐๐ น." },
  ]);
  check("วันที่ที่ไม่มีจริง → pending", bad.status === "pending");

  const facts = readArchiveFacts([
    { fileName: "doc_1.pdf", text: "๔.๓ ผู้ยื่นข้อเสนอจะต้องเสนอกำหนดเวลาส่งมอบพัสดุไม่เกิน๑๕๐วันนับถัดจาก" },
  ]);
  check("ข้อ 4.3 → 150 วัน", facts.contractDuration?.days === 150, show(facts.contractDuration));
  const blankDuration = readArchiveFacts([{ fileName: "doc_1.pdf", text: "กำหนดเวลาส่งมอบพัสดุไม่เกิน วันนับถัดจาก" }]);
  check("ข้อ 4.3 ว่าง → null", blankDuration.contractDuration === null);
}

/* 2 ─────────────────────────────────────────────────────────────────── */

function extraction(overrides: Partial<TorExtractionV4> = {}): TorExtractionV4 {
  const price = { value: null, amountWords: null, sourcePage: null, confidence: 0 };
  return {
    documentCheck: { isTor: true, documentType: "tor", hasScannedPages: true },
    workType: "license",
    scopeOfWork: {
      summary: "",
      keyPoints: [],
      deliverables: [],
      contractDurationDays: null,
      contractDurationText: null,
      sourcePages: [],
      confidence: 1,
    },
    qualifications: [],
    evaluationCriteria: { method: "lowest_price", summary: null, weights: [], sourcePage: null, confidence: 1 },
    keyDates: { warrantyMonths: { value: 12, confidence: 1 } },
    budget: price,
    medianPrice: price,
    riskClauses: [],
    documentConflicts: [],
    ...overrides,
  };
}

function testValidator() {
  console.log("\n[2] validate-extraction");
  const words = validateExtraction(
    extraction({
      budget: { value: 23_388_000, amountWords: "(ยี่สิบสามล้านสามแสนเก้าหมื่นแปดพันบาทถ้วน)", sourcePage: 8, confidence: 1 },
    }),
    { budget: 23_500_000 },
  );
  check("budget: คำอ่านชนะตัวเลข (23,388,000 → 23,398,000)", words.output.budget.value === 23_398_000);

  const licence = validateExtraction(
    extraction({
      scopeOfWork: {
        ...extraction().scopeOfWork,
        contractDurationDays: 1095,
        contractDurationText: "สิทธิ์การใช้งานเป็นแบบ Subscription ระยะเวลา 3 ปี",
      },
    }),
    {},
  );
  check("อายุ subscription ไม่ใช่ระยะเวลาดำเนินการ → null", licence.output.scopeOfWork.contractDurationDays === null);

  const real = validateExtraction(
    extraction({
      scopeOfWork: {
        ...extraction().scopeOfWork,
        contractDurationDays: 120,
        contractDurationText: "ระยะเวลาดำเนินการ ๑๒๐ วัน นับถัดจากวันลงนามในสัญญา",
      },
    }),
    {},
  );
  check("ระยะเวลาดำเนินการจริงคงไว้", real.output.scopeOfWork.contractDurationDays === 120);

  const conflicts = validateExtraction(
    extraction({
      documentConflicts: [
        { topic: "งบประมาณ", torText: "๑๐,๖๒๐,๐๐๐ บาท", biddingDocText: "(ไม่ได้ระบุตัวเลขในร่างเอกสาร)", torPage: 6 },
        { topic: "รับประกัน", torText: "ตลอดระยะเวลาตามสัญญา", biddingDocText: "ไม่น้อยกว่า ๑ ปี", torPage: 6 },
      ],
    }),
    {},
  );
  check("ตัดเรื่องที่ฉบับหนึ่งไม่ได้ระบุ (มีวงเล็บนำ)", conflicts.output.documentConflicts.length === 1);
  check("ราคากลาง egp2 3,398,000 บนงบ 23.5 ล้าน = พิมพ์ผิด", !isPlausibleMedianPrice(3_398_000, 23_500_000));
  check("ราคากลาง egp2 10.62 ล้านบนงบ 11.8 ล้าน = ปกติ", isPlausibleMedianPrice(10_620_000, 11_800_000));
  check("parseThaiAmountWords", parseThaiAmountWords("(สิบล้านหกแสนสองหมื่นบาทถ้วน)") === 10_620_000);
}

/* 3 ─────────────────────────────────────────────────────────────────── */

function parsed(overrides: Partial<IParsedData> = {}): IParsedData {
  return {
    workType: "development",
    scopeOfWork: { confidence: 1 },
    qualifications: [],
    medianPrice: { value: null, confidence: 0 },
    evaluationCriteria: { confidence: 1 },
    riskClauses: [],
    ...overrides,
  };
}

function testRedFlags() {
  console.log("\n[3] red-flag-analyzer");
  const dealer = analyzeRedFlags(
    parsed({
      riskClauses: [
        {
          clauseText: "ผู้ยื่นข้อเสนอต้องได้รับหนังสือการแต่งตั้งตัวแทนจำหน่ายโดยตรงจากบริษัทเจ้าของผลิตภัณฑ์",
          category: "brand_lock",
          reason: "ต้องมีหนังสือแต่งตั้ง",
        },
      ],
    }),
    { phase: "public_hearing" },
  );
  check("หนังสือแต่งตั้งตัวแทนจำหน่าย ไม่ติดธง", dealer.length === 0, show(dealer));

  const renewal = analyzeRedFlags(
    parsed({
      workType: "license",
      riskClauses: [{ clauseText: "ต่ออายุ VMware Cloud Foundation", category: "brand_lock", reason: "ระบุยี่ห้อ" }],
    }),
    { phase: "public_hearing" },
  );
  check("ระบุยี่ห้อในงานต่ออายุ license ไม่ติดธง", renewal.length === 0);

  const lock = analyzeRedFlags(
    parsed({ riskClauses: [{ clauseText: "ต้องใช้ฐานข้อมูล Oracle เท่านั้น", category: "brand_lock", reason: "ระบุยี่ห้อ" }] }),
    { phase: "public_hearing" },
  );
  check("ระบุยี่ห้อในงานพัฒนา โดยไม่มีเทียบเท่า → RF-001", lock.length === 1 && lock[0].ruleId === "RF-001");

  const equivalent = analyzeRedFlags(
    parsed({ riskClauses: [{ clauseText: "ฐานข้อมูล Oracle หรือเทียบเท่า", category: "brand_lock", reason: "ระบุยี่ห้อ" }] }),
    { phase: "public_hearing" },
  );
  check("มีคำว่าหรือเทียบเท่า ไม่ติดธง", equivalent.length === 0);

  const work = (value: number): IQualification => ({
    criterion: "ผลงาน",
    type: "contract_value",
    minimumValue: value,
    confidence: 1,
  });
  const normal = analyzeRedFlags(parsed({ qualifications: [work(10_000_000)] }), { phase: "bidding", budget: 24_718_950 });
  check("ผลงาน 40% ของงบ ไม่ติดธง", normal.length === 0);
  const high = analyzeRedFlags(parsed({ qualifications: [work(20_000_000)] }), { phase: "bidding", budget: 24_718_950 });
  check("ผลงาน 81% ของงบ → RF-002 warning", high.length === 1 && high[0].severity === "warning");

  check("ค่าปรับ 0.20% ต่อวัน = ตามระเบียบ", dailyPenaltyPercent("ค่าปรับเป็นรายวันในอัตราร้อยละ ๐.๒๐ ต่อวัน") === 0.2);
  const penalty = analyzeRedFlags(
    parsed({
      riskClauses: [{ clauseText: "ค่าปรับอัตราร้อยละ ๑.๐ ต่อวัน", category: "unusual_penalty", reason: "สูง" }],
    }),
    { phase: "bidding" },
  );
  check("ค่าปรับ 1% ต่อวัน → RF-004", penalty.length === 1 && penalty[0].ruleId === "RF-004");
  check(
    "โครงการที่ได้ผู้ชนะแล้ว ไม่วิเคราะห์",
    analyzeRedFlags(parsed({ qualifications: [work(20_000_000)] }), { phase: "awarded", budget: 1 }).length === 0,
  );
}

/* 4 ─────────────────────────────────────────────────────────────────── */

function testMatcher() {
  console.log("\n[4] qualification-matcher");
  const profile = { registeredCapital: 10_000_000, pastContracts: [], personnel: [] } as unknown as IVendorProfile;
  const q = (over: Partial<IQualification>): IQualification => ({
    criterion: "x",
    type: "other",
    confidence: 1,
    isMandatory: true,
    ...over,
  });
  const quals: IQualification[] = [
    q({ criterion: "ไม่เป็นบุคคลล้มละลาย", isBoilerplate: true }),
    q({ criterion: "มูลค่าสุทธิเป็นบวก", type: "net_worth", minimumValue: 0, alternativeGroup: "A" }),
    q({ criterion: "ทุนจดทะเบียน 8 ล้าน", type: "registered_capital", minimumValue: 8_000_000, alternativeGroup: "A" }),
    q({ criterion: "เงินฝาก ¼ ของงบ", minimumValue: 6_179_737.5, alternativeGroup: "A" }),
  ];
  const r = matchQualifications(profile, quals);
  check("ข้อมาตรฐานไม่ถูกตรวจ", r.standardClausesSkipped === 1 && r.criteria.length === 3);
  check("ทุนผ่าน 1 ข้อในกลุ่ม → กลุ่มผ่าน → eligible", r.overallStatus === "eligible", r.overallStatus);

  const poor = matchQualifications({ ...profile, registeredCapital: 1_000_000 } as IVendorProfile, quals);
  check("ทุนไม่ผ่าน แต่ข้ออื่นในกลุ่มตรวจไม่ได้ → incomplete", poor.overallStatus === "incomplete", poor.overallStatus);
}

testArchiveFacts();
testValidator();
testRedFlags();
testMatcher();
console.log(`\n${passed} ผ่าน, ${failed} ไม่ผ่าน`);
process.exit(failed ? 1 : 0);
