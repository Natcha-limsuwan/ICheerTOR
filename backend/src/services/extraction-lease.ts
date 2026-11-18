import { randomUUID } from "node:crypto";
import type { UpdateQuery } from "mongoose";
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

export async function updateOwnedExtraction(id: string, owner: string, update: UpdateQuery<ITORRecord>): Promise<void> {
  if (!owner) throw new LeaseLostError();
  const result = await TORRecord.updateOne({
    _id: id, extractionStatus: "processing", "extraction.lockOwner": owner,
    "extraction.lockedUntil": { $gt: new Date() },
  }, update);
  if (result.matchedCount !== 1) throw new LeaseLostError();
}
