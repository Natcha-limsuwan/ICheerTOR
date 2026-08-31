import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import AdminActionLog from "@/lib/db/models/admin-action-log";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAdmin, isErrorResponse } from "@/lib/auth/middleware";

/** PATCH /api/admin/users/[id]/role — Change a user's role. Admin or Developer. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth;

  await connectDB();
  const { id } = await params;

  const body = await request.json();
  const { role, reason } = body;

  const allowedRoles = auth.role === "developer" ? ["developer", "admin", "user"] : ["admin", "user"];
  if (!allowedRoles.includes(role)) {
    return Errors.badRequest(`Invalid role: ${role}. Allowed: ${allowedRoles.join(", ")}`);
  }

  const user = await User.findById(id);
  if (!user) return Errors.notFound("User not found");

  // Only developer can modify a developer account
  if (user.role === "developer" && auth.role !== "developer") {
    return Errors.forbidden("Only developers can modify a developer account");
  }

  // Cannot change own role
  if (user._id.toString() === auth.id) {
    return Errors.forbidden("Cannot change your own role");
  }

  const previousRole = user.role;
  if (previousRole === role) {
    return Errors.badRequest("User already has this role");
  }

  user.role = role;
  user.roleAssignedBy = new mongoose.Types.ObjectId(auth.id);
  user.roleAssignedAt = new Date();
  await user.save();

  // Audit log
  await AdminActionLog.create({
    adminUserId: auth.id,
    targetUserId: id,
    action: "change_role",
    reason: reason || undefined,
    previousStatus: user.status,
    newStatus: user.status,
    previousRole,
    newRole: role,
  });

  return apiSuccess(user);
}
