/**
 * Read Thai number words — "สี่ล้านบาทถ้วน" → 4000000.
 *
 * TORs often write an amount twice: "๔,๐๐๐,๐๐๐.- บาท (สี่ล้านบาทถ้วน)".
 * On a scan the digits ๔ ๕ ๘ are easy to confuse and the words are not, so
 * validate-extraction.ts checks one against the other.
 *
 * Handles the forms that appear in procurement documents: units up to ล้าน
 * (and ล้าน repeated, "พันล้าน"), เอ็ด, ยี่, and สตางค์. Returns null for
 * anything it cannot read fully, rather than a partial number.
 */

const DIGITS: Record<string, number> = {
  ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9,
};
const UNITS: Record<string, number> = { สิบ: 10, ร้อย: 100, พัน: 1_000, หมื่น: 10_000, แสน: 100_000 };

// Longest words first so "หนึ่ง" wins over nothing and "ยี่" over nothing.
const TOKENS = [...Object.keys(DIGITS), ...Object.keys(UNITS), "ล้าน"].sort((a, b) => b.length - a.length);

function tokenize(s: string): string[] | null {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const t = TOKENS.find((tok) => s.startsWith(tok, i));
    if (!t) return null;
    out.push(t);
    i += t.length;
  }
  return out;
}

/** Value of a run below one million, e.g. ["สาม","แสน","สอง","หมื่น"]. */
function belowMillion(tokens: string[]): number | null {
  let total = 0;
  let pending: number | null = null;
  for (const t of tokens) {
    if (t in DIGITS) {
      if (pending !== null) return null; // two digits in a row
      pending = DIGITS[t];
    } else {
      // "สิบ" alone means 10 (pending 1); "ยี่สิบ" is 20.
      total += (pending ?? 1) * UNITS[t];
      pending = null;
    }
  }
  return total + (pending ?? 0);
}

/** Parse an integer in words, or null. */
function parseInteger(words: string): number | null {
  const tokens = tokenize(words);
  if (!tokens || tokens.length === 0) return null;
  // Split on ล้าน from the right: "สองพันล้าน" = 2000 × 10^6.
  let value = 0;
  let multiplier = 1;
  let group: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "ล้าน") {
      const g = belowMillion(group.reverse());
      if (g === null) return null;
      value += g * multiplier;
      multiplier *= 1_000_000;
      group = [];
    } else {
      group.push(tokens[i]);
    }
  }
  const head = belowMillion(group.reverse());
  if (head === null) return null;
  // "ล้าน" leading with nothing before it means one million.
  value += (group.length === 0 && multiplier > 1 ? 1 : head) * multiplier;
  return value;
}

/**
 * Parse an amount written in Thai words. Accepts the usual wrapping —
 * parentheses, "บาท", "ถ้วน", "สตางค์", spaces — and returns baht.
 */
export function parseThaiAmountWords(input: string): number | null {
  const s = input.replace(/[()\s.\-–]/g, "").replace(/ถ้วน$/, "");
  if (!s) return null;
  const m = /^(.*?)บาท(?:(.*?)สตางค์)?$/.exec(s);
  const bahtWords = m ? m[1] : s;
  const satangWords = m?.[2];
  const baht = parseInteger(bahtWords);
  if (baht === null) return null;
  if (!satangWords) return baht;
  const satang = parseInteger(satangWords);
  return satang === null ? null : baht + satang / 100;
}

/** "๔,๐๐๐,๐๐๐.๐๐" → 4000000. Null when there is no number. */
export function parseThaiDigits(input: string): number | null {
  const ascii = input
    .replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)))
    .replace(/[,\s]/g, "");
  const m = /\d+(\.\d+)?/.exec(ascii);
  return m ? Number(m[0]) : null;
}
