import { Types } from "mongoose";
import { connectDB } from "../../db/connection.js";
import Notification, { INotification } from "../../db/models/notification.js";
import User from "../../db/models/user.js";
import { sendNotificationEmail } from "./email-sender.js";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface CreateNotificationInput {
  userId: string | Types.ObjectId;
  torRecordId?: string | Types.ObjectId;
  type: INotification["type"];
  title: string;
  body: string;
  linkUrl?: string;
}

export interface DispatchResult {
  notificationId: string;
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
): Promise<DispatchResult> {
  await connectDB();

  // 1. Fetch user + prefs
  const user = await User.findById(input.userId).lean();
  if (!user) {
    throw new Error(`User not found: ${input.userId}`);
  }

  const prefs = user.notificationPrefs ?? { inApp: true, email: false };

  // 2. Create notification record (inApp is always sent)
  const notification = await Notification.create({
    userId: input.userId,
    torRecordId: input.torRecordId,
    type: input.type,
    title: input.title,
    body: input.body,
    linkUrl: input.linkUrl,
    channels: {
      inApp: { sent: true },
      email: { sent: false },
    },
  });

  const result: DispatchResult = {
    notificationId: notification._id.toString(),
    channels: {
      inApp: true,
      email: { sent: false },
    },
  };

  // 3. Email channel
  if (prefs.email) {
    const emailResult = await sendNotificationEmail(user.email, {
      type: input.type,
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl,
    });

    // Update the notification doc with email status
    await Notification.findByIdAndUpdate(notification._id, {
      $set: {
        "channels.email.sent": emailResult.success,
        "channels.email.sentAt": emailResult.success ? new Date() : undefined,
        "channels.email.error": emailResult.error,
      },
    });

    result.channels.email = {
      sent: emailResult.success,
      error: emailResult.error,
    };
  }

  console.log(
    `[DISPATCH] Notification ${notification._id} → inApp: ✅ | email: ${
      prefs.email ? (result.channels.email.sent ? "✅" : "❌") : "⏭️ disabled"
    }`,
  );

  return result;
}
