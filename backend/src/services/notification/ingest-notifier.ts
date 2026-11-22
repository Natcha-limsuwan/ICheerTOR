import { Types } from "mongoose";
import { connectDB } from "../../db/connection.js";
import TORRecord from "../../db/models/tor-record.js";
import User from "../../db/models/user.js";
import { sendNewTorIngestedEmail, NewTorItem } from "./email-sender.js";
import { processingAllowed } from "../pdpa/processing-permission.js";
import { batchDedupeKey, createNotificationOnce, deliverEmailOnce } from "./delivery.js";

export interface IngestNotifyOptions {
  /* Label shown in email header, e.g. "BMA e-GP2" or "CGD e-GP RSS" */
  sourceLabel?: string;
  /* @deprecated Ignored. New-TOR emails are optional marketing-style messages,
   * so they always follow the user's notificationPrefs.email choice (threat T20). */
  sendToAllUsers?: boolean;
  /* When true, logs what would be sent without creating notifications or sending emails. */
  dryRun?: boolean;
  /* Test seam for a mocked SMTP provider. */
  sendEmail?: typeof sendNewTorIngestedEmail;
}

export interface IngestNotifyResult {
  newTorsCount: number;
  usersTargeted: number;
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  /* Users who already had this batch (repeat or concurrent run): no second message. */
  alreadyNotified?: number;
}

/* Notify all active users (in-app + email) when new TOR records have been added
 * during an ingestion run. */
export async function notifyUsersOfNewTors(
  torIds: Array<string | Types.ObjectId>,
  options: IngestNotifyOptions = {},
): Promise<IngestNotifyResult> {
  const { sourceLabel, dryRun = false, sendEmail = sendNewTorIngestedEmail } = options;

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
  // Same batch → same key, so rerunning a failed or interrupted ingest does not notify twice.
  const dedupeKey = batchDedupeKey("new_tors", items.map((i) => i.id));

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
  let alreadyNotified = 0;

  console.log(
    `[notify] กำลังส่งแจ้งเตือน TOR ใหม่ (${items.length} โครงการ) ให้ผู้ใช้ ${users.length} คน...`,
  );

  for (const user of users) {
    if (!(await processingAllowed(user._id.toString()))) continue;
    if (!user.notificationPrefs?.inApp && !user.notificationPrefs?.email) continue;
    // Checked at send time against the stored preference; no option can override it.
    const shouldSendEmail = user.notificationPrefs?.email === true;

    const { id: notificationId, created } = await createNotificationOnce({
      userId: user._id,
      ...(singleTorObjectId ? { torRecordId: singleTorObjectId } : {}),
      type: "system",
      title: notifTitle,
      body: notifBody,
      linkUrl,
      dedupeKey,
      channels: {
        inApp: { sent: user.notificationPrefs?.inApp === true },
        email: { sent: false, ...(shouldSendEmail && user.email ? { state: "pending" as const } : {}) },
      },
    });
    if (created) notificationsCreated++;
    else alreadyNotified++;

    // A repeated run can only retry a failed delivery; sent and in-flight emails are not claimable.
    if (shouldSendEmail && user.email) {
      const delivery = await deliverEmailOnce(notificationId, user._id, () =>
        sendEmail({
          to: user.email,
          recipientName: user.name,
          sourceLabel,
          totalNewCount: items.length,
          items,
        }),
      );
      if (delivery.status === "sent") emailsSent++;
      else if (delivery.status === "failed") emailsFailed++;
    }
  }

  console.log(
    `[notify] เสร็จสิ้น — แจ้งเตือนในระบบ ${notificationsCreated} | ส่งอีเมลสำเร็จ ${emailsSent}/${users.length}` +
      (emailsFailed ? ` (ล้มเหลว ${emailsFailed})` : "") +
      (alreadyNotified ? ` | เคยแจ้งแล้ว ${alreadyNotified}` : ""),
  );

  return {
    newTorsCount: items.length,
    usersTargeted: users.length,
    notificationsCreated,
    emailsSent,
    emailsFailed,
    alreadyNotified,
  };
}

