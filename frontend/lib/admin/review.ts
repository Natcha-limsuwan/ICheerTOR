/**
 * Shared types and labels for the admin TOR review and pipeline pages.
 * Shapes mirror backend/src/routes/admin.routes.ts and services/tor-review.ts.
 */

export interface UncertainItem {
  field: string;
  label: string;
  value?: unknown;
  confidence: number | null;
  sourcePage?: number | null;
  reason: string;
}

export interface TorReviewState {
  status: "verified" | "outdated";
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  note?: string | null;
  editedFields?: string[];
}

export const REVIEW_STATUS_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "รอตรวจทาน", bg: "#FFF8EB", color: "#92400E" },
  verified: { label: "ตรวจแล้ว", bg: "#E8F8ED", color: "#166534" },
  outdated: { label: "ต้องตรวจใหม่", bg: "#FEF2F2", color: "#991B1B" },
};

export const WORK_TYPE_LABELS: Record<string, string> = {
  development: "พัฒนาระบบ",
  license: "ซื้อลิขสิทธิ์ซอฟต์แวร์",
  hardware: "ฮาร์ดแวร์",
  maintenance: "บำรุงรักษา",
  service: "บริการ",
  other: "อื่น ๆ",
};

export const QUALIFICATION_TYPE_LABELS: Record<string, string> = {
  contract_value: "ผลงาน (มูลค่าสัญญา)",
  company_age: "อายุบริษัท",
  registered_capital: "ทุนจดทะเบียน",
  net_worth: "มูลค่าสุทธิของกิจการ",
  personnel: "บุคลากร",
  tech_stack: "เทคโนโลยี",
  certification: "ใบรับรอง",
  other: "อื่น ๆ",
};

export const CONFLICT_LABELS: Record<string, string> = {
  bids_closed_still_open: "ปิดรับซองแล้วแต่สถานะยังเปิด",
  hearing_but_announced: "ยังอยู่ช่วงประชาพิจารณ์แต่มีประกาศแล้ว",
  awarded_before_bid_day: "ประกาศผู้ชนะก่อนวันยื่นซอง",
  price_mismatch: "ราคาไม่ตรงกันระหว่างแหล่งข้อมูล",
  extraction_review: "ผลการอ่านของ AI ต้องให้คนตรวจ",
};

export const EXTRACTION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: "สำเร็จ", color: "#166534" },
  processing: { label: "กำลังประมวลผล", color: "#1D4ED8" },
  pending: { label: "รอประมวลผล", color: "#92400E" },
  failed: { label: "ล้มเหลว", color: "#991B1B" },
  skipped: { label: "ข้าม", color: "#64748B" },
};

export function formatThaiDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBaht(value?: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("th-TH")} บาท`;
}
