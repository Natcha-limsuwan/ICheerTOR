import { connectDB } from "../../db/connection";
import User from "../../db/models/user";
import VendorProfile from "../../db/models/vendor-profile";
import Bookmark from "../../db/models/bookmark";
import Notification from "../../db/models/notification";
import UserCorrection from "../../db/models/user-correction";
import ConsentRecord from "../../db/models/consent-record";

/**
 * PDPA data exporter — aggregates all personal data for a user.
 */
export async function exportUserData(userId: string) {
  await connectDB();

  const [user, profile, bookmarks, corrections, consentRecords, notifications] = await Promise.all([
    User.findById(userId).select("-__v").lean(),
    VendorProfile.findOne({ userId }).select("-__v").lean(),
    Bookmark.find({ userId }).populate("torRecordId", "title agencyName").lean(),
    UserCorrection.find({ userId }).lean(),
    ConsentRecord.find({ userId }).sort({ createdAt: -1 }).lean(),
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);

  return {
    exportDate: new Date().toISOString(),
    user: user ? { ...user, googleId: "[REDACTED]" } : null,
    vendorProfile: profile,
    bookmarks,
    corrections,
    consentRecords,
    notifications,
  };
}
