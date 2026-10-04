/**
 * Buddhist Era (B.E.) ↔ Gregorian date conversion utilities.
 *
 * Thai government documents use the Buddhist Era calendar where
 * B.E. year = Gregorian year + 543.
 */

const BE_OFFSET = 543;

/** Convert a Gregorian year to Buddhist Era. */
export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + BE_OFFSET;
}

/** Convert a Buddhist Era year to Gregorian. */
export function toGregorianYear(buddhistYear: number): number {
  return buddhistYear - BE_OFFSET;
}

/**
 * Parse a Thai-formatted date string that may use B.E. years.
 * Supports formats like "15 สิงหาคม 2569" or "15/08/2569".
 * Returns a Gregorian Date object for internal storage.
 */
const THAI_MONTHS: Record<string, number> = {
  มกราคม: 0,
  กุมภาพันธ์: 1,
  มีนาคม: 2,
  เมษายน: 3,
  พฤษภาคม: 4,
  มิถุนายน: 5,
  กรกฎาคม: 6,
  สิงหาคม: 7,
  กันยายน: 8,
  ตุลาคม: 9,
  พฤศจิกายน: 10,
  ธันวาคม: 11,
};

const THAI_MONTH_ABBR: Record<string, number> = {
  "ม.ค.": 0,
  "ก.พ.": 1,
  "มี.ค.": 2,
  "เม.ย.": 3,
  "พ.ค.": 4,
  "มิ.ย.": 5,
  "ก.ค.": 6,
  "ส.ค.": 7,
  "ก.ย.": 8,
  "ต.ค.": 9,
  "พ.ย.": 10,
  "ธ.ค.": 11,
};

/**
 * Attempt to parse a Thai date string containing a B.E. year.
 * Returns `null` if parsing fails.
 */
export function parseThaiDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try "DD/MM/YYYY" numeric format first (B.E.)
  const numMatch = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10) - 1;
    let year = parseInt(numMatch[3], 10);
    // If year > 2400, treat as Buddhist Era
    if (year > 2400) year = toGregorianYear(year);
    return new Date(year, month, day);
  }

  // Try "DD <ThaiMonth> YYYY" format
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10);
    const monthName = parts[1];
    let year = parseInt(parts[parts.length - 1], 10);
    if (year > 2400) year = toGregorianYear(year);

    const month =
      THAI_MONTHS[monthName] ?? THAI_MONTH_ABBR[monthName] ?? null;
    if (month !== null && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  return null;
}

/**
 * Format a Date as a Thai-locale string.
 * @param useBE If true, display the year in Buddhist Era.
 */
export function formatThaiDate(
  date: Date,
  useBE: boolean = true,
  style: "long" | "short" = "long",
): string {
  const locale = "th-TH";
  if (useBE) {
    // Intl with th-TH-u-ca-buddhist uses B.E. natively
    return date.toLocaleDateString("th-TH-u-ca-buddhist", {
      year: "numeric",
      month: style,
      day: "numeric",
    });
  }
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: style,
    day: "numeric",
  });
}
