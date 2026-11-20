import { Types } from "mongoose";
import { connectDB } from "../../db/connection.js";
import { INotification } from "../../db/models/notification.js";
import User from "../../db/models/user.js";
import { sendNotificationEmail } from "./email-sender.js";
import { processingAllowed } from "../pdpa/processing-permission.js";
import { createNotificationOnce, deliverEmailOnce } from "./delivery.js";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface CreateNotificationInput {
  userId: string | Types.ObjectId;
  torRecordId?: string | Types.ObjectId;
  type: INotification["type"];
  title: string;
  body: string;
  linkUrl?: string;
  /** If true, creates the in-app notification without sending the generic email (e.g. when caller sends a custom rich email
   * through deliverEmailOnce). The email is still marked pending when the user has email enabled. */
  skipEmail?: boolean;
  /** One logical event per user; a repeated or concurrent dispatch with the same key creates nothing new. */
  dedupeKey?: string;
}

export interface DispatchResult {
  notificationId: string;
  /** True when a notification with the same dedupeKey already existed. */
  duplicate: boolean;
  channels: {
    inApp: boolean;
    email: { sent: boolean; error?: string };
  };
}

/* ─── Dispatcher ────────────────────────────────────────────────────── */

/**
 * Create a notification and dispatch to all channels the user has enabled.
 *
 * 1. Look up user prefs
 * 2. Create Notification doc with inApp = true (always)
 * 3. If email pref is on → send email, update doc
 */
export async function dispatchNotification(
  input: CreateNotificationInput,
  deliverEmail: typeof sendNotificationEmail = sendNotificationEmail,
): Promise<DispatchResult> {
  await connectDB();

  // 1. Fetch user + prefs
  const user = await User.findById(input.userId).lean();
  if (!user || user.status !== "active" || user.deletedAt || !(await processingAllowed(user._id.toString()))) {
    throw new Error(`User not found: ${input.userId}`);
  }

  const prefs = user.notificationPrefs ?? { inApp: true, email: false };

  // 2. Create notification record once per dedupeKey (inApp is always recorded)
  const { id: notificationId, created } = await createNotificationOnce({
    userId: input.userId,
    torRecordId: input.torRecordId,
    type: input.type,
    title: input.title,
    body: input.body,
    linkUrl: input.linkUrl,
    dedupeKey: input.dedupeKey,
    channels: {
      inApp: { sent: prefs.inApp === true },
      email: { sent: false, ...(prefs.email ? { state: "pending" as const } : {}) },
    },
  });

  const result: DispatchResult = {
    notificationId,
    duplicate: !created,
    channels: {
      inApp: prefs.inApp === true,
      email: { sent: false },
    },
  };

  // 3. Email channel: claimed atomically, so a retry sends only a failed delivery, never a sent or in-flight one.
  if (prefs.email && !input.skipEmail) {
    const delivery = await deliverEmailOnce(notificationId, user._id, () =>
      deliverEmail(user.email, {
        type: input.type,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
      }),
    );
    if (delivery.status !== "skipped") {
      result.channels.email = { sent: delivery.result.success, error: delivery.result.error };
    }
  }

  console.log(
    `[DISPATCH] Notification ${notificationId}${created ? "" : " (duplicate)"} → inApp: ✅ | email: ${
      prefs.email ? (result.channels.email.sent ? "✅" : "❌") : "⏭️ disabled"
    }`,
  );

  return result;
}
