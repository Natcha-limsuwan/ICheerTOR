/** Literal, bilingual keyword search; each keyword must match at least one field. */
const SEARCH_FIELDS = [
  "title", "agencyName", "tags", "metadata.projectId",
  "summary.overview", "summary.keyPoints", "summary.deliverables",
  "parsedData.scopeOfWork.content", "parsedData.techRequirements.name",
];

const SYNONYMS = [
  ["เว็บไซต์", "เวบไซต์", "เว็บ", "website", "web site", "web application", "web app"],
  ["ซอฟต์แวร์", "ซอฟแวร์", "software"],
  ["แอปพลิเคชัน", "แอพพลิเคชั่น", "แอป", "application", "mobile app"],
  ["ฐานข้อมูล", "database"],
  ["คลาวด์", "cloud"],
  ["ปัญญาประดิษฐ์", "ai", "artificial intelligence"],
  ["ความมั่นคงปลอดภัยไซเบอร์", "ความปลอดภัยไซเบอร์", "cybersecurity", "cyber security"],
  ["เครือข่าย", "network"],
  ["บำรุงรักษา", "maintenance"],
  ["กรุงเทพมหานคร", "กทม", "กทม.", "bangkok"],
];

export const MAX_SEARCH_LENGTH = 200;
export const MAX_SEARCH_TERMS = 12;

export function searchTerms(query: string): string[] {
  // Quotes preserve phrases; whitespace separates keywords. Never run user regex.
  return [...new Set((query.normalize("NFC").match(/"[^"]+"|[^\s"]+/gu) ?? [])
    .map((term) => term.replace(/^"|"$/g, "").trim().toLowerCase())
    .filter(Boolean))];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildTorSearchFilter(query: string): Record<string, unknown> {
  if (query.length > MAX_SEARCH_LENGTH) throw new Error(`คำค้นหายาวได้ไม่เกิน ${MAX_SEARCH_LENGTH} ตัวอักษร`);
  const terms = searchTerms(query);
  if (terms.length > MAX_SEARCH_TERMS) throw new Error(`ค้นหาได้ไม่เกิน ${MAX_SEARCH_TERMS} คำต่อครั้ง`);
  if (!terms.length) return {};
  const phrases = new Set([...query.normalize("NFC").matchAll(/"([^"]+)"/gu)]
    .map((match) => match[1].trim().toLowerCase()));

  return {
    $and: terms.map((term) => {
      const aliases = phrases.has(term) ? [term] : SYNONYMS.find((group) => group.includes(term)) ?? [term];
      const pattern = aliases.map((alias) => {
        const literal = escapeRegex(alias);
        // Short English terms such as AI must not match "maintenance".
        return /^[a-z]+$/i.test(alias) && alias.length <= 3
          ? `\\b${literal}\\b` : literal;
      }).join("|");
      return { $or: SEARCH_FIELDS.map((field) => ({ [field]: { $regex: pattern, $options: "i" } })) };
    }),
  };
}
