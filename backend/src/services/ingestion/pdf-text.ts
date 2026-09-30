/**
 * Pull the text layer out of a PDF, when it has one.
 *
 * Agency-uploaded TORs are nearly always scans (no text at all), but the
 * e-GP generated bidding document (doc_*.pdf) is real text. Reading its
 * numbers from text instead of from an image removes OCR errors such as ๘
 * read as ๕ — see prompts/v3.ts.
 *
 * Lines are rebuilt from each text item's position rather than taken in
 * content-stream order. e-GP fills form values in a separate pass, so stream
 * order puts them at the end of the line ("ยืนราคาไม่น้อยกว่า วัน …๙๐");
 * sorting by position puts "๙๐" back where it is printed.
 */

import { getDocumentProxy } from "unpdf";

export interface PdfText {
  pageCount: number;
  /** One string per page, lines joined with "\n". */
  pages: string[];
  /** Non-whitespace characters across all pages. */
  charCount: number;
  /** True when there is enough readable text to use instead of the image. */
  hasTextLayer: boolean;
  /** Why hasTextLayer is what it is — for logs. */
  reason: string;
}

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

/** Below this many characters per page the PDF is treated as a scan. */
const MIN_CHARS_PER_PAGE = 200;
/**
 * Thai PDFs made with legacy fonts extract as Latin-1 look-alikes
 * ("ÊÓËÃѺ"). Above this share of such characters the text is garbage.
 */
const MAX_MOJIBAKE_RATIO = 0.05;

function buildLines(items: Item[]): string[] {
  // PDF y grows upwards; group items whose baselines are within half a line.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(2, (line?.[0].size ?? it.size) * 0.5);
    if (line && Math.abs(line[0].y - it.y) <= tolerance) line.push(it);
    else lines.push([it]);
  }
  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let out = "";
    let end = -Infinity;
    for (const it of line) {
      // A visible gap becomes a space; touching items (split Thai words) join.
      if (out && it.x - end > it.size * 0.25) out += " ";
      out += it.str;
      end = Math.max(end, it.x + it.width);
    }
    return out.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

export async function extractPdfText(pdf: Buffer): Promise<PdfText> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const [a, b, , , x, y] = raw.transform as number[];
      items.push({ str: raw.str, x, y, width: raw.width, size: Math.hypot(a, b) || raw.height || 10 });
    }
    pages.push(buildLines(items).join("\n"));
  }
  await doc.cleanup();

  const all = pages.join("");
  const nonSpace = all.replace(/\s/g, "");
  const charCount = nonSpace.length;
  const perPage = doc.numPages ? charCount / doc.numPages : 0;
  const mojibake = charCount ? (nonSpace.match(/[À-ÿ]/g)?.length ?? 0) / charCount : 0;

  let hasTextLayer = true;
  let reason = `มี text ${Math.round(perPage)} ตัวอักษร/หน้า`;
  if (perPage < MIN_CHARS_PER_PAGE) {
    hasTextLayer = false;
    reason = `text น้อย (${Math.round(perPage)} ตัวอักษร/หน้า) — น่าจะเป็นภาพสแกน`;
  } else if (mojibake > MAX_MOJIBAKE_RATIO) {
    hasTextLayer = false;
    reason = `text อ่านไม่ออก (อักขระเพี้ยน ${(mojibake * 100).toFixed(0)}%) — ฟอนต์ไทยแบบเก่า`;
  }

  return { pageCount: doc.numPages, pages, charCount, hasTextLayer, reason };
}
