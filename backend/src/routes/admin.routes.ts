import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { connectDB } from "../db/connection.js";
import User from "../db/models/user.js";
import AdminActionLog from "../db/models/admin-action-log.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// All admin routes require authentication + admin/developer role
router.use(authenticate);
router.use(requireRole("admin", "developer"));

/**
 * GET /api/admin/users — List all users.
 */
router.get("/users", async (req: Request, res: Response) => {
  await connectDB();

  const status = req.query.status as string | undefined;
  const role = req.query.role as string | undefined;
  const q = req.query.q as string | undefined;
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? "50", 10));

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

  apiSuccess(res, users, { total, page, limit });
});

/**
 * PATCH /api/admin/users/:id — Perform admin action on a user.
 */
router.patch("/users/:id", async (req: Request, res: Response) => {
  await connectDB();

  const { id } = req.params;
  const { action, reason } = req.body;

  const validActions = ["approve", "verify", "suspend", "ban", "reinstate"];
  if (!validActions.includes(action)) {
    Errors.badRequest(res, `Invalid action: ${action}`);
    return;
  }

  if (action === "ban" && req.user!.role !== "developer" && req.user!.role !== "admin") {
    Errors.forbidden(res, "Only developers and admins can ban users");
    return;
  }

  const user = await User.findById(id);
  if (!user) {
    Errors.notFound(res, "User not found");
    return;
  }

  if (user.role === "developer") {
    Errors.forbidden(res, "Cannot perform actions on a developer account");
    return;
  }

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

  await AdminActionLog.create({
    adminUserId: req.user!.id as string,
    targetUserId: id as string,
    action,
    reason,
    previousStatus,
    newStatus,
  });

  apiSuccess(res, user);
});

/**
 * PATCH /api/admin/users/:id/role — Change a user's role.
 */
router.patch("/users/:id/role", async (req: Request, res: Response) => {
  await connectDB();

  const { id } = req.params;
  const { role, reason } = req.body;

  const allowedRoles = req.user!.role === "developer" ? ["developer", "admin", "user"] : ["admin", "user"];
  if (!allowedRoles.includes(role)) {
    Errors.badRequest(res, `Invalid role: ${role}. Allowed: ${allowedRoles.join(", ")}`);
    return;
  }

  const user = await User.findById(id);
  if (!user) {
    Errors.notFound(res, "User not found");
    return;
  }

  if (user.role === "developer" && req.user!.role !== "developer") {
    Errors.forbidden(res, "Only developers can modify a developer account");
    return;
  }

  if (user._id.toString() === req.user!.id) {
    Errors.forbidden(res, "Cannot change your own role");
    return;
  }

  const previousRole = user.role;
  if (previousRole === role) {
    Errors.badRequest(res, "User already has this role");
    return;
  }

  user.role = role;
  user.roleAssignedBy = new mongoose.Types.ObjectId(req.user!.id);
  user.roleAssignedAt = new Date();
  await user.save();

  await AdminActionLog.create({
    adminUserId: req.user!.id as string,
    targetUserId: id as string,
    action: "change_role",
    reason: reason || undefined,
    previousStatus: user.status,
    newStatus: user.status,
    previousRole,
    newRole: role,
  });

  apiSuccess(res, user);
});

/**
 * GET /api/admin/logs — List admin action logs.
 */
router.get("/logs", async (req: Request, res: Response) => {
  await connectDB();

  const action = req.query.action as string | undefined;
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? "20", 10));

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
          adminUser: doc.adminUserId as unknown as { name: string; email: string } | null,
          targetUser: doc.targetUserId as unknown as { name: string; email: string } | null,
          adminUserId: undefined,
          targetUserId: undefined,
        })),
      ),
    AdminActionLog.countDocuments(filter),
  ]);

  apiSuccess(res, logs, { total, page, limit });
});

export default router;
