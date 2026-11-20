import { createHash } from "node:crypto";
import type { Types } from "mongoose";
import Notification, { type INotification } from "../../db/models/notification.js";
import User from "../../db/models/user.js";
import { processingAllowed } from "../pdpa/processing-permission.js";
import type { EmailResult } from "./email-sender.js";

/**
 * Duplicate-delivery controls for notifications (threat T25).
 *
 * - One notification per (user, dedupeKey): a unique index turns a concurrent
 *   or repeated run into a no-op instead of a second message.
 * - The email is claimed atomically (pending/failed → sending) before SMTP is
 *   called, so two workers cannot both send it.
 * - A claim left in "sending" (worker died, or SMTP accepted the message but
 *   no acknowledgement was recorded) is never resent automatically. This
 *   prefers a possibly missed email to a duplicate; it is not exactly-once.
 */

export const MAX_EMAIL_ATTEMPTS = 3;

type Id = string | Types.ObjectId;

/** Stable key for one batch of records, independent of their order. */
export function batchDedupeKey(prefix: string, ids: Id[]): string {
  const sorted = ids.map(String).sort();
  return `${prefix}:${createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 32)}`;
}

export type NewNotification = Pick<INotification, "type" | "title" | "body"> & {
  userId: Id;
  torRecordId?: Id;
  linkUrl?: string;
  dedupeKey?: string;
  channels: { inApp: { sent: boolean }; email: { sent: boolean; state?: "pending" } };
};

/** Create the notification, or return the existing one for the same user and dedupeKey. */
export async function createNotificationOnce(doc: NewNotification): Promise<{ id: string; created: boolean }> {
  try {
    const created = await Notification.create(doc);
    return { id: created._id.toString(), created: true };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000 || !doc.dedupeKey) throw error;
    const existing = await Notification.findOne({ userId: doc.userId, dedupeKey: doc.dedupeKey }).select("_id").lean();
    if (!existing) throw error;
    return { id: existing._id.toString(), created: false };
  }
}

/** Current account state, re-read at send time so a retry honours a later opt-out or withdrawal. */
export async function emailStillAllowed(userId: Id): Promise<boolean> {
  const user = await User.findById(userId).select("status deletedAt notificationPrefs").lean();
  if (!user || user.status !== "active" || user.deletedAt || user.notificationPrefs?.email !== true) return false;
  return processingAllowed(String(userId));
}

export type EmailDeliveryOutcome =
  | { status: "sent" | "failed"; result: EmailResult }
  | { status: "skipped"; reason: "not_claimable" | "not_allowed" };

/**
 * Send the email for one notification at most once per successful claim.
 * Only "pending" or "failed" deliveries below the attempt cap can be claimed.
 */
export async function deliverEmailOnce(
  notificationId: Id,
  userId: Id,
  send: () => Promise<EmailResult>,
): Promise<EmailDeliveryOutcome> {
  const claim = await Notification.updateOne(
    {
      _id: notificationId,
      "channels.email.sent": { $ne: true },
      "channels.email.state": { $in: ["pending", "failed"] },
      $or: [{ "channels.email.attempts": { $exists: false } }, { "channels.email.attempts": { $lt: MAX_EMAIL_ATTEMPTS } }],
    },
    { $set: { "channels.email.state": "sending", "channels.email.claimedAt": new Date() }, $inc: { "channels.email.attempts": 1 } },
  );
  if (claim.modifiedCount !== 1) return { status: "skipped", reason: "not_claimable" };

  if (!(await emailStillAllowed(userId))) {
    await Notification.updateOne(
      { _id: notificationId, "channels.email.state": "sending" },
      { $set: { "channels.email.state": "pending" }, $unset: { "channels.email.claimedAt": 1 }, $inc: { "channels.email.attempts": -1 } },
    );
    return { status: "skipped", reason: "not_allowed" };
  }

  let result: EmailResult;
  try {
    result = await send();
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : String(error) };
  }
  await Notification.updateOne(
    { _id: notificationId, "channels.email.state": "sending" },
    result.success
      ? { $set: { "channels.email.sent": true, "channels.email.state": "sent", "channels.email.sentAt": new Date() }, $unset: { "channels.email.error": 1 } }
      : { $set: { "channels.email.sent": false, "channels.email.state": "failed", "channels.email.error": result.error ?? "unknown" } },
  );
  return { status: result.success ? "sent" : "failed", result };
}
