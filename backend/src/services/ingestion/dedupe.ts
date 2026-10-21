import crypto from "crypto";

/**
 * TORRecord.deduplicationHash for an e-GP project number.
 *
 * Every source keys a project by its e-GP number, so the egp2 ingest and the
 * e-GP RSS feed land on the same record. The "egp2:" prefix is historical —
 * records already stored use it, so it stays.
 */
export function torDedupeHash(projectNumber: string): string {
  return crypto.createHash("sha256").update(`egp2:${projectNumber}`).digest("hex").slice(0, 32);
}
