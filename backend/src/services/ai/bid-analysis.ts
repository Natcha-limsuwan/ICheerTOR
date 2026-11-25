/**
 * On-demand AI second opinion on a bid estimate.
 *
 * The estimator in services/matching/bid-estimator.ts is deterministic: it
 * reads the TOR's weights and the vendor's fit score and solves a break-even
 * price. That is cheap, repeatable and explainable, and it is what the detail
 * page shows by default. This module exists for what arithmetic cannot see —
 * scope that will cost more than it looks, payment terms that strain cash
 * flow, risk clauses that should change the price, a qualification gap worth
 * partnering around.
 *
 * It runs only when the user asks. Each call spends Vertex quota (express mode
 * is metered per minute), so it is never part of rendering a page.
 *
 * Deliberately NOT a price oracle: the model is given the estimator's output
 * and asked to critique it, not to replace it. Its suggested adjustment is
 * bounded to ±15% so a hallucinated figure cannot move the number far, and the
 * caller still shows the deterministic range alongside. The system prompt
 * forbids drafting any part of a bid submission, which the product must not do.
 */

import { Type, type Schema } from "@google/genai";
import { getVertexClient, getModelId } from "./vertex-client";
import { aiCircuitBreaker } from "./circuit-breaker";
import { env } from "../../config/env";
import type { BidEstimate } from "../matching/bid-estimator";
import type { MatchResult } from "../matching/qualification-matcher";
import type { IParsedData, IRiskClause } from "../../db/models/tor-record";

/* ─── Output ────────────────────────────────────────────────────────── */

export interface BidAnalysis {
  /** 2–4 sentence Thai verdict on whether this bid is worth pursuing. */
  verdict: string;
  /** Where the deterministic estimate is likely to be too optimistic. */
  risks: Array<{ topic: string; detail: string; impact: "high" | "medium" | "low" }>;
  /** Concrete, non-document-writing actions that would improve the position. */
  opportunities: string[];
  /**
   * Suggested move against the deterministic mid-point, in percent.
   * Negative means bid lower. Bounded to [-15, 15] before it reaches callers.
   */
  priceAdjustmentPercent: number;
  priceAdjustmentReason: string;
  /** The model's own confidence in this reading. */
  confidence: "low" | "medium" | "high";
}

export interface BidAnalysisResult {
  analysis: BidAnalysis;
  model: string;
  durationMs: number;
  usage: { input?: number; output?: number; total?: number };
}

/** Largest move the model may suggest, in percent of the estimate. */
const MAX_ADJUSTMENT = 15;

/* ─── Schema ────────────────────────────────────────────────────────── */

const responseSchema: Schema = {
  type: Type.OBJECT,
  propertyOrdering: [
    "verdict",
    "risks",
    "opportunities",
    "priceAdjustmentPercent",
    "priceAdjustmentReason",
    "confidence",
  ],
  required: [
    "verdict",
    "risks",
    "opportunities",
    "priceAdjustmentPercent",
    "priceAdjustmentReason",
    "confidence",
  ],
  properties: {
    verdict: {
      type: Type.STRING,
      description: "สรุป 2–4 ประโยคเป็นภาษาไทยว่างานนี้ควรเข้าแข่งหรือไม่ และเพราะอะไร",
    },
    risks: {
      type: Type.ARRAY,
      description: "ความเสี่ยงที่ทำให้ต้นทุนจริงสูงกว่าที่ประเมิน หรือทำให้แพ้ ไม่เกิน 5 ข้อ",
      items: {
        type: Type.OBJECT,
        propertyOrdering: ["topic", "detail", "impact"],
        required: ["topic", "detail", "impact"],
        properties: {
          topic: { type: Type.STRING, description: "หัวข้อสั้น ๆ เช่น ขอบเขตงาน, เงื่อนไขการจ่ายเงิน" },
          detail: { type: Type.STRING, description: "อธิบายเป็นภาษาไทย อ้างอิงข้อความใน TOR ถ้ามี" },
          impact: { type: Type.STRING, enum: ["high", "medium", "low"] },
        },
      },
    },
    opportunities: {
      type: Type.ARRAY,
      description:
        "สิ่งที่ทำได้เพื่อเพิ่มโอกาสชนะ เช่น เสริมทีม หาพันธมิตร เตรียมผลงานอ้างอิง " +
        "ห้ามแนะนำวิธีเขียนเอกสารข้อเสนอ",
      items: { type: Type.STRING },
    },
    priceAdjustmentPercent: {
      type: Type.NUMBER,
      description:
        `ควรปรับราคาจากค่ากลางที่ระบบคำนวณกี่เปอร์เซ็นต์ (-${MAX_ADJUSTMENT} ถึง ${MAX_ADJUSTMENT}) ` +
        "ค่าลบ = ควรเสนอต่ำลง, 0 = เห็นด้วยกับที่ระบบคำนวณ",
    },
    priceAdjustmentReason: { type: Type.STRING, description: "เหตุผลของการปรับราคา เป็นภาษาไทย" },
    confidence: { type: Type.STRING, enum: ["low", "medium", "high"] },
  },
};

/* ─── Prompt ────────────────────────────────────────────────────────── */

const systemInstruction = `คุณเป็นที่ปรึกษาด้านการประมูลงานภาครัฐไทย ช่วยบริษัทซอฟต์แวร์ประเมินว่าควรเข้าแข่งขันงานนี้หรือไม่

หน้าที่ของคุณ:
- วิเคราะห์ว่าต้นทุนจริงน่าจะสูงกว่าที่ระบบประเมินไว้ตรงไหน
- ชี้ความเสี่ยงจากขอบเขตงาน เงื่อนไขการจ่ายเงิน ค่าปรับ และระยะเวลา
- บอกว่าควรปรับราคาขึ้นหรือลงจากที่ระบบคำนวณ พร้อมเหตุผล

ข้อห้ามเด็ดขาด:
- ห้ามเขียนหรือร่างเอกสารข้อเสนอ เอกสารประกวดราคา หรือข้อความใด ๆ ที่ใช้ยื่นซอง
- ห้ามแนะนำวิธีหลีกเลี่ยงเงื่อนไขของ TOR หรือวิธีทำให้ดูมีคุณสมบัติเกินจริง
- ห้ามบอกว่า "ควรเสนอราคาเท่าไหร่" เป็นตัวเลขเด็ดขาด ให้บอกเป็นเปอร์เซ็นต์ที่ควรปรับจากค่าที่ระบบคำนวณเท่านั้น

หลักการ:
- ตอบเป็นภาษาไทยทั้งหมด
- อ้างอิงเฉพาะข้อมูลที่ให้มา ถ้าข้อมูลไม่พอให้บอกตรง ๆ และตั้ง confidence เป็น low
- ถ้าเห็นด้วยกับที่ระบบคำนวณ ให้ priceAdjustmentPercent เป็น 0 ไม่ต้องหาเรื่องปรับ
- คะแนนความเหมาะสมที่ระบบให้มาเป็นการประมาณจากโปรไฟล์ ไม่ใช่คะแนนจริงจากกรรมการ`;

/** Keep the prompt small: only the fields that bear on price and risk. */
function buildUserPrompt(input: BidAnalysisInput): string {
  const { title, agencyName, parsedData, estimate, match } = input;
  const money = (n?: number | null) => (n != null ? n.toLocaleString("th-TH") + " บาท" : "ไม่ระบุ");
  const lines: string[] = [];

  lines.push(`โครงการ: ${title}`);
  lines.push(`หน่วยงาน: ${agencyName}`);
  lines.push(`ประเภทงาน: ${parsedData.workType ?? "ไม่ระบุ"}`);
  lines.push("");

  lines.push("— ราคาและเกณฑ์ —");
  lines.push(`ราคาฐานที่ใช้คำนวณ: ${money(estimate.anchor?.value)} (${estimate.anchor?.kind === "median_price" ? "ราคากลาง" : "วงเงินงบประมาณ"})`);
  if (estimate.weights) {
    lines.push(`น้ำหนักคะแนน: ราคา ${estimate.weights.price} / เทคนิค ${estimate.weights.technical}`);
  }
  if (estimate.technicalPoints != null && estimate.weights) {
    lines.push(`คะแนนเทคนิคที่ระบบประมาณให้บริษัทนี้: ${estimate.technicalPoints.toFixed(1)} จาก ${estimate.weights.technical}`);
  }
  for (const s of estimate.scenarios ?? []) {
    lines.push(`  กรณี "${s.label}": ${money(s.bid)} (ต่ำกว่าฐาน ${s.discountPercent}%)`);
  }
  lines.push("");

  if (match) {
    lines.push("— ความเหมาะสมของบริษัท —");
    lines.push(`สถานะคุณสมบัติ: ${match.eligibilityStatus}`);
    lines.push(`ผ่าน ${match.counts.pass} / ไม่ผ่าน ${match.counts.fail} / ตรวจไม่ได้ ${match.counts.unknown}`);
    const weak = match.criteria
      .filter((c) => c.status !== "pass")
      .slice(0, 8)
      .map((c) => `  - ${c.criterion}: ${c.reason}`);
    if (weak.length) {
      lines.push("ข้อที่ยังไม่ผ่านหรือตรวจไม่ได้:");
      lines.push(...weak);
    }
    lines.push("");
  }

  const scope = parsedData.scopeOfWork?.content;
  if (scope) {
    lines.push("— ขอบเขตงาน —");
    // Scope can run to thousands of characters; the model only needs enough to
    // judge whether the work is bigger than the price implies.
    lines.push(scope.slice(0, 2500));
    lines.push("");
  }

  if (parsedData.paymentTerms?.length) {
    lines.push("— เงื่อนไขการจ่ายเงิน —");
    for (const t of parsedData.paymentTerms) {
      lines.push(`  งวด ${t.installment}${t.percent != null ? ` (${t.percent}%)` : ""}: ${t.condition}`);
    }
    lines.push("");
  }

  const duration = parsedData.keyDates?.contractDurationDays?.value;
  const warranty = parsedData.keyDates?.warrantyMonths?.value;
  if (duration != null || warranty != null) {
    lines.push("— ระยะเวลา —");
    if (duration != null) lines.push(`  ระยะเวลาดำเนินงาน: ${duration} วัน`);
    if (warranty != null) lines.push(`  รับประกัน: ${warranty} เดือน`);
    lines.push("");
  }

  const risks: IRiskClause[] = parsedData.riskClauses ?? [];
  if (risks.length) {
    lines.push("— ข้อสัญญาที่ระบบตั้งข้อสังเกต —");
    for (const r of risks.slice(0, 8)) lines.push(`  [${r.category}] ${r.reason}: ${r.clauseText.slice(0, 200)}`);
    lines.push("");
  }

  if (parsedData.techRequirements?.length) {
    const names = parsedData.techRequirements
      .map((t) => `${t.name}${t.isMandatory ? "*" : ""}`)
      .join(", ");
    lines.push(`— เทคโนโลยีที่ต้องใช้ (* = บังคับ) —\n  ${names}`);
    lines.push("");
  }

  lines.push("ช่วยวิเคราะห์ว่าควรเข้าแข่งงานนี้หรือไม่ และราคาที่ระบบคำนวณควรปรับหรือไม่");
  return lines.join("\n");
}

/* ─── Entry point ───────────────────────────────────────────────────── */

export interface BidAnalysisInput {
  title: string;
  agencyName: string;
  parsedData: IParsedData;
  estimate: BidEstimate;
  match: MatchResult | null;
}

export class BidAnalysisUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BidAnalysisUnavailableError";
  }
}

/**
 * Ask the model to critique a bid estimate.
 *
 * Unlike the extraction pipeline this does not retry: a user is waiting, and a
 * 30-second back-off would read as a hang. A failure surfaces immediately so
 * the caller can say "try again" while the deterministic estimate stays on
 * screen.
 */
export async function analyseBid(input: BidAnalysisInput): Promise<BidAnalysisResult> {
  if (!input.estimate.applicable) {
    throw new BidAnalysisUnavailableError("ประมาณราคาไม่ได้สำหรับ TOR ฉบับนี้ จึงยังไม่มีอะไรให้ AI วิเคราะห์");
  }
  if (aiCircuitBreaker.isOpen()) {
    throw new BidAnalysisUnavailableError("ระบบ AI หยุดให้บริการชั่วคราวเนื่องจากมีข้อผิดพลาดต่อเนื่อง กรุณาลองใหม่ภายหลัง");
  }

  const ai = getVertexClient();
  const model = getModelId();
  const t0 = Date.now();

  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
        abortSignal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      },
    });
    if (!res.text) {
      throw new Error(`Vertex AI ตอบว่างเปล่า (finishReason: ${res.candidates?.[0]?.finishReason})`);
    }
    const parsed = JSON.parse(res.text) as BidAnalysis;
    aiCircuitBreaker.onSuccess();

    // Clamp rather than trust. responseSchema constrains the shape, not the
    // range, so a model that decides the price should halve must not be able
    // to say so through this field.
    const raw = Number(parsed.priceAdjustmentPercent);
    const adjustment = Number.isFinite(raw) ? Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, raw)) : 0;

    const u = res.usageMetadata;
    return {
      analysis: {
        ...parsed,
        priceAdjustmentPercent: Math.round(adjustment * 10) / 10,
        risks: (parsed.risks ?? []).slice(0, 5),
        opportunities: (parsed.opportunities ?? []).slice(0, 5),
      },
      model,
      durationMs: Date.now() - t0,
      usage: { input: u?.promptTokenCount, output: u?.candidatesTokenCount, total: u?.totalTokenCount },
    };
  } catch (e) {
    aiCircuitBreaker.onFailure();
    throw e;
  }
}
