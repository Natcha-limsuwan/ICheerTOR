/** Exact-payload review gate. Regex scrubbing is defense in depth, not OCR.
 * No PDF/image or arbitrary free text is sent externally without an approval
 * for its exact SHA-256. Reviewed/redacted PDFs must replace originals locally.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Part } from "@google/genai";
import { env } from "../../config/env.js";

export class PrivacyReviewRequiredError extends Error {
  constructor() { super("AI payload requires local privacy review of the exact PDF and text before sending"); this.name = "PrivacyReviewRequiredError"; }
}
export function redactPersonalText(text: string): string {
  const digits = text.replace(/[๐-๙]/g, value => String(value.charCodeAt(0) - 0x0e50));
  return digits
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?<!\d)\d(?:[ -]?\d){12}(?!\d)/g, "[REDACTED_ID]")
    .replace(/(?<!\d)(?:\+66[ -]?[1-9]|0[1-9])(?:[ -]?\d){7,8}(?!\d)/g, "[REDACTED_PHONE]")
    .replace(/(^|[\s(])(?:นาย(?!จ้าง|ทะเบียน|หน้า)|นางสาว|นาง|น\.ส\.)\s*[ก-๙]+(?:[ \t]+[ก-๙]+){0,2}/g, "$1[REDACTED_NAME]")
    .replace(/\b(?:Mr|Mrs|Ms|Miss)\.?[ \t]+[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){1,2}\b/g, "[REDACTED_NAME]");
}
export function redactPersonalValues<T>(value: T): T {
  if (typeof value === "string") return redactPersonalText(value) as T;
  if (Array.isArray(value)) return value.map(redactPersonalValues) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactPersonalValues(entry)])) as T;
  }
  return value;
}
export function payloadFingerprint(part: Part) {
  if (part.inlineData?.mimeType === "application/pdf" && typeof part.inlineData.data === "string") {
    const bytes = Buffer.from(part.inlineData.data, "base64");
    return { kind: "pdf", sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  }
  if (typeof part.text === "string") {
    const bytes = Buffer.from(part.text, "utf8");
    return { kind: "text", sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  }
  throw new PrivacyReviewRequiredError();
}
export function reviewedPayload(parts: Part[]): Part[] {
  let manifest: { version?: number; approvals?: unknown[] };
  try {
    if (!env.AI_PRIVACY_REVIEW_MANIFEST || statSync(env.AI_PRIVACY_REVIEW_MANIFEST).size > 1_000_000) throw new Error();
    manifest = JSON.parse(readFileSync(env.AI_PRIVACY_REVIEW_MANIFEST, "utf8"));
    if (manifest.version !== 1 || !Array.isArray(manifest.approvals)) throw new Error();
  } catch { throw new PrivacyReviewRequiredError(); }
  if (!parts.length) throw new PrivacyReviewRequiredError();
  return parts.map(part => {
    const { kind, sha256 } = payloadFingerprint(part);
    const approved: any = manifest.approvals!.find((entry: any) => {
      const at = typeof entry?.reviewedAt === "string" ? Date.parse(entry.reviewedAt) : NaN;
      return entry?.kind === kind && (entry.sourceSha256 ?? entry.sha256) === sha256 && entry.piiRemoved === true
        && Number.isFinite(at) && at <= Date.now() && Date.now() - at <= 30 * 24 * 60 * 60_000;
    });
    if (!approved) throw new PrivacyReviewRequiredError();
    let reviewed = part;
    if (approved.filePath) {
      try {
        if (typeof approved.filePath !== "string" || !path.isAbsolute(approved.filePath)
          || statSync(approved.filePath).size > 80 * 1024 * 1024) throw new Error();
        const bytes = readFileSync(approved.filePath);
        reviewed = kind === "pdf"
          ? { inlineData: { mimeType: "application/pdf", data: bytes.toString("base64") } }
          : { text: redactPersonalText(bytes.toString("utf8")) };
      } catch { throw new PrivacyReviewRequiredError(); }
    }
    if (payloadFingerprint(reviewed).sha256 !== approved.sha256) throw new PrivacyReviewRequiredError();
    return reviewed;
  });
}
export function assertPayloadReviewed(parts: Part[]): void {
  reviewedPayload(parts);
}
/** Export locally for human inspection. This never approves or calls an API. */
export function writePayloadReview(parts: Part[], directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const approvals = parts.map((part, index) => {
    const { kind, sha256, bytes } = payloadFingerprint(part);
    const fileName = `part-${index + 1}.${kind === "pdf" ? "pdf" : "txt"}`;
    writeFileSync(path.join(directory, fileName), bytes, { mode: 0o600, flag: "wx" });
    return { kind, sourceSha256: sha256, sha256, piiRemoved: false, reviewedAt: null, filePath: path.resolve(directory, fileName) };
  });
  writeFileSync(path.join(directory, "review.json"), JSON.stringify({ version: 1, approvals }, null, 2), { mode: 0o600, flag: "wx" });
}
