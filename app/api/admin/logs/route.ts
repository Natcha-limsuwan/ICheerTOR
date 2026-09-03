import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import AdminActionLog from "@/lib/db/models/admin-action-log";
import { apiSuccess } from "@/lib/utils/api-response";
import { requireAdmin, isErrorResponse } from "@/lib/auth/middleware";

/** GET /api/admin/logs — List admin action logs with pagination. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));

  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;

  const [logs, total] = await Promise.all([
    AdminActionLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("adminUserId", "name email")
      .populate("targetUserId", "name email")
      .lean()
      .then((docs) =>
        docs.map((doc) => ({
          ...doc,
          // Flatten populated fields for frontend
          adminUser: doc.adminUserId as unknown as { name: string; email: string } | null,
          targetUser: doc.targetUserId as unknown as { name: string; email: string } | null,
          adminUserId: undefined,
          targetUserId: undefined,
        })),
      ),
    AdminActionLog.countDocuments(filter),
  ]);

  return apiSuccess(logs, { total, page, limit });
}
