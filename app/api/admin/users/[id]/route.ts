import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import AdminActionLog from "@/lib/db/models/admin-action-log";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAdmin, isErrorResponse } from "@/lib/auth/middleware";

/** PATCH /api/admin/users/[id] — Perform admin action on a user. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  await connectDB();
  const { id } = await params;

  const body = await request.json();
  const { action, reason } = body;

  const validActions = ["approve", "verify", "suspend", "ban", "reinstate"];
  if (!validActions.includes(action)) {
    return Errors.badRequest(`Invalid action: ${action}`);
  }

  const user = await User.findById(id);
  if (!user) return Errors.notFound("User not found");

  const previousStatus = user.status;
  let newStatus = user.status;

  switch (action) {
    case "approve":
      newStatus = "active";
      break;
    case "verify":
      user.isVerified = true;
      break;
    case "suspend":
      newStatus = "suspended";
      break;
    case "ban":
      newStatus = "banned";
      break;
    case "reinstate":
      newStatus = "active";
      break;
  }

  user.status = newStatus;
  await user.save();

  // Create audit log
  await AdminActionLog.create({
    adminUserId: auth.id,
    targetUserId: id,
    action,
    reason,
    previousStatus,
    newStatus,
  });

  return apiSuccess(user);
}
