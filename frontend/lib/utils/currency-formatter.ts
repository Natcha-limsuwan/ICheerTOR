/**
 * Thai Baht (฿) currency formatting utilities.
 */

/**
 * Format a number as Thai Baht currency.
 * @example formatThaiBaht(5000000) → "฿5,000,000.00"
 */
export function formatThaiBaht(
  value: number,
  options?: { compact?: boolean; decimals?: number },
): string {
  const { compact = false, decimals = 2 } = options ?? {};

  if (compact) {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }

  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Parse a Thai Baht string back to a number.
 * Handles formats like "฿5,000,000.00" or "5,000,000 บาท".
 */
export function parseThaiBaht(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[฿,บาท\s]/g, "").trim();
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}
