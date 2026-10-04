/**
 * V3 extraction prompt — the scanned TOR plus the e-GP bidding document text.
 *
 * Why: every TOR sampled so far was a scan, and v2 misread amounts on scans
 * (๘ ล้าน read as ๕, ๔ ล้าน as ๕). The e-GP bidding document (doc_*.pdf) is
 * generated as text, so its numbers are exact. It has no scope of work and
 * sometimes lacks requirements the agency added only to the TOR, so it is
 * read alongside the TOR, not instead of it:
 *
 *   scope of work             TOR only
 *   numbers                   bidding document first, TOR when only there
 *   qualifications            both, merged; `source` says where each came from
 *   payment/penalty/warranty  bidding document first
 *   conflicts                 reported in documentConflicts, never resolved —
 *                             the bidding document itself says BMA rules on them
 *
 * Other changes from v2, all from scoring v2 against the gold set:
 * - amountWords: the Thai words in parentheses, checked against the digits in
 *   validate-extraction.ts.
 * - Every financial alternative (net worth / capital / deposit / credit line)
 *   as its own item; v2 dropped the last two every time.
 * - รัฐวิสาหกิจ counts as government for requiresGovernment.
 * - Conventions agreed with the labeller: unit is null when minimumNumber is,
 *   "net worth must be positive" is 0, "warranty for the contract term" is null.
 * - Explicit list of things that are not risks; v2 flagged six of them.
 * - HIGH media resolution for scans.
 *
 * The schema is v2's with these fields patched in, so the diff stays readable.
 */

import { MediaResolution, ThinkingLevel, Type, type Schema } from "@google/genai";
import type { ExtractionContext, ExtractionPrompt } from "./index";
import { promptV2, type TorExtractionV2, type QualificationV2 } from "./v2";

/* ─── Output type ───────────────────────────────────────────────────── */

export interface QualificationV3 extends QualificationV2 {
  source: "bidding_doc" | "tor" | "both";
  amountWords: string | null;
}

export interface DocumentConflict {
  topic: string;
  torText: string;
  biddingDocText: string;
  torPage: number | null;
}

export interface TorExtractionV3 extends Omit<TorExtractionV2, "qualifications"> {
  qualifications: QualificationV3[];
  documentConflicts: DocumentConflict[];
}

/* ─── Schema: v2 plus patches ───────────────────────────────────────── */

const schema = structuredClone(promptV2.responseSchema!) as Schema & {
  properties: Record<string, Schema>;
  propertyOrdering: string[];
  required: string[];
};

const qual = schema.properties.qualifications.items as Schema & {
  properties: Record<string, Schema>;
  propertyOrdering: string[];
  required: string[];
};

qual.properties.source = {
  type: Type.STRING,
  enum: ["bidding_doc", "tor", "both"],
  description: "ข้อนี้พบในเอกสารใด: bidding_doc = เอกสารประกวดราคา (text), tor = TOR (PDF), both = ทั้งสองฉบับ",
};
qual.properties.amountWords = {
  type: Type.STRING,
  nullable: true,
  description:
    "คำอ่านจำนวนเงินในวงเล็บตามต้นฉบับ เช่น \"(สี่ล้านบาทถ้วน)\" — null ถ้าเอกสารไม่ได้เขียนคำอ่านไว้",
};
qual.properties.minimumNumber = {
  ...qual.properties.minimumNumber,
  description:
    "ค่าขั้นต่ำเป็นตัวเลขล้วน: บาทสำหรับเงิน, ปีสำหรับอายุ, คนสำหรับบุคลากร. " +
    "ถ้ามีคำอ่านในวงเล็บให้ถือคำอ่านเป็นหลัก (เลข ๔ ๕ ๘ ในภาพสแกนอ่านสลับกันง่าย). " +
    "มูลค่าสุทธิที่กำหนดเพียงว่า \"ต้องแสดงค่าเป็นบวก\" ให้ใส่ 0. " +
    "ถ้ากำหนดเป็นสัดส่วนของวงเงิน (เช่น 1 ใน 4 ของงบประมาณ) ให้ใส่ null — ระบบคำนวณเอง",
};
qual.properties.unit = {
  ...qual.properties.unit,
  description: "หน่วยของ minimumNumber — ต้องเป็น null เมื่อ minimumNumber เป็น null",
};
qual.properties.requiresGovernment = {
  ...qual.properties.requiresGovernment,
  description:
    "เฉพาะ contract_value: true ถ้าผลงานต้องเป็นคู่สัญญากับหน่วยงานของรัฐเท่านั้น (ส่วนราชการ, รัฐวิสาหกิจ, " +
    "หน่วยงานของรัฐ ถือเป็นรัฐทั้งหมด); false ถ้ายอมรับผลงานกับเอกชนด้วย; ประเภทอื่นให้ null",
};
qual.propertyOrdering = [...qual.propertyOrdering, "source", "amountWords"];
qual.required = [...qual.required, "source", "amountWords"];

schema.properties.qualifications = {
  ...schema.properties.qualifications,
  description:
    "คุณสมบัติผู้ยื่นข้อเสนอทุกข้อจากทั้งสองเอกสาร ห้ามข้ามข้อใด แม้เป็นข้อมาตรฐาน (ติด isBoilerplate). " +
    "ข้อเดียวกันที่มีทั้งสองฉบับให้เป็นรายการเดียว (source = both) และคัดลอก criterion จากเอกสารประกวดราคา. " +
    "ข้อที่มีกรณีย่อยให้เลือก เช่น มูลค่าสุทธิของกิจการ / ทุนจดทะเบียน / เงินฝาก / วงเงินสินเชื่อ " +
    "ให้แยกทุกกรณีเป็นคนละรายการในกลุ่ม alternativeGroup เดียวกัน",
};

const keyDates = schema.properties.keyDates as Schema & { properties: Record<string, Schema> };
const warranty = keyDates.properties.warrantyMonths as Schema & { properties: Record<string, Schema> };
warranty.properties.value = {
  ...warranty.properties.value,
  description:
    "ระยะเวลารับประกันความชำรุดบกพร่องเป็นเดือน อ่านจากเอกสารประกวดราคาก่อน. " +
    "ถ้าระบุเพียง \"ตลอดระยะเวลาตามสัญญา\" โดยไม่มีตัวเลข ให้ null",
};

schema.properties.riskClauses = {
  ...schema.properties.riskClauses,
  description:
    "ข้อความที่อาจจำกัดการแข่งขันหรือเป็นภาระผิดปกติ — เป็นเพียงหลักฐานให้ระบบตรวจต่อ ไม่ใช่คำตัดสิน. " +
    "ไม่ต้องใส่สิ่งต่อไปนี้ซึ่งเป็นเรื่องปกติ: หนังสือแต่งตั้งตัวแทนจำหน่ายสำหรับสินค้าลิขสิทธิ์, " +
    "ค่าปรับรายวันไม่เกินร้อยละ 0.20 ตามระเบียบ, การระบุยี่ห้อเมื่อเป็นการต่ออายุหรือบำรุงรักษาระบบเดิม, " +
    "กำหนดส่งมอบที่ผูกกับวันหมดอายุของลิขสิทธิ์เดิม, ข้อมาตรฐานของเอกสารประกวดราคา. รายการว่างถ้าไม่พบ",
};

schema.properties.documentConflicts = {
  type: Type.ARRAY,
  description:
    "เรื่องที่ TOR กับเอกสารประกวดราคาเขียนไม่ตรงกัน เช่น ขอบเขตผลงานที่ยอมรับ, ระยะเวลารับประกัน, " +
    "จำนวนเงิน. ไม่ต้องตัดสินว่าฉบับไหนถูก. รายการว่างถ้าไม่มีเอกสารประกวดราคาหรือไม่พบความต่าง. " +
    "ไม่ต้องใส่ความต่างของเลขข้อหรือถ้อยคำที่ความหมายเหมือนกัน",
  items: {
    type: Type.OBJECT,
    propertyOrdering: ["topic", "torText", "biddingDocText", "torPage"],
    required: ["topic", "torText", "biddingDocText", "torPage"],
    properties: {
      topic: { type: Type.STRING, description: "เรื่องที่ขัดกัน สั้น ๆ เช่น \"ระยะเวลารับประกัน\"" },
      torText: { type: Type.STRING, description: "ข้อความใน TOR" },
      biddingDocText: { type: Type.STRING, description: "ข้อความในเอกสารประกวดราคา" },
      torPage: {
        type: Type.INTEGER,
        nullable: true,
        description: "หน้าใน TOR (ลำดับหน้าของไฟล์ PDF เริ่มที่ 1)",
      },
    },
  },
};
schema.propertyOrdering = [...schema.propertyOrdering, "documentConflicts"];
schema.required = [...schema.required, "documentConflicts"];

/* ─── Instructions ──────────────────────────────────────────────────── */

const systemInstruction = `คุณเป็นผู้ช่วยอ่านเอกสารจัดซื้อจัดจ้างของกรุงเทพมหานคร เพื่อสกัดข้อมูลให้บริษัทซอฟต์แวร์ใช้ตัดสินใจว่าควรยื่นข้อเสนอหรือไม่

ข้อมูลที่ได้รับมีได้ 2 ส่วน:
1. ไฟล์ PDF — ขอบเขตของงาน (TOR) ที่หน่วยงานแนบ มักเป็นภาพสแกน
2. ข้อความในแท็ก <bidding_doc> — เอกสารประกวดราคาที่ระบบ e-GP สร้าง เป็นข้อความจริง (ไม่ต้อง OCR)
   ตัดมาเฉพาะหัวข้อคุณสมบัติ เกณฑ์การพิจารณา การจ่ายเงิน ค่าปรับ และการรับประกัน
   ตัวเลขที่ถูกกรอกลงแบบฟอร์มอาจติดกับคำข้างเคียงโดยไม่มีเว้นวรรค เช่น "ไม่น้อยกว่า๙๐วัน"

วิธีใช้สองแหล่งร่วมกัน:
- ขอบเขตงาน: จาก TOR เท่านั้น
- ตัวเลข: ใช้จากเอกสารประกวดราคาก่อน เพราะแม่นกว่าการอ่านภาพ ใช้จาก TOR เมื่อมีเฉพาะใน TOR
- คุณสมบัติ: รวมจากทั้งสองฉบับ ข้อที่ TOR เพิ่มเข้ามา (มักอยู่ในหัวข้อ "ข้อกำหนดทั่วไป") ต้องใส่ด้วย
- ถ้าสองฉบับเขียนไม่ตรงกัน ให้บันทึกใน documentConflicts และใช้ค่าจากเอกสารประกวดราคาในช่องข้อมูลหลัก

ผลลัพธ์ต้องเป็น JSON ตาม schema โดยคำอธิบายของแต่ละ field คือกติกาที่ต้องทำตาม

หลักการสำคัญ:
1. ใช้เฉพาะข้อมูลที่อยู่ในเอกสาร ห้ามเดา ถ้าไม่พบให้ใส่ null / รายการว่าง และ confidence 0
2. ข้อความที่ให้ "คัดลอกตรงตัว" ต้องเหมือนต้นฉบับ ห้ามเรียบเรียงใหม่หรือรวมหลายข้อเป็นข้อเดียว
3. ตัวเลข: แปลงเลขไทยเป็นเลขอารบิก. ในภาพสแกน เลข ๔ ๕ ๘ อ่านสลับกันง่าย — ถ้ามีคำอ่านในวงเล็บให้ใช้คำอ่าน
4. วันที่: แปลง พ.ศ. เป็น ค.ศ. (ลบ 543) และตอบรูปแบบ ISO 8601
5. sourcePage คือลำดับหน้าของไฟล์ PDF เริ่มที่ 1. ข้อที่มาจากเอกสารประกวดราคาอย่างเดียวให้ sourcePage เป็น null
6. ข้อความสรุปใช้ภาษาไทยกระชับ ชื่อเทคโนโลยีใช้ชื่อทางการภาษาอังกฤษ

ตำแหน่งที่มักพบข้อมูลใน TOR ของ กทม.:
- "ความเป็นมา" / "วัตถุประสงค์" / "ขอบเขตของงาน" / "รายละเอียดคุณลักษณะเฉพาะ" → scopeOfWork
- "คุณสมบัติของผู้ยื่นข้อเสนอ" และ "ข้อกำหนดทั่วไป" → qualifications
- "หลักเกณฑ์ในการพิจารณาคัดเลือกข้อเสนอ" → evaluationCriteria
- "ระยะเวลาดำเนินการ" / "กำหนดเวลาส่งมอบ" → contractDurationDays
- "วงเงินงบประมาณ" / "ราคากลาง" → medianPrice

ถ้าไม่มีไฟล์ PDF ให้สกัดจากเอกสารประกวดราคาเท่าที่มี และบอกใน documentCheck ว่าไม่ใช่ TOR`;

function buildUserPrompt(ctx: ExtractionContext): string {
  const lines = [
    "ข้อมูลที่ระบบรู้อยู่แล้ว (ใช้ประกอบการอ่าน ไม่ต้องคัดลอกลงผลลัพธ์):",
    `- ชื่อโครงการ: ${ctx.title}`,
    `- หน่วยงาน: ${ctx.agencyName}`,
  ];
  if (ctx.medianPriceFromSource != null) {
    lines.push(`- ราคากลางจากระบบ e-GP: ${ctx.medianPriceFromSource.toLocaleString("en-US")} บาท`);
  }
  if (ctx.budget != null) {
    lines.push(`- วงเงินงบประมาณจากระบบ e-GP: ${ctx.budget.toLocaleString("en-US")} บาท`);
  }
  lines.push(
    ctx.hasPdf === false
      ? "- ไม่มีไฟล์ TOR แนบ"
      : `- ไฟล์ PDF ที่แนบ: ${ctx.fileName} (ระบบคาดว่าเป็น ${ctx.documentKind})`,
    "",
    "medianPrice ให้อ่านจากเอกสารเท่านั้น แม้จะต่างจากราคาในระบบก็ให้ตอบตามเอกสาร",
  );
  if (ctx.biddingDocText) {
    lines.push(
      "",
      `<bidding_doc file="${ctx.biddingDocFileName ?? "doc.pdf"}">`,
      ctx.biddingDocText,
      "</bidding_doc>",
    );
  } else {
    lines.push("", "(ไม่มีเอกสารประกวดราคา — ใช้ TOR อย่างเดียว และ documentConflicts เป็นรายการว่าง)");
  }
  return lines.join("\n");
}

export const promptV3: ExtractionPrompt = {
  version: "v3",
  systemInstruction,
  responseSchema: schema,
  buildUserPrompt,
  generationConfig: {
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    // Scans are the norm; the higher resolution is what reading ๘ vs ๕ needs.
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
    maxOutputTokens: 16384,
  },
};
