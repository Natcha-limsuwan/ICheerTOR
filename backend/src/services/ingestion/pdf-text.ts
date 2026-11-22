/* Extract the PDF text layer and rebuild lines from item positions.
 * Scanned TORs may have no text layer. Generated doc_*.pdf forms usually do;
 * position sorting puts separately written form values back into their lines. */

import { getDocumentProxy } from "unpdf";

export interface PdfText {
  pageCount: number;
  /* One string per page, lines joined with "\n". */
  pages: string[];
  /* Non-whitespace characters across all pages. */
  charCount: number;
  /* True when there is enough readable text to use instead of the image. */
  hasTextLayer: boolean;
  /* Why hasTextLayer is what it is — for logs. */
  reason: string;
}

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

/* Below this many characters per page the PDF is treated as a scan. */
const MIN_CHARS_PER_PAGE = 200;
/* Thai PDFs made with legacy fonts extract as Latin-1 look-alikes
 * ("ÊÓËÃѺ"). Above this share of such characters the text is garbage. */
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
  if (pdf.length > 40 * 1024 * 1024 || !pdf.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("Invalid or oversized PDF");
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const pageCount = doc.numPages;
  let textSize = 0;
  const pages: string[] = [];
  try {
    if (pageCount > 500) throw new Error("PDF page limit exceeded");
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      if (content.items.length > 100000) throw new Error("PDF content limit exceeded");
      const items: Item[] = [];
      for (const raw of content.items) {
        if (!("str" in raw) || !raw.str.trim()) continue;
        const [a, b, , , x, y] = raw.transform as number[];
        items.push({ str: raw.str, x, y, width: raw.width, size: Math.hypot(a, b) || raw.height || 10 });
      }
      const text = buildLines(items).join("\n");
      textSize += text.length;
      if (textSize > 2000000) throw new Error("PDF text limit exceeded");
      pages.push(text);
    }
  } finally { await doc.cleanup(); }

  const all = pages.join("");
  const nonSpace = all.replace(/\s/g, "");
  const charCount = nonSpace.length;
  const perPage = pageCount ? charCount / pageCount : 0;
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

  return { pageCount, pages, charCount, hasTextLayer, reason };
}
