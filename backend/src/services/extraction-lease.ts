import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession, type UpdateQuery } from "mongoose";
import TORRecord, { type ITORRecord } from "../db/models/tor-record.js";

export class LeaseLostError extends Error { constructor() { super("Extraction lease expired or replaced; refusing stale write"); } }

export async function claimExtraction(id: string, status: ITORRecord["extractionStatus"], leaseMs: number, force = false): Promise<string | null> {
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error("Invalid extraction lease duration");
  const owner = randomUUID();
  const now = new Date();
  const result = await TORRecord.updateOne({
    _id: id, extractionStatus: status,
    ...(force ? {} : { $or: [{ "extraction.lockedUntil": null }, { "extraction.lockedUntil": { $lt: now } }] }),
  }, { $set: { extractionStatus: "processing", "extraction.lockOwner": owner, "extraction.lockedUntil": new Date(now.getTime() + leaseMs) } });
  return result.modifiedCount === 1 ? owner : null;
}

export async function updateOwnedExtraction(id: string, owner: string, update: UpdateQuery<ITORRecord>, session?: ClientSession): Promise<void> {
  if (!owner) throw new LeaseLostError();
  const result = await TORRecord.updateOne({
    _id: id, extractionStatus: "processing", "extraction.lockOwner": owner,
    "extraction.lockedUntil": { $gt: new Date() },
  }, update, { session });
  if (result.matchedCount !== 1) throw new LeaseLostError();
}

export const OUTDATED_REVIEW_NOTE = "AI อ่าน TOR ใหม่หลังการตรวจ — ค่าที่แก้ไว้ถูกเขียนทับ ดูประวัติใน usercorrections";

/* Save new AI content and invalidate the previous review in one transaction.
 * Losing the lease rolls back both writes, so new content cannot keep an old
 * verified status after a partial update. */
export async function commitOwnedExtraction(id: string, owner: string, update: UpdateQuery<ITORRecord>): Promise<void> {
  await mongoose.connection.transaction(async (session) => {
    await TORRecord.updateOne(
      { _id: id, "review.status": "verified" },
      { $set: { "review.status": "outdated", "review.note": OUTDATED_REVIEW_NOTE } },
      { session },
    );
    await updateOwnedExtraction(id, owner, update, session);
  });
}

