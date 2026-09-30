/**
 * V2 extraction prompt — one pass over the TOR PDF for everything we need.
 *
 * What changed from v1:
 * - The schema is sent as responseSchema, so the reply is forced into shape
 *   (v1 described a schema in text but never sent it).
 * - Field descriptions carry the domain rules. The model reads them as
 *   instructions, which keeps the system instruction short.
 * - Qualifications are extracted in a form code can compare against a
 *   VendorProfile: numbers in THB, normalised tech/cert names, OR-groups,
 *   and a boilerplate flag for the clauses every BMA TOR repeats.
 * - Red flags: the model only collects evidence (verbatim clause + page +
 *   category). Severity and wording are decided by red-flag-analyzer.ts so
 *   the verdict is deterministic and explainable.
 * - Every item carries sourcePage so users can check the original.
 *
 * Generation settings: temperature is left at the default on purpose. Google
 * advises against lowering it for Gemini 3 (it can cause looping and worse
 * reasoning); determinism comes from the response schema instead. Thinking is
 * set low — extraction needs reading, not deep reasoning, and thinking tokens
 * are billed and slow (an 8-page TOR took ~50 s at the default level).
 */

import { ThinkingLevel, Type, type Schema } from "@google/genai";
import type { ExtractionContext, ExtractionPrompt } from "./index";

/* ─── Output type (mirrors the schema below) ────────────────────────── */

export type WorkType = "development" | "license" | "hardware" | "maintenance" | "service" | "other";

export type QualificationTypeV2 =
  | "contract_value"
  | "company_age"
  | "registered_capital"
  | "net_worth"
  | "personnel"
  | "tech_stack"
  | "certification"
  | "other";

export type RiskCategory =
  | "brand_lock"
  | "narrow_spec"
  | "high_qualification"
  | "tight_timeline"
  | "unusual_penalty"
  | "unusual_payment"
  | "other";

export interface QualificationV2 {
  criterion: string;
  type: QualificationTypeV2;
  minimumNumber: number | null;
  unit: "THB" | "years" | "persons" | "text" | null;
  normalizedNames: string[];
  isMandatory: boolean;
  isBoilerplate: boolean;
  alternativeGroup: string | null;
  requiresGovernment: boolean | null;
  sameTypeRequired: boolean | null;
  requiredCerts: string[];
  sourcePage: number | null;
  confidence: number;
}

export interface TorExtractionV2 {
  documentCheck: {
    isTor: boolean;
    documentType: "tor" | "bidding_doc" | "announcement" | "other";
    hasScannedPages: boolean;
  };
  workType: WorkType;
  scopeOfWork: {
    summary: string;
    keyPoints: string[];
    deliverables: string[];
    contractDurationDays: number | null;
    sourcePages: number[];
    confidence: number;
  };
  qualifications: QualificationV2[];
  evaluationCriteria: {
    method: "lowest_price" | "price_performance" | "other" | null;
    summary: string | null;
    weights: Array<{ criterion: string; weight: number }>;
    sourcePage: number | null;
    confidence: number;
  };
  keyDates: {
    submissionDeadline: { value: string | null; rawText: string | null; sourcePage: number | null; confidence: number };
    warrantyMonths: { value: number | null; confidence: number };
  };
  medianPrice: { value: number | null; sourcePage: number | null; confidence: number };
  riskClauses: Array<{
    rawText: string;
    category: RiskCategory;
    reason: string;
    sourcePage: number | null;
  }>;
}

/* ─── Schema building blocks ────────────────────────────────────────── */

const confidence: Schema = {
  type: Type.NUMBER,
  minimum: 0,
  maximum: 1,
  description:
    "ความมั่นใจ 0–1 ว่าค่าที่ให้ตรงกับเอกสาร: 1 = อ่านตรงตัวชัดเจน, 0.5 = ต้องตีความ, 0 = ไม่พบในเอกสาร",
};

const sourcePage: Schema = {
  type: Type.INTEGER,
  nullable: true,
  description: "เลขหน้าของไฟล์ PDF ที่พบข้อมูล (หน้าแรกของไฟล์ = 1) ไม่ใช่เลขหน้าที่พิมพ์บนกระดาษ",
};

const stringList = (description: string): Schema => ({
  type: Type.ARRAY,
  items: { type: Type.STRING },
  description,
});

/* ─── Response schema ───────────────────────────────────────────────── */

const responseSchema: Schema = {
  type: Type.OBJECT,
  propertyOrdering: [
    "documentCheck",
    "workType",
    "scopeOfWork",
    "qualifications",
    "evaluationCriteria",
    "keyDates",
    "medianPrice",
    "riskClauses",
  ],
  required: [
    "documentCheck",
    "workType",
    "scopeOfWork",
    "qualifications",
    "evaluationCriteria",
    "keyDates",
    "medianPrice",
    "riskClauses",
  ],
  properties: {
    documentCheck: {
      type: Type.OBJECT,
      propertyOrdering: ["isTor", "documentType", "hasScannedPages"],
      required: ["isTor", "documentType", "hasScannedPages"],
      properties: {
        isTor: {
          type: Type.BOOLEAN,
          description: "true ถ้าเป็นขอบเขตของงาน (TOR) หรือเอกสารประกวดราคาที่มีคุณสมบัติผู้ยื่นข้อเสนอ",
        },
        documentType: { type: Type.STRING, enum: ["tor", "bidding_doc", "announcement", "other"] },
        hasScannedPages: {
          type: Type.BOOLEAN,
          description: "true ถ้ามีหน้าที่เป็นภาพสแกน (ไม่มีข้อความให้เลือก)",
        },
      },
    },

    workType: {
      type: Type.STRING,
      enum: ["development", "license", "hardware", "maintenance", "service", "other"],
      description:
        "ลักษณะงานหลัก: development = จ้างพัฒนา/ปรับปรุงระบบ, license = ซื้อหรือต่ออายุลิขสิทธิ์ซอฟต์แวร์สำเร็จรูป, " +
        "hardware = ซื้อ/เช่าอุปกรณ์, maintenance = บำรุงรักษาระบบเดิม (MA), service = จ้างบริการอื่น เช่น cloud, " +
        "call center, ที่ปรึกษา. ถ้ามีหลายอย่างให้เลือกตามมูลค่าส่วนใหญ่",
    },

    scopeOfWork: {
      type: Type.OBJECT,
      propertyOrdering: ["summary", "keyPoints", "deliverables", "contractDurationDays", "sourcePages", "confidence"],
      required: ["summary", "keyPoints", "deliverables", "contractDurationDays", "sourcePages", "confidence"],
      properties: {
        summary: {
          type: Type.STRING,
          description:
            "สรุปขอบเขตงาน 3–5 ประโยค ภาษาไทย ให้ทีม software house อ่านแล้วรู้ว่าต้องทำอะไร " +
            "ระบบอะไร ใครใช้ ขนาดงานเท่าไร — ไม่ต้องทวนชื่อโครงการ",
        },
        keyPoints: stringList("ประเด็นสำคัญของงานไม่เกิน 7 ข้อ เช่น โมดูลหลัก จำนวนผู้ใช้ การเชื่อมต่อระบบเดิม"),
        deliverables: stringList("สิ่งที่ต้องส่งมอบ เช่น ระบบ, คู่มือ, การอบรม, source code, งวดงาน"),
        contractDurationDays: {
          type: Type.INTEGER,
          nullable: true,
          description: "ระยะเวลาดำเนินการเป็นวัน (แปลงเดือนเป็น 30 วัน, ปีเป็น 365 วัน) หรือ null ถ้าไม่ระบุ",
        },
        sourcePages: {
          type: Type.ARRAY,
          items: { type: Type.INTEGER },
          description: "หน้าที่อยู่ของส่วนขอบเขตงาน",
        },
        confidence,
      },
    },

    qualifications: {
      type: Type.ARRAY,
      description:
        "คุณสมบัติผู้ยื่นข้อเสนอทุกข้อ ตามลำดับในเอกสาร รวมทั้งข้อมาตรฐานที่มีในทุก TOR (ติด isBoilerplate) — " +
        "หนึ่งเงื่อนไขต่อหนึ่งรายการ ถ้าข้อเดียวมีหลายเงื่อนไขให้แยก",
      items: {
        type: Type.OBJECT,
        propertyOrdering: [
          "criterion",
          "type",
          "minimumNumber",
          "unit",
          "normalizedNames",
          "isMandatory",
          "isBoilerplate",
          "alternativeGroup",
          "requiresGovernment",
          "sameTypeRequired",
          "requiredCerts",
          "sourcePage",
          "confidence",
        ],
        required: [
          "criterion",
          "type",
          "minimumNumber",
          "unit",
          "normalizedNames",
          "isMandatory",
          "isBoilerplate",
          "alternativeGroup",
          "requiresGovernment",
          "sameTypeRequired",
          "requiredCerts",
          "sourcePage",
          "confidence",
        ],
        properties: {
          criterion: {
            type: Type.STRING,
            description: "ข้อความคุณสมบัติคัดลอกจากเอกสารตรงตัว (ตัดเลขข้อนำหน้าออกได้)",
          },
          type: {
            type: Type.STRING,
            enum: [
              "contract_value",
              "company_age",
              "registered_capital",
              "net_worth",
              "personnel",
              "tech_stack",
              "certification",
              "other",
            ],
            description:
              "contract_value = มีผลงาน/ประสบการณ์ในวงเงินขั้นต่ำ; company_age = จดทะเบียนมาแล้วไม่น้อยกว่า X ปี; " +
              "registered_capital = ทุนจดทะเบียน/ทุนจดทะเบียนที่เรียกชำระแล้ว; net_worth = มูลค่าสุทธิของกิจการ; " +
              "personnel = ต้องมีบุคลากรตำแหน่ง/จำนวนที่กำหนด; tech_stack = ต้องใช้/เชี่ยวชาญเทคโนโลยีที่ระบุ; " +
              "certification = ต้องมีใบรับรอง/มาตรฐาน เช่น ISO, CMMI, หนังสือแต่งตั้งตัวแทนจำหน่าย; other = อื่น ๆ",
          },
          minimumNumber: {
            type: Type.NUMBER,
            nullable: true,
            description:
              "ค่าขั้นต่ำเป็นตัวเลขล้วน: บาทสำหรับเงิน (\"๕ ล้านบาท\" → 5000000), ปีสำหรับอายุ, คนสำหรับบุคลากร. " +
              "ถ้ากำหนดเป็นร้อยละของวงเงิน ให้ใส่ null และคงข้อความไว้ใน criterion",
          },
          unit: {
            type: Type.STRING,
            nullable: true,
            enum: ["THB", "years", "persons", "text"],
          },
          normalizedNames: stringList(
            "สำหรับ tech_stack และ certification: ชื่อมาตรฐานของเทคโนโลยี/ใบรับรอง เช่น " +
              "[\"PostgreSQL\", \"React\"] หรือ [\"ISO/IEC 27001\"] — ประเภทอื่นให้เป็นรายการว่าง",
          ),
          isMandatory: {
            type: Type.BOOLEAN,
            description: "false เฉพาะเมื่อเอกสารระบุว่าเป็นข้อที่ให้คะแนนเพิ่ม/ข้อพึงมี ไม่ใช่เงื่อนไขตัดสิทธิ์",
          },
          isBoilerplate: {
            type: Type.BOOLEAN,
            description:
              "true สำหรับข้อมาตรฐานตามระเบียบที่ใช้กับผู้ยื่นทุกราย เช่น มีความสามารถตามกฎหมาย, " +
              "ไม่เป็นบุคคลล้มละลาย, ไม่อยู่ระหว่างเลิกกิจการ, ไม่ถูกระงับการยื่นข้อเสนอ/ไม่เป็นผู้ทิ้งงาน, " +
              "ไม่มีลักษณะต้องห้ามตามที่คณะกรรมการนโยบายฯ กำหนด, เป็นนิติบุคคลผู้มีอาชีพขาย/รับจ้างงานนั้น, " +
              "ไม่เป็นผู้มีผลประโยชน์ร่วมกัน, ไม่เป็นผู้ได้รับเอกสิทธิ์หรือความคุ้มกัน, ลงทะเบียนในระบบ e-GP, " +
              "เงื่อนไขกิจการร่วมค้า. ข้อที่กำหนดตัวเลขหรือความสามารถเฉพาะงานนี้ต้องเป็น false",
          },
          alternativeGroup: {
            type: Type.STRING,
            nullable: true,
            description:
              "ถ้าเอกสารให้เลือกผ่านข้อใดข้อหนึ่ง (\"...หรือ...\") เช่น มูลค่าสุทธิของกิจการ หรือ ทุนจดทะเบียน " +
              "ให้แยกเป็นคนละรายการแล้วใส่ชื่อกลุ่มเดียวกัน เช่น \"A\". ข้อที่ต้องผ่านทุกข้อให้เป็น null",
          },
          requiresGovernment: {
            type: Type.BOOLEAN,
            nullable: true,
            description: "เฉพาะ contract_value: true ถ้าผลงานต้องเป็นสัญญากับหน่วยงานของรัฐ; ประเภทอื่นให้ null",
          },
          sameTypeRequired: {
            type: Type.BOOLEAN,
            nullable: true,
            description: "เฉพาะ contract_value: true ถ้าต้องเป็น \"ผลงานประเภทเดียวกัน\"; ประเภทอื่นให้ null",
          },
          requiredCerts: stringList(
            "เฉพาะ personnel: ใบรับรอง/คุณวุฒิที่บุคลากรต้องมี เช่น [\"PMP\"] — ประเภทอื่นให้เป็นรายการว่าง",
          ),
          sourcePage,
          confidence,
        },
      },
    },

    evaluationCriteria: {
      type: Type.OBJECT,
      propertyOrdering: ["method", "summary", "weights", "sourcePage", "confidence"],
      required: ["method", "summary", "weights", "sourcePage", "confidence"],
      properties: {
        method: {
          type: Type.STRING,
          nullable: true,
          enum: ["lowest_price", "price_performance", "other"],
          description:
            "lowest_price = ใช้เกณฑ์ราคา; price_performance = เกณฑ์ราคาประกอบเกณฑ์อื่น/คะแนนคุณภาพ; null ถ้าไม่ระบุ",
        },
        summary: {
          type: Type.STRING,
          nullable: true,
          description: "สรุปวิธีพิจารณาคัดเลือก 1–3 ประโยค เช่น เกณฑ์ขั้นต่ำด้านเทคนิค การนำเสนอ",
        },
        weights: {
          type: Type.ARRAY,
          description: "น้ำหนักคะแนนแต่ละเกณฑ์ตามที่ระบุ เช่น ราคา 30, คุณภาพ 70 — รายการว่างถ้าไม่มี",
          items: {
            type: Type.OBJECT,
            propertyOrdering: ["criterion", "weight"],
            required: ["criterion", "weight"],
            properties: {
              criterion: { type: Type.STRING },
              weight: { type: Type.NUMBER, description: "เป็นร้อยละ (0–100)" },
            },
          },
        },
        sourcePage,
        confidence,
      },
    },

    keyDates: {
      type: Type.OBJECT,
      propertyOrdering: ["submissionDeadline", "warrantyMonths"],
      required: ["submissionDeadline", "warrantyMonths"],
      properties: {
        submissionDeadline: {
          type: Type.OBJECT,
          description: "วันและเวลาสิ้นสุดการยื่นข้อเสนอ (ไม่ใช่วันรับฟังความคิดเห็นร่าง TOR)",
          propertyOrdering: ["value", "rawText", "sourcePage", "confidence"],
          required: ["value", "rawText", "sourcePage", "confidence"],
          properties: {
            value: {
              type: Type.STRING,
              nullable: true,
              description:
                "ISO 8601 ปี ค.ศ. เช่น \"2026-10-15\" หรือ \"2026-10-15T10:00:00+07:00\" ถ้ามีเวลา (พ.ศ. − 543). " +
                "null ถ้าเอกสารไม่ระบุวันที่แน่นอน",
            },
            rawText: { type: Type.STRING, nullable: true, description: "ข้อความต้นฉบับที่อ่านวันที่มา" },
            sourcePage,
            confidence,
          },
        },
        warrantyMonths: {
          type: Type.OBJECT,
          propertyOrdering: ["value", "confidence"],
          required: ["value", "confidence"],
          properties: {
            value: {
              type: Type.INTEGER,
              nullable: true,
              description: "ระยะเวลารับประกันความชำรุดบกพร่องเป็นเดือน หรือ null",
            },
            confidence,
          },
        },
      },
    },

    medianPrice: {
      type: Type.OBJECT,
      description: "ราคากลาง/วงเงินงบประมาณที่ระบุในเอกสาร (ใช้เทียบกับข้อมูลจากระบบ ไม่ใช่เขียนทับ)",
      propertyOrdering: ["value", "sourcePage", "confidence"],
      required: ["value", "sourcePage", "confidence"],
      properties: {
        value: { type: Type.NUMBER, nullable: true, description: "บาท รวมภาษีมูลค่าเพิ่ม" },
        sourcePage,
        confidence,
      },
    },

    riskClauses: {
      type: Type.ARRAY,
      description:
        "ข้อความที่อาจจำกัดการแข่งขันหรือเป็นภาระผิดปกติ — เป็นเพียงหลักฐานให้ระบบตรวจต่อ ไม่ใช่คำตัดสิน. " +
        "รายการว่างถ้าไม่พบ ห้ามใส่ข้อมาตรฐานทั่วไป",
      items: {
        type: Type.OBJECT,
        propertyOrdering: ["rawText", "category", "reason", "sourcePage"],
        required: ["rawText", "category", "reason", "sourcePage"],
        properties: {
          rawText: { type: Type.STRING, description: "ข้อความจากเอกสารตรงตัว" },
          category: {
            type: Type.STRING,
            enum: [
              "brand_lock",
              "narrow_spec",
              "high_qualification",
              "tight_timeline",
              "unusual_penalty",
              "unusual_payment",
              "other",
            ],
            description:
              "brand_lock = ระบุยี่ห้อ/รุ่น/ผลิตภัณฑ์โดยไม่มี \"หรือเทียบเท่า\"; narrow_spec = คุณลักษณะเฉพาะที่แคบจนมีผู้ผลิตน้อยราย; " +
              "high_qualification = ผลงาน/ทุน/ใบรับรองสูงเกินขนาดงาน; tight_timeline = ระยะเวลาทำงานสั้นผิดปกติ; " +
              "unusual_penalty = ค่าปรับหรือเงื่อนไขปรับสูงผิดปกติ; unusual_payment = จ่ายเงินงวดเดียวท้ายสัญญา/หักเงินประกันผลงานสูง",
          },
          reason: {
            type: Type.STRING,
            description:
              "เหตุผลสั้น ๆ ภาษาไทย. ถ้าสิ่งที่ซื้อคือผลิตภัณฑ์ยี่ห้อนั้นโดยตรง (เช่น ต่ออายุลิขสิทธิ์ของระบบเดิม) ให้บอกไว้ด้วย",
          },
          sourcePage,
        },
      },
    },
  },
};

/* ─── Instructions ──────────────────────────────────────────────────── */

const systemInstruction = `คุณเป็นผู้ช่วยอ่านเอกสารขอบเขตของงาน (TOR) และเอกสารประกวดราคาของกรุงเทพมหานคร
เพื่อสกัดข้อมูลให้บริษัทซอฟต์แวร์ใช้ตัดสินใจว่าควรยื่นข้อเสนอหรือไม่

ผลลัพธ์ต้องเป็น JSON ตาม schema ที่กำหนด โดยคำอธิบายของแต่ละ field คือกติกาที่ต้องทำตาม

หลักการสำคัญ:
1. ใช้เฉพาะข้อมูลที่อยู่ในเอกสาร ห้ามเดาหรือเติมจากความรู้ทั่วไป ถ้าไม่พบให้ใส่ null / รายการว่าง และ confidence 0
2. ข้อความที่ให้ "คัดลอกตรงตัว" ต้องเหมือนต้นฉบับ ห้ามเรียบเรียงใหม่
3. ตัวเลข: แปลงเลขไทย (๐–๙) เป็นเลขอารบิก และแปลงคำเช่น "ห้าล้านบาท" เป็น 5000000
4. วันที่: แปลง พ.ศ. เป็น ค.ศ. (ลบ 543) และตอบรูปแบบ ISO 8601
5. sourcePage คือลำดับหน้าของไฟล์ PDF เริ่มที่ 1 ไม่ใช่เลขหน้าที่พิมพ์ในเอกสาร
6. ข้อความที่สรุปให้ใช้ภาษาไทยที่กระชับ ส่วนชื่อเทคโนโลยีใช้ภาษาอังกฤษตามชื่อทางการ

ตำแหน่งที่มักพบข้อมูลใน TOR ของ กทม.:
- "ความเป็นมา" / "วัตถุประสงค์" / "ขอบเขตของงาน" / "รายละเอียดคุณลักษณะเฉพาะ" → scopeOfWork
- "คุณสมบัติของผู้ยื่นข้อเสนอ" → qualifications (ส่วนใหญ่ 10–20 ข้อ มีทั้งข้อมาตรฐานและข้อเฉพาะงาน)
- "หลักเกณฑ์การพิจารณาคัดเลือกข้อเสนอ" / "เกณฑ์การพิจารณา" → evaluationCriteria
- "ระยะเวลาดำเนินการ" / "ระยะเวลาส่งมอบ" → contractDurationDays
- "การรับประกันความชำรุดบกพร่อง" → warrantyMonths
- "งวดงานและการจ่ายเงิน" / "อัตราค่าปรับ" → ตรวจหา riskClauses
- "วงเงินในการจัดหา" / "ราคากลาง" → medianPrice

ถ้าเอกสารไม่ใช่ TOR (เช่น เป็นประกาศหรือสัญญา) ให้ documentCheck.isTor = false และสกัดเท่าที่มี`;

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
    lines.push(`- วงเงินงบประมาณ: ${ctx.budget.toLocaleString("en-US")} บาท`);
  }
  lines.push(
    `- ไฟล์: ${ctx.fileName} (ระบบคาดว่าเป็น ${ctx.documentKind})`,
    "",
    "อ่านเอกสาร PDF ที่แนบแล้วสกัดข้อมูลตาม schema",
    "medianPrice ให้อ่านจากเอกสารเท่านั้น แม้จะต่างจากราคาในระบบก็ให้ตอบตามเอกสาร",
  );
  return lines.join("\n");
}

export const promptV2: ExtractionPrompt = {
  version: "v2",
  systemInstruction,
  responseSchema,
  buildUserPrompt,
  generationConfig: {
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    // Thinking tokens count toward this cap; long TORs with 20+ verbatim
    // qualifications need the headroom.
    maxOutputTokens: 16384,
  },
};
