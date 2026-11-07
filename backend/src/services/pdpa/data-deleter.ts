import User from "../../db/models/user.js";
import VendorProfile from "../../db/models/vendor-profile.js";
import Bookmark from "../../db/models/bookmark.js";
import Notification from "../../db/models/notification.js";
import UserCorrection from "../../db/models/user-correction.js";
import ConsentRecord from "../../db/models/consent-record.js";
import AdminActionLog from "../../db/models/admin-action-log.js";

/** Idempotent cleanup. Keep the blocked account as a durable retry marker until
 * every owned record is removed. Works with standalone MongoDB as well as Atlas. */
export async function purgeUserData(userId: string): Promise<void> {
  const owner = { userId };
  // Wait for every deletion to settle before retrying or removing the marker.
  const results = await Promise.allSettled([
    VendorProfile.deleteOne(owner), Bookmark.deleteMany(owner), Notification.deleteMany(owner),
    UserCorrection.deleteMany(owner), ConsentRecord.deleteMany(owner),
    // Preserve the audit event but remove references and free-text reasons.
    AdminActionLog.updateMany({ adminUserId: userId }, { $set: { adminUserId: null }, $unset: { reason: 1 } }),
    AdminActionLog.updateMany({ targetUserId: userId }, { $set: { targetUserId: null }, $unset: { reason: 1 } }),
    UserCorrection.updateMany({ reviewedBy: userId }, { $unset: { reviewedBy: 1 } }),
    User.updateMany({ roleAssignedBy: userId }, { $unset: { roleAssignedBy: 1 } }),
  ]);
  if (results.some(result => result.status === "rejected")) throw new Error("Personal data cleanup incomplete");
  await User.deleteOne({ _id: userId, deletedAt: { $type: "date" } });
}

let running = false;
export async function retryPendingDeletions(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const pending = await User.find({ deletedAt: { $type: "date" } }).select("_id").limit(20).lean();
    for (const user of pending) {
      try { await purgeUserData(user._id.toString()); }
      catch { console.error("[PDPA] Pending deletion will be retried"); }
    }
  } finally { running = false; }
}

export function startDeletionWorker(): NodeJS.Timeout {
  const run = () => retryPendingDeletions().catch(() => console.error("[PDPA] Deletion worker unavailable"));
  void run();
  const timer = setInterval(run, 60_000);
  timer.unref();
  return timer;
}
