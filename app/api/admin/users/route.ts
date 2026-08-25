import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAdmin, isErrorResponse } from "@/lib/auth/middleware";

/** GET /api/admin/users — List all users. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const role = searchParams.get("role");
  const q = searchParams.get("q");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (role) filter.role = role;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-notificationPrefs")
      .lean(),
    User.countDocuments(filter),
  ]);

  return apiSuccess(users, { total, page, limit });
}
