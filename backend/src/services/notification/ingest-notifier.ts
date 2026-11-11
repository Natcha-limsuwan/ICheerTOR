import { Types } from "mongoose";
import { connectDB } from "../../db/connection.js";
import TORRecord from "../../db/models/tor-record.js";
import User from "../../db/models/user.js";
import Notification from "../../db/models/notification.js";
import { sendNewTorIngestedEmail, NewTorItem } from "./email-sender.js";

export interface IngestNotifyOptions {
  /** Label shown in email header, e.g. "BMA e-GP2" or "CGD e-GP RSS" */
  sourceLabel?: string;
  /**
   * When true (default), sends email to all active users regardless of
   * notificationPrefs.email. Set false to only email users with email: true.
   */
  sendToAllUsers?: boolean;
  /** When true, logs what would be sent without creating notifications or sending emails. */
  dryRun?: boolean;
}

export interface IngestNotifyResult {
  newTorsCount: number;
  usersTargeted: number;
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
}

/**
 * Notify all active users (in-app + email) when new TOR records have been added
 * during an ingestion run.
 */
export async function notifyUsersOfNewTors(
  torIds: Array<string | Types.ObjectId>,
  options: IngestNotifyOptions = {},
): Promise<IngestNotifyResult> {
  const { sourceLabel, sendToAllUsers = true, dryRun = false } = options;

  if (!torIds.length) {
    return {
      newTorsCount: 0,
      usersTargeted: 0,
      notificationsCreated: 0,
      emailsSent: 0,
      emailsFailed: 0,
    };
  }

  await connectDB();

  const records = await TORRecord.find({ _id: { $in: torIds } })
    .select("_id title agencyName phase budget medianPrice")
    .sort({ postingDate: -1, createdAt: -1 })
    .lean();

  if (!records.length) {
    return {
      newTorsCount: 0,
      usersTargeted: 0,
      notificationsCreated: 0,
      emailsSent: 0,
      emailsFailed: 0,
    };
  }

  const items: NewTorItem[] = records.map((r) => ({
    id: r._id.toString(),
    title: r.title,
    agencyName: r.agencyName,
    phase: r.phase,
    budget: r.budget ?? null,
    medianPrice: r.medianPrice ?? null,
  }));

  const users = await User.find({
    status: "active",
    deletedAt: { $exists: false },
  })
    .select("_id email name notificationPrefs")
    .lean();

  if (!users.length) {
    console.log("[notify] ไม่พบผู้ใช้งานที่ active ในระบบ");
    return {
      newTorsCount: items.length,
      usersTargeted: 0,
      notificationsCreated: 0,
      emailsSent: 0,
      emailsFailed: 0,
    };
  }

  const firstItem = items[0]!;
  const notifTitle =
    items.length === 1
      ? `🆕 โครงการ TOR ใหม่: ${firstItem.title.slice(0, 80)}`
      : `🆕 มีโครงการ TOR ใหม่เพิ่มเข้าสู่ระบบ ${items.length} โครงการ`;

  const previewTitles = items
    .slice(0, 3)
    .map((t) => `• ${t.title} (${t.agencyName})`)
    .join("\n");
  const notifBody =
    items.length > 3
      ? `${previewTitles}\n...และอีก ${items.length - 3} โครงการ`
      : previewTitles;

  const linkUrl = items.length === 1 ? `/procurement/${firstItem.id}` : "/procurement";
  const singleTorObjectId = items.length === 1 ? new Types.ObjectId(firstItem.id) : undefined;

  if (dryRun) {
    console.log(
      `[notify] DRY-RUN: จะส่งแจ้งเตือน TOR ใหม่ ${items.length} รายการ ไปยังผู้ใช้ ${users.length} คน`,
    );
    return {
      newTorsCount: items.length,
      usersTargeted: users.length,
      notificationsCreated: 0,
      emailsSent: 0,
      emailsFailed: 0,
    };
  }

  let notificationsCreated = 0;
  let emailsSent = 0;
  let emailsFailed = 0;

  console.log(
    `[notify] กำลังส่งแจ้งเตือน TOR ใหม่ (${items.length} โครงการ) ให้ผู้ใช้ ${users.length} คน...`,
  );

  for (const user of users) {
    const shouldSendEmail = sendToAllUsers || Boolean(user.notificationPrefs?.email);

    const notification = await Notification.create({
      userId: user._id,
      ...(singleTorObjectId ? { torRecordId: singleTorObjectId } : {}),
      type: "system",
      title: notifTitle,
      body: notifBody,
      linkUrl,
      channels: {
        inApp: { sent: true },
        email: { sent: false },
      },
    });
    notificationsCreated++;

    if (shouldSendEmail && user.email) {
      const emailRes = await sendNewTorIngestedEmail({
        to: user.email,
        recipientName: user.name,
        sourceLabel,
        totalNewCount: items.length,
        items,
      });

      await Notification.findByIdAndUpdate(notification._id, {
        $set: {
          "channels.email.sent": emailRes.success,
          "channels.email.sentAt": emailRes.success ? new Date() : undefined,
          "channels.email.error": emailRes.error,
        },
      });

      if (emailRes.success) {
        emailsSent++;
      } else {
        emailsFailed++;
      }
    }
  }

  console.log(
    `[notify] เสร็จสิ้น — แจ้งเตือนในระบบ ${notificationsCreated} | ส่งอีเมลสำเร็จ ${emailsSent}/${users.length}` +
      (emailsFailed ? ` (ล้มเหลว ${emailsFailed})` : ""),
  );

  return {
    newTorsCount: items.length,
    usersTargeted: users.length,
    notificationsCreated,
    emailsSent,
    emailsFailed,
  };
}

