import { connectDB } from "../../db/connection";
import User from "../../db/models/user";
import VendorProfile from "../../db/models/vendor-profile";
import Bookmark from "../../db/models/bookmark";
import Notification from "../../db/models/notification";
import UserCorrection from "../../db/models/user-correction";
import ConsentRecord from "../../db/models/consent-record";
import AdminActionLog from "../../db/models/admin-action-log";

/**
 * PDPA data exporter — aggregates all personal data for a user.
 */
export async function exportUserData(userId: string) {
  await connectDB();

  const [user, profile, bookmarks, corrections, consentRecords, notifications, adminActionLogs] =
    await Promise.all([
      User.findById(userId).select("-__v").lean(),
      VendorProfile.findOne({ userId }).select("-__v").lean(),
      Bookmark.find({ userId }).populate("torRecordId", "title agencyName").select("-__v").lean(),
      UserCorrection.find({ userId }).select("-__v").lean(),
      ConsentRecord.find({ userId }).sort({ createdAt: -1 }).select("-__v").lean(),
      Notification.find({ userId }).sort({ createdAt: -1 }).select("-__v").lean(),
      AdminActionLog.find({ targetUserId: userId })
        .sort({ createdAt: -1 })
        .select("-__v -adminUserId")
        .lean(),
    ]);

  return {
    exportDate: new Date().toISOString(),
    user: user ? { ...user, googleId: "[REDACTED]" } : null,
    vendorProfile: profile,
    bookmarks,
    corrections,
    consentRecords,
    notifications,
    adminActionLogs,
  };
}
