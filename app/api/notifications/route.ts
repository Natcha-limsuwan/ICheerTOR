import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import Notification from "@/lib/db/models/notification";
import { apiSuccess } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** GET /api/notifications — List current user's notifications. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  const { searchParams } = request.nextUrl;
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));

  const filter: Record<string, unknown> = { userId: auth.id };
  if (unreadOnly) {
    filter["channels.inApp.readAt"] = { $exists: false };
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
  ]);

  return apiSuccess(notifications, { total, page, limit });
}

/** PUT /api/notifications — Update notification channel preferences. */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();
  const { default: User } = await import("@/lib/db/models/user");

  const body = await request.json();
  const user = await User.findByIdAndUpdate(
    auth.id,
    { $set: { notificationPrefs: body } },
    { new: true },
  );

  return apiSuccess(user?.notificationPrefs);
}
