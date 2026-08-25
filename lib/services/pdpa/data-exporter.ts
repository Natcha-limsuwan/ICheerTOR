import { connectDB } from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import VendorProfile from "@/lib/db/models/vendor-profile";
import Bookmark from "@/lib/db/models/bookmark";
import Notification from "@/lib/db/models/notification";
import UserCorrection from "@/lib/db/models/user-correction";
import ConsentRecord from "@/lib/db/models/consent-record";

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
