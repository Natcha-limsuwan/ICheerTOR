/**
 * Facts read straight from the e-GP generated documents, without the model.
 *
 * The announcement (annoudoc_*.pdf) and the bidding document (doc_*.pdf) are
 * e-GP forms with a text layer, so the fields the agency fills in can be read
 * with patterns — exactly, cheaply, and without the model inventing a value
 * when the form is still blank:
 *
 *   "ผู้ยื่นข้อเสนอต้องเสนอราคาทางระบบ ... ในวันที่ ๑๖ มีนาคม ๒๕๖๙
 *    ระหว่างเวลา ๐๙.๐๐ น. ถึง ๑๒.๐๐ น."
 *   "๔.๓ ผู้ยื่นข้อเสนอจะต้องเสนอกำหนดเวลาดำเนินการแล้วเสร็จไม่เกิน ๑๘๓ วัน"
 *
 * Also read: the announcement date, the document-fee period (paid after the
 * bid day in BMA announcements), and every dated sentence in the
 * announcement, so no date is lost before it has a name of its own.
 *
 * e-bidding takes bids on a single day within a time window, so the
 * submission date is that day plus the window. Until the agency fixes the
 * date the form reads "ในวันที่ ระหว่างเวลา น. ถึง น." — that is "pending",
 * not missing: the record should be re-read once e-GP publishes the final
 * announcement. Checking again is cheap because no model call is involved.
 */

import { parseThaiAmountWords } from "../ai/thai-number";

export type SubmissionDateStatus = "confirmed" | "pending";

export interface SubmissionDate {
  /** ISO date, e.g. "2026-03-16". Null while the announcement leaves it blank. */
  date: string | null;
  /** "09:00" — bids are accepted only inside this window, Bangkok time. */
  startTime: string | null;
  endTime: string | null;
  /** End of the window as an instant — the effective deadline. */
  closesAt: Date | null;
  status: SubmissionDateStatus;
  /** The sentence the date was read from, for checking by hand. */
  rawText: string | null;
  /** File the date came from. */
  source: string | null;
}

export interface ContractDuration {
  days: number;
  rawText: string;
  source: string;
}

export interface StatedAmount {
  /** Baht. */
  value: number;
  rawText: string;
  source: string;
}

/** "final" = the invitation as announced, "draft" = the public-hearing draft. */
export type DocumentStage = "final" | "draft";

export interface DatePeriod {
  /** ISO dates. */
  from: string;
  to: string;
  rawText: string;
  source: string;
}

export interface DatedSentence {
  /** ISO date. */
  date: string;
  /** The sentence around the date, so a person can tell what it is. */
  rawText: string;
  source: string;
}

export interface ArchiveFacts {
  /** Which archive the documents came from. Null when unknown. */
  documentStage: DocumentStage | null;
  submissionDate: SubmissionDate;
  contractDuration: ContractDuration | null;
  /** "ประกาศ ณ วันที่ / ลงวันที่ ..." of the announcement, when filled in. ISO date. */
  announcedDate: string | null;
  /**
   * "ผู้ยื่นข้อเสนอต้องชำระเงินค่าซื้อเอกสาร… ตั้งแต่วันที่ … ถึงวันที่ …".
   * In BMA announcements it falls after the bid day — bidders pay for the
   * documents afterwards — so it is a second deadline, not part of preparing.
   */
  documentFeePeriod: DatePeriod | null;
  /** Every dated sentence in the announcement, named or not — nothing dropped. */
  announcementDates: DatedSentence[];
  /**
   * "ราคากลางของงาน... เป็นเงินทั้งสิ้น X บาท (words)" in the announcement.
   * Checks egp2's figure — which has dropped digits (3,398,000 for 23,398,000).
   * TORs often call this same figure "วงเงินงบประมาณ".
   */
  medianPrice: StatedAmount | null;
  /** Bid bond in the bidding document — e-GP sets it at 5 % of the budget. */
  bidBond: StatedAmount | null;
}

export interface TextDocument {
  fileName: string;
  text: string;
}

const MONTHS: Record<string, number> = {
  มกราคม: 1, "ม.ค.": 1,
  กุมภาพันธ์: 2, "ก.พ.": 2,
  มีนาคม: 3, "มี.ค.": 3,
  เมษายน: 4, "เม.ย.": 4,
  พฤษภาคม: 5, "พ.ค.": 5,
  มิถุนายน: 6, "มิ.ย.": 6,
  กรกฎาคม: 7, "ก.ค.": 7,
  สิงหาคม: 8, "ส.ค.": 8,
  กันยายน: 9, "ก.ย.": 9,
  ตุลาคม: 10, "ต.ค.": 10,
  พฤศจิกายน: 11, "พ.ย.": 11,
  ธันวาคม: 12, "ธ.ค.": 12,
};
const MONTH = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .map((m) => m.replace(/\./g, "\\."))
  .join("|");

/** Thai digits to ASCII, and every run of whitespace (line breaks too) to one space. */
function normalise(text: string): string {
  return text
    .replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)))
    .replace(/\s+/g, " ");
}

/** Buddhist-era day/month/year to ISO; null when the date does not exist. */
function isoDate(day: string, month: string, beYear: string): string | null {
  const y = Number(beYear) - 543;
  const m = MONTHS[month];
  const d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!m || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const time = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

const SUBMISSION =
  new RegExp(
    `(เสนอราคา.{0,120}?ในวันที่\\s*(\\d{1,2})\\s*(${MONTH})\\s*(?:พ\\.ศ\\.\\s*)?(\\d{4})\\s*` +
      `ระหว่างเวลา\\s*(\\d{1,2})[.:](\\d{2})\\s*น\\.?\\s*ถึง\\s*(\\d{1,2})[.:](\\d{2})\\s*น\\.?)`,
  );
/** The same sentence with the date still blank on the form. */
const SUBMISSION_BLANK = /(เสนอราคา.{0,120}?ในวันที่\s*ระหว่างเวลา)/;

/** A full Thai date, "10 มิถุนายน พ.ศ. 2569" after normalise. Groups: day, month, year. */
const DATE = `(\\d{1,2})\\s*(${MONTH})\\s*(?:พ\\.ศ\\.\\s*)?(\\d{4})`;
/** "ประกาศ ณ วันที่" is the announcement's own date; "ลงวันที่" is the fallback. */
const ANNOUNCED = [new RegExp(`ประกาศ ณ วันที่\\s*${DATE}`), new RegExp(`ลงวันที่\\s*${DATE}`)];
const DOCUMENT_FEE = new RegExp(`(ค่าซื้อเอกสาร.{0,160}?ตั้งแต่วันที่\\s*${DATE}\\s*ถึงวันที่\\s*${DATE})`);
const ANY_DATE = new RegExp(DATE, "g");
const ANNOUNCEMENT_FILE = /^annoudoc/i;

const DURATION =
  /(กำหนดเวลา(?:ดำเนินการแล้วเสร็จ|ดำเนินงานแล้วเสร็จ|ส่งมอบพัสดุ|ส่งมอบงาน|แล้วเสร็จ)\s*ไม่เกิน\s*(\d{1,4})\s*(วัน|เดือน|ปี))/;
const UNIT_DAYS: Record<string, number> = { วัน: 1, เดือน: 30, ปี: 365 };

export function readSubmissionDate(docs: TextDocument[]): SubmissionDate {
  let blank: { rawText: string; source: string } | null = null;
  for (const doc of docs) {
    const text = normalise(doc.text);
    const m = SUBMISSION.exec(text);
    if (m) {
      const [, rawText, day, month, year, h1, m1, h2, m2] = m;
      const date = isoDate(day, month, year);
      if (!date) continue;
      const endTime = time(h2, m2);
      return {
        date,
        startTime: time(h1, m1),
        endTime,
        closesAt: new Date(`${date}T${endTime}:00+07:00`),
        status: "confirmed",
        rawText,
        source: doc.fileName,
      };
    }
    const b = SUBMISSION_BLANK.exec(text);
    if (b && !blank) blank = { rawText: b[1], source: doc.fileName };
  }
  return {
    date: null,
    startTime: null,
    endTime: null,
    closesAt: null,
    status: "pending",
    rawText: blank?.rawText ?? null,
    source: blank?.source ?? null,
  };
}

export function readContractDuration(docs: TextDocument[]): ContractDuration | null {
  for (const doc of docs) {
    const m = DURATION.exec(normalise(doc.text));
    if (m) return { days: Number(m[2]) * UNIT_DAYS[m[3]], rawText: m[1], source: doc.fileName };
  }
  return null;
}

export function readAnnouncedDate(docs: TextDocument[]): string | null {
  for (const pattern of ANNOUNCED) {
    for (const doc of docs) {
      const m = pattern.exec(normalise(doc.text));
      const date = m && isoDate(m[1], m[2], m[3]);
      if (date) return date;
    }
  }
  return null;
}

export function readDocumentFeePeriod(docs: TextDocument[]): DatePeriod | null {
  for (const doc of docs) {
    const m = DOCUMENT_FEE.exec(normalise(doc.text));
    if (!m) continue;
    const from = isoDate(m[2], m[3], m[4]);
    const to = isoDate(m[5], m[6], m[7]);
    if (from && to) return { from, to, rawText: m[1], source: doc.fileName };
  }
  return null;
}

/**
 * PDPA: the announcement ends in signature blocks naming officials. A date's
 * context is therefore the words BEFORE it only, cut back to where its
 * sentence starts, with titled names masked — and the "ประกาศขึ้นเว็บ" stamp,
 * which sits inside a signature block, is skipped (it repeats announcedDate).
 */
const SENTENCE_START = /(?:^|\s)(?:\d{1,2}\.\s|ประกาศ ณ|ผู้)/g;
// A title only at a word start — "มิถุนายน" contains "นาย".
const TITLED_NAME = /(?<=^|[\s(])(?:นางสาว|นาง|นาย|ว่าที่\s*ร(?:้อย)?\s*\.?\s*ต(?:รี)?\.?|ดร\.)\s*[ก-๙]+(?:\s+[ก-๙]+)?/g;
const SIGNATURE_STAMP = /ประกาศขึ้นเว็บ/;

function dateContext(text: string, index: number, match: string): string | null {
  const before = text.slice(Math.max(0, index - 140), index);
  if (SIGNATURE_STAMP.test(before)) return null;
  const starts = [...before.matchAll(SENTENCE_START)];
  const from = starts.length ? starts[starts.length - 1].index! : 0;
  return (before.slice(from) + match).replace(TITLED_NAME, "[ชื่อ]").trim();
}

/** Every full date in the announcement, with the words before it. */
export function readAnnouncementDates(docs: TextDocument[]): DatedSentence[] {
  const out: DatedSentence[] = [];
  const seen = new Set<string>();
  for (const doc of docs.filter((d) => ANNOUNCEMENT_FILE.test(d.fileName))) {
    const text = normalise(doc.text);
    for (const m of text.matchAll(ANY_DATE)) {
      const date = isoDate(m[1], m[2], m[3]);
      if (!date) continue;
      const rawText = dateContext(text, m.index, m[0]);
      if (!rawText) continue;
      const key = `${date}|${rawText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date, rawText, source: doc.fileName });
    }
  }
  return out;
}

const AMOUNT = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?)\\s*บาท\\s*(\\([^)]{4,120}\\))?";
const MEDIAN_PRICE = new RegExp(`(ราคากลางของงาน.{0,80}?เป็นเงินทั้งสิ้น\\s*${AMOUNT})`);
const BID_BOND = new RegExp(`(หลักประกัน.{0,160}?จำนวน\\s*${AMOUNT})`);

/**
 * First amount matching `pattern`. Digits in a text layer are exact, but the
 * words in brackets are checked too: an amount whose words disagree is
 * skipped rather than trusted.
 */
function readAmount(docs: TextDocument[], pattern: RegExp): StatedAmount | null {
  for (const doc of docs) {
    const m = pattern.exec(normalise(doc.text));
    if (!m) continue;
    const value = Number(m[2].replace(/,/g, ""));
    const fromWords = m[3] ? parseThaiAmountWords(m[3]) : null;
    if (fromWords != null && fromWords !== value) continue;
    return { value, rawText: m[1], source: doc.fileName };
  }
  return null;
}

/**
 * Read every fact from the documents that have a text layer. Pass the
 * announcement first: it is the official source for the submission date and
 * the reference price, and the bidding document only repeats them.
 */
export function readArchiveFacts(docs: TextDocument[], documentStage: DocumentStage | null = null): ArchiveFacts {
  return {
    documentStage,
    submissionDate: readSubmissionDate(docs),
    contractDuration: readContractDuration(docs),
    announcedDate: readAnnouncedDate(docs),
    documentFeePeriod: readDocumentFeePeriod(docs),
    announcementDates: readAnnouncementDates(docs),
    medianPrice: readAmount(docs, MEDIAN_PRICE),
    bidBond: readAmount(docs, BID_BOND),
  };
}
