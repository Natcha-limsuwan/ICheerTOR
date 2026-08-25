import { IParsedData, IRedFlag } from "@/lib/db/models/tor-record";

/**
 * Rule-based red-flag analyzer for public-hearing phase TOR documents.
 * Deterministic — no LLM calls required.
 */

interface RedFlagRule {
  ruleId: string;
  name: string;
  severity: "info" | "warning" | "critical";
  recommendedAction: string;
}

// Load rules statically
const rules: RedFlagRule[] = [
  { ruleId: "RF-001", name: "Narrow vendor spec", severity: "critical", recommendedAction: "พิจารณายื่นความคิดเห็นในช่วงรับฟังความคิดเห็น เสนอให้ระบุคุณสมบัติทั่วไปแทนการระบุยี่ห้อ" },
  { ruleId: "RF-002", name: "High min contract value", severity: "warning", recommendedAction: "พิจารณายื่นความคิดเห็นในช่วงรับฟังความคิดเห็น เสนอให้ลดมูลค่าขั้นต่ำลงเพื่อเปิดโอกาสการแข่งขัน" },
  { ruleId: "RF-003", name: "Compressed timeline", severity: "warning", recommendedAction: "เสนอให้ขยายระยะเวลายื่นข้อเสนอเพื่อให้ผู้ประกอบการมีเวลาเตรียมตัวเพียงพอ" },
  { ruleId: "RF-005", name: "Budget outlier", severity: "info", recommendedAction: "ราคากลางอาจไม่สอดคล้องกับอัตราตลาด พิจารณาตรวจสอบเพิ่มเติม" },
];

const BRAND_PATTERNS = [
  /microsoft/i, /oracle/i, /sap/i, /ibm/i,
  /cisco/i, /hp/i, /dell/i, /fortinet/i,
  /vmware/i, /aws/i, /azure/i,
];

export function analyzeRedFlags(
  parsedData: IParsedData,
  phase: string,
  postingDate?: Date,
  submissionDeadline?: Date,
): IRedFlag[] {
  // Only analyse public-hearing phase
  if (phase !== "public_hearing") return [];

  const flags: IRedFlag[] = [];

  // RF-001: Check for brand-specific requirements
  for (const q of parsedData.qualifications) {
    const text = q.criterion.toLowerCase();
    for (const pattern of BRAND_PATTERNS) {
      if (pattern.test(text)) {
        flags.push({
          clauseText: q.criterion,
          reason: `ข้อกำหนดระบุชื่อยี่ห้อ/แบรนด์เฉพาะ (${pattern.source}) ซึ่งอาจจำกัดการแข่งขัน`,
          severity: rules[0].severity,
          recommendedAction: rules[0].recommendedAction,
          ruleId: "RF-001",
        });
        break;
      }
    }
  }

  // RF-002: High minimum contract value relative to median price
  if (parsedData.medianPrice.value) {
    for (const q of parsedData.qualifications) {
      if (q.type === "contract_value" && typeof q.minimumValue === "number") {
        const ratio = q.minimumValue / parsedData.medianPrice.value;
        if (ratio > 0.8) {
          flags.push({
            clauseText: q.criterion,
            reason: `ข้อกำหนดมูลค่าขั้นต่ำของสัญญาสูงเมื่อเทียบกับราคากลาง (${Math.round(ratio * 100)}% ของราคากลาง) ซึ่งอาจจำกัดการแข่งขัน`,
            severity: rules[1].severity,
            recommendedAction: rules[1].recommendedAction,
            ruleId: "RF-002",
          });
        }
      }
    }
  }

  // RF-003: Compressed timeline
  if (postingDate && submissionDeadline) {
    const daysDiff = Math.ceil(
      (submissionDeadline.getTime() - postingDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysDiff < 15) {
      flags.push({
        clauseText: `ระยะเวลายื่นข้อเสนอ ${daysDiff} วัน`,
        reason: `ระยะเวลาตั้งแต่ประกาศถึงกำหนดส่ง (${daysDiff} วัน) น้อยกว่า 15 วัน`,
        severity: rules[2].severity,
        recommendedAction: rules[2].recommendedAction,
        ruleId: "RF-003",
      });
    }
  }

  return flags;
}
