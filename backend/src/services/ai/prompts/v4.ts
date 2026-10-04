/**
 * V4 extraction prompt — v3 with fixes from scoring v3 against the checked
 * gold set.
 *
 * - Budget and reference price are separate fields. v3 had one medianPrice
 *   for "ราคากลาง/วงเงินงบประมาณ", but they are different figures, and egp2
 *   sometimes labels them the other way round from the TOR (69049037828: the
 *   TOR's วงเงินงบประมาณ is egp2's ราคากลาง). Each carries amountWords so a
 *   misread digit is caught (v3 read 23,398,000 as 23,388,000). egp2's
 *   figures are no longer in the prompt — the model copied them in.
 * - clauseNumber on every qualification, first in the ordering, so the model
 *   walks the clauses in order instead of picking the interesting ones — v3
 *   still skipped boilerplate and one financial alternative.
 * - Things the bidder must submit or do (Statement of Compliance, catalogues,
 *   work plans) are not qualifications.
 * - contractDurationDays only from an explicit duration; v3 turned licence
 *   terms and delivery dates into 365 and 210.
 * - The submission date and the bidding document's duration are read in
 *   code (archive-facts.ts) and no longer asked of the model; the duration it
 *   still gives as a fallback must quote its evidence.
 * - documentConflicts only when both documents state the same thing
 *   differently, with the warranty and repair-time cases as examples — v3
 *   missed the warranty conflict in two of three TORs.
 */

import { Type, type Schema } from "@google/genai";
import type { ExtractionPrompt } from "./index";
import { promptV3, type QualificationV3, type TorExtractionV3 } from "./v3";

/* ─── Output type ───────────────────────────────────────────────────── */

export interface QualificationV4 extends QualificationV3 {
  /** Clause number as printed, e.g. "3.12.1" — null when unnumbered. */
  clauseNumber: string | null;
}

export interface PriceFieldV4 {
  value: number | null;
  amountWords: string | null;
  sourcePage: number | null;
  confidence: number;
}

export interface TorExtractionV4
  extends Omit<TorExtractionV3, "qualifications" | "medianPrice" | "scopeOfWork" | "keyDates"> {
  scopeOfWork: TorExtractionV3["scopeOfWork"] & {
    /** Verbatim evidence for contractDurationDays. */
    contractDurationText: string | null;
  };
  /** The submission date is read in code (archive-facts.ts), not by the model. */
  keyDates: Pick<TorExtractionV3["keyDates"], "warrantyMonths">;
  qualifications: QualificationV4[];
  /** วงเงินงบประมาณ as the documents state it. */
  budget: PriceFieldV4;
  /** ราคากลาง as the documents state it. */
  medianPrice: PriceFieldV4;
}

/* ─── Schema: v3 plus patches ───────────────────────────────────────── */

type ObjectSchema = Schema & {
  properties: Record<string, Schema>;
  propertyOrdering: string[];
  required: string[];
};

const schema = structuredClone(promptV3.responseSchema!) as ObjectSchema;
const qual = schema.properties.qualifications.items as ObjectSchema;

qual.properties.clauseNumber = {
  type: Type.STRING,
  nullable: true,
  description: "เลขข้อตามเอกสาร เช่น \"3.12.1\" (แปลงเลขไทยเป็นอารบิก) — null ถ้าข้อนั้นไม่มีเลข",
};
qual.propertyOrdering = ["clauseNumber", ...qual.propertyOrdering];
qual.required = ["clauseNumber", ...qual.required];

qual.properties.type = {
  ...qual.properties.type,
  description:
    qual.properties.type.description +
    ". net_worth ใช้กับ \"มูลค่าสุทธิของกิจการ\" เท่านั้น — เงินฝากคงเหลือในบัญชีและวงเงินสินเชื่อเป็น other",
};
// A first v4 run marked every standard clause bidding_doc with no page,
// although the TOR repeats them — users need the TOR page to check.
qual.properties.source = {
  ...qual.properties.source,
  description:
    "ข้อนี้พบในเอกสารใด: both = มีใน TOR ด้วย (แม้ถ้อยคำต่างเล็กน้อย), tor = มีเฉพาะใน TOR, " +
    "bidding_doc = มีเฉพาะในเอกสารประกวดราคา. ข้อที่มีใน TOR ให้ใส่ sourcePage เป็นหน้าใน TOR เสมอ",
};

schema.properties.qualifications = {
  ...schema.properties.qualifications,
  description:
    "คุณสมบัติผู้ยื่นข้อเสนอ ไล่ตามเลขข้อทีละข้อตั้งแต่ข้อแรกถึงข้อสุดท้ายของหัวข้อคุณสมบัติ ห้ามข้ามข้อใด " +
    "แม้เป็นข้อมาตรฐาน (ติด isBoilerplate) แล้วต่อด้วยข้อที่ TOR เพิ่มเข้ามา. " +
    "ข้อเดียวกันที่มีทั้งสองฉบับให้เป็นรายการเดียว (source = both) และคัดลอก criterion จากเอกสารประกวดราคา. " +
    "ข้อที่มีกรณีย่อยให้เลือก เช่น มูลค่าสุทธิของกิจการ / ทุนจดทะเบียน / เงินฝาก / วงเงินสินเชื่อ " +
    "ให้แยกทุกกรณีเป็นคนละรายการในกลุ่ม alternativeGroup เดียวกัน — ปกติมี 4 กรณี. " +
    "คุณสมบัติคือสิ่งที่ผู้ยื่นต้องมีหรือต้องเป็นอยู่แล้วก่อนยื่น. สิ่งที่ต้องยื่นหรือต้องทำ " +
    "เช่น Statement of Compliance, แคตตาล็อก, แผนการดำเนินงาน, เอกสารแสดงรายละเอียดคุณลักษณะ ไม่ใช่คุณสมบัติ ห้ามใส่",
};

// The bidding document's clause 4.3 gives the duration and is read in code
// (archive-facts.ts); the model's figure is only a fallback for archives
// without one, and must quote its evidence so the validator can reject
// licence terms (v3 and a first v4 run turned "Subscription 3 ปี" into 1095).
const scope = schema.properties.scopeOfWork as ObjectSchema;
scope.properties.contractDurationDays = {
  ...scope.properties.contractDurationDays,
  description:
    "ระยะเวลาดำเนินการหรือกำหนดส่งมอบเป็นวัน เฉพาะเมื่อเอกสารเขียนจำนวนวัน/เดือน/ปีไว้ตรง ๆ " +
    "เช่น \"กำหนดเวลาส่งมอบพัสดุไม่เกิน ๑๒๐ วัน\" (เดือน = 30 วัน, ปี = 365 วัน). " +
    "ห้ามคำนวณจากอายุลิขสิทธิ์/license/subscription, ระยะเวลารับประกัน หรือช่วงระหว่างวันที่ — ถ้าไม่มีให้ null",
};
scope.properties.contractDurationText = {
  type: Type.STRING,
  nullable: true,
  description: "ข้อความในเอกสารที่ใช้เป็นหลักฐานของ contractDurationDays คัดลอกตรงตัว — null เมื่อ contractDurationDays เป็น null",
};
scope.propertyOrdering = scope.propertyOrdering.flatMap((k) =>
  k === "contractDurationDays" ? [k, "contractDurationText"] : [k],
);
scope.required = [...scope.required, "contractDurationText"];

// The submission date is read in code from the e-GP announcement; the model
// guessed one from a blank draft ("ลงวันที่ พฤษภาคม ๒๕๖๙" → 2026-05-31).
const keyDates = schema.properties.keyDates as ObjectSchema;
delete keyDates.properties.submissionDeadline;
keyDates.propertyOrdering = keyDates.propertyOrdering.filter((k) => k !== "submissionDeadline");
keyDates.required = keyDates.required.filter((k) => k !== "submissionDeadline");

const price = (what: string): Schema => ({
  type: Type.OBJECT,
  description: what,
  propertyOrdering: ["value", "amountWords", "sourcePage", "confidence"],
  required: ["value", "amountWords", "sourcePage", "confidence"],
  properties: {
    value: { type: Type.NUMBER, nullable: true, description: "บาท รวมภาษีมูลค่าเพิ่ม — null ถ้าเอกสารไม่ได้ระบุ" },
    amountWords: {
      type: Type.STRING,
      nullable: true,
      description: "คำอ่านจำนวนเงินในวงเล็บตามต้นฉบับ — null ถ้าไม่มีคำอ่าน",
    },
    sourcePage: {
      type: Type.INTEGER,
      nullable: true,
      description: "หน้าใน TOR (ลำดับหน้าของไฟล์ PDF เริ่มที่ 1) — null ถ้าพบเฉพาะในเอกสารประกวดราคา",
    },
    confidence: { type: Type.NUMBER, description: "0–1" },
  },
});

// Budget and reference price are different figures; the TOR often states
// only the budget.
const FROM_DOCUMENT_ONLY = "อ่านจากเอกสารเท่านั้น — ถ้าเอกสารไม่ได้ระบุให้ value เป็น null";
schema.properties.budget = price(
  `วงเงินงบประมาณ ตามที่เอกสารเรียกว่า "วงเงินงบประมาณ" / "งบประมาณ" เท่านั้น. ${FROM_DOCUMENT_ONLY}`,
);
schema.properties.medianPrice = price(
  `ราคากลาง ตามที่เอกสารเรียกว่า "ราคากลาง" เท่านั้น — ห้ามใส่วงเงินงบประมาณแทน. ${FROM_DOCUMENT_ONLY}`,
);
schema.propertyOrdering = schema.propertyOrdering.flatMap((k) => (k === "medianPrice" ? ["budget", k] : [k]));
schema.required = [...schema.required, "budget"];

schema.properties.documentConflicts = {
  ...schema.properties.documentConflicts,
  description:
    "เรื่องที่ทั้ง TOR และเอกสารประกวดราคากำหนดไว้ทั้งคู่ แต่กำหนดต่างกัน เช่น " +
    "ระยะเวลารับประกัน (TOR \"ตลอดระยะเวลาตามสัญญา\" / เอกสารประกวดราคา \"ไม่น้อยกว่า ๑ ปี\"), " +
    "ระยะเวลาแก้ไขความชำรุด (TOR \"๗ ชั่วโมง\" / เอกสารประกวดราคา \"๑ วัน\"), ขอบเขตผลงานที่ยอมรับ, จำนวนเงิน. " +
    "ให้เทียบหัวข้อการรับประกันความชำรุดบกพร่องของสองฉบับทุกครั้ง. " +
    "ไม่ต้องใส่: เรื่องที่ฉบับหนึ่งไม่ได้กล่าวถึง, ข้อความที่ความหมายเหมือนกัน, ความต่างของเลขข้อ, " +
    "ความต่างกับข้อมูลภายนอก (เทียบเฉพาะสองเอกสาร). " +
    "ไม่ต้องตัดสินว่าฉบับไหนถูก. รายการว่างถ้าไม่มีเอกสารประกวดราคาหรือไม่พบความต่าง",
};

/* ─── Instructions ──────────────────────────────────────────────────── */

/** v4 edits v3's text in place; fail loudly if v3 changes under it. */
function mustReplace(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`prompt v4: ไม่พบข้อความใน v3 — "${from.slice(0, 40)}"`);
  return text.replace(from, to);
}

const systemInstruction = mustReplace(
  mustReplace(
    promptV3.systemInstruction,
    "- \"วงเงินงบประมาณ\" / \"ราคากลาง\" → medianPrice",
    "- \"วงเงินงบประมาณ\" → budget, \"ราคากลาง\" → medianPrice (คนละตัวเลข ห้ามสลับหรือใส่แทนกัน)",
  ),
  "- คุณสมบัติ: รวมจากทั้งสองฉบับ",
  "- คุณสมบัติ: ไล่ตามเลขข้อทีละข้อ รวมจากทั้งสองฉบับ",
);
const systemInstructionV4 = mustReplace(
  systemInstruction,
  "ข้อที่มาจากเอกสารประกวดราคาอย่างเดียวให้ sourcePage เป็น null",
  "ข้อที่มีใน TOR ให้ใส่หน้าใน TOR เสมอ แม้จะคัดลอกถ้อยคำจากเอกสารประกวดราคา; " +
    "ข้อที่มีเฉพาะในเอกสารประกวดราคาให้ sourcePage เป็น null",
);

export const promptV4: ExtractionPrompt = {
  ...promptV3,
  version: "v4",
  systemInstruction: systemInstructionV4,
  responseSchema: schema,
  // egp2's figures are not sent at all: told not to, the model still copied
  // them into budget/medianPrice (egp2's typo 3,398,000 included). The
  // validator compares document and egp2 figures in code instead.
  buildUserPrompt: (ctx) =>
    mustReplace(
      promptV3.buildUserPrompt!({ ...ctx, medianPriceFromSource: null, budget: null }),
      "medianPrice ให้อ่านจากเอกสารเท่านั้น แม้จะต่างจากราคาในระบบก็ให้ตอบตามเอกสาร",
      "budget และ medianPrice ให้อ่านจากเอกสารเท่านั้น",
    ),
};
