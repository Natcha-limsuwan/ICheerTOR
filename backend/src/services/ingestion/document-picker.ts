/**
 * Choose which document inside an e-GP archive is worth sending to the LLM.
 *
 * An archive holds anywhere from 3 to 17 files. Only one of them carries the
 * scope and qualifications; the rest are bonds, price tables and forms. Real
 * archives showed the TOR under different names —
 *   "Attach_TOR_1.pdf"  (67119538991)
 *   "TOR.pdf"           (66059313551)
 * — and some archives (completed projects) contain no TOR at all, only the
 * signed contract and its bonds. That last case is normal, not an error.
 *
 * Zip entry names are CP874-encoded when Thai, so names are decoded before
 * matching rather than compared as raw bytes.
 */

export interface ArchiveEntry {
  /** Name as decoded for display/matching. */
  name: string;
  /** Original entry name, for reading the file back out of the archive. */
  rawName: string;
  size: number;
}

export type DocumentKind =
  | "tor"
  | "bidding_doc"
  | "announcement"
  | "boq"
  | "contract"
  | "other";

export interface PickedDocument extends ArchiveEntry {
  kind: DocumentKind;
  /** Lower sorts first. */
  rank: number;
  reason: string;
}

interface Rule {
  kind: DocumentKind;
  rank: number;
  test: RegExp;
  reason: string;
}

/**
 * Order matters: the first matching rule wins, so the TOR patterns are
 * checked before the broader document ones.
 */
const RULES: Rule[] = [
  {
    kind: "tor",
    rank: 0,
    // Attach_TOR_1.pdf, TOR.pdf, tor_final_v1.pdf, ขอบเขตงาน.pdf
    test: /(^|[_\-\s/])tor([_\-\s.]|$)|ขอบเขตงาน|ขอบเขตของงาน|terms?\s*of\s*reference/i,
    reason: "ชื่อไฟล์บ่งชี้ว่าเป็นร่างขอบเขตงาน (TOR)",
  },
  {
    kind: "bidding_doc",
    rank: 1,
    test: /bidding|เอกสารประกวดราคา|document\s*part|e-?bidding/i,
    reason: "เอกสารประกวดราคา — มีคุณสมบัติผู้ยื่นข้อเสนอบางส่วน",
  },
  {
    kind: "announcement",
    rank: 2,
    test: /^annoudoc|announce|ประกาศ|notice/i,
    reason: "ประกาศเชิญชวน — มีวันที่และวงเงิน",
  },
  {
    kind: "boq",
    rank: 3,
    test: /boq|quotation|ราคากลาง|bill\s*of\s*quant/i,
    reason: "รายการปริมาณงาน/ราคากลาง",
  },
  {
    kind: "contract",
    rank: 4,
    // Present only after award; no value for pre-bid analysis.
    test: /contract|bond|สัญญา|หลักประกัน|retention|performance/i,
    reason: "เอกสารสัญญา/หลักประกัน — เป็นข้อมูลหลังประมูล",
  },
];

const PDF_RE = /\.pdf$/i;

function classify(entry: ArchiveEntry): PickedDocument {
  for (const rule of RULES) {
    if (rule.test.test(entry.name)) {
      return { ...entry, kind: rule.kind, rank: rule.rank, reason: rule.reason };
    }
  }
  return { ...entry, kind: "other", rank: 5, reason: "ไม่ตรงรูปแบบที่รู้จัก" };
}

export interface PickResult {
  /** The document to parse, or null when the archive holds no usable one. */
  best: PickedDocument | null;
  /** Every PDF, classified and ranked — useful for logging and audit. */
  ranked: PickedDocument[];
  /** True when a genuine TOR was found (as opposed to a fallback). */
  hasTor: boolean;
  /** Set when best is null, explaining why. */
  skipReason?: string;
}

/**
 * Pick the document to parse. Falls back to the bidding document or the
 * announcement when no TOR is present, since those still carry some of the
 * fields we extract — but never to contracts, which post-date the bid.
 */
export function pickDocument(entries: ArchiveEntry[]): PickResult {
  const pdfs = entries.filter((e) => PDF_RE.test(e.name) && e.size > 0);

  if (pdfs.length === 0) {
    return { best: null, ranked: [], hasTor: false, skipReason: "ไม่มีไฟล์ PDF ในชุดเอกสาร" };
  }

  const ranked = pdfs
    .map(classify)
    // Prefer the larger file when two share a rank: the fuller document.
    .sort((a, b) => a.rank - b.rank || b.size - a.size);

  const hasTor = ranked.some((d) => d.kind === "tor");
  const usable = ranked.filter((d) => d.rank <= 2);

  if (usable.length === 0) {
    return {
      best: null,
      ranked,
      hasTor: false,
      skipReason:
        "ชุดเอกสารมีแต่สัญญา/หลักประกัน/ราคากลาง — เป็นโครงการที่ประมูลเสร็จแล้ว",
    };
  }

  return { best: usable[0], ranked, hasTor };
}
