/**
 * Trim the e-GP bidding document (doc_*.pdf) to the sections worth sending
 * to the model.
 *
 * The document is the e-GP standard template: about 16 pages and 34k Thai
 * characters, most of it boilerplate on how to submit and sign. Thai text is
 * token-heavy, so the whole thing would cost more than the scanned TOR it
 * accompanies. Only these carry facts we extract:
 *
 *   ๒.  คุณสมบัติของผู้ยื่นข้อเสนอ        qualifications, capital, net worth
 *   ๖.  หลักเกณฑ์และสิทธิในการพิจารณา     evaluation method and weights
 *   ๘.  ค่าจ้าง/ค่าสิ่งของและการจ่ายเงิน  payment instalments
 *   ๙.  อัตราค่าปรับ                      penalty rate
 *   ๑๐. การรับประกันความชำรุดบกพร่อง     warranty period
 *
 * Section numbers shift between templates (a service contract has no
 * warranty section), so headings are found by name, not by number.
 */

/** Every top-level heading of the template, so a kept section knows where it ends. */
const HEADING =
  /^[๐-๙0-9]{1,2}\.\s*(เอกสารแนบท้าย|คุณสมบัติของผู้ยื่นข้อเสนอ|หลักฐานการยื่นข้อเสนอ|การเสนอราคา|การยื่นข้อเสนอ|หลักประกันการเสนอราคา|หลักเกณฑ์และสิทธิ|การทำสัญญา|ค่าจ้างและการจ่ายเงิน|ค่าสิ่งของและการจ่ายเงิน|การจ่ายเงิน|อัตราค่าปรับ|การรับประกันความชำรุดบกพร่อง|ข้อสงวนสิทธิ|การปฏิบัติตามกฎหมาย|การประเมินผลการปฏิบัติงาน|มาตรฐานฝีมือช่าง)/;

const KEEP = /คุณสมบัติของผู้ยื่นข้อเสนอ|หลักเกณฑ์และสิทธิ|การจ่ายเงิน|อัตราค่าปรับ|การรับประกันความชำรุดบกพร่อง/;

/** The cover lines name the project and the procurement method. */
const COVER_LINES = 12;

export interface SlicedBiddingDoc {
  text: string;
  /** Headings that were kept, for logs and eval output. */
  sections: string[];
  /** True when no known heading was found and the full text was used. */
  fallback: boolean;
  originalChars: number;
}

export function sliceBiddingDoc(fullText: string, maxChars = 40_000): SlicedBiddingDoc {
  const lines = fullText.split("\n").filter((l) => !/^=== หน้า \d+ ===$/.test(l));
  const out: string[] = lines.slice(0, COVER_LINES);
  const sections: string[] = [];
  let keeping = false;

  for (const line of lines.slice(COVER_LINES)) {
    const heading = HEADING.exec(line.trim());
    if (heading) {
      keeping = KEEP.test(heading[1]);
      if (keeping) {
        sections.push(line.trim());
        out.push("");
      }
    }
    if (keeping) out.push(line);
  }

  const fallback = sections.length === 0;
  const text = (fallback ? lines.join("\n") : out.join("\n")).slice(0, maxChars);
  return { text, sections, fallback, originalChars: fullText.length };
}
