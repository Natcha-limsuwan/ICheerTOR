import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { connectDB } from "../db/connection.js";
import User from "../db/models/user.js";
import AdminActionLog from "../db/models/admin-action-log.js";
import TORRecord from "../db/models/tor-record.js";
import { collectPipelineHealth } from "../services/pipeline-health.js";
import {
  applyChanges,
  EDITABLE_FIELDS,
  needsReviewFilter,
  parseChanges,
  ReviewConflictError,
  ReviewInputError,
  uncertainItems,
} from "../services/tor-review.js";
import { env } from "../config/env.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate, requireRecentAuth, requireRole, requireScope } from "../middleware/auth.js";
import { revokeUserSessions } from "../auth/session-service.js";
import { canManageAccount } from "../auth/permissions.js";
import { objectIdParam, validate } from "../middleware/validate.js";
import {
  adminLogsQuery,
  adminRoleBody,
  adminUserActionBody,
  adminUsersQuery,
  paginationQuery,
  torCheckResolveBody,
  torReviewBody,
  torReviewQuery,
} from "../validation/schemas.js";
import { escapeRegex } from "../services/search/tor-search.js";
import { logSecurityEvent } from "../utils/security-log.js";
import type { UserRole } from "../types.js";

const router = Router();

// Defence in depth: a coarse role gate for the whole admin API, then a
// specific scope on every route (auth/permissions.ts).
router.use(authenticate);
router.use(requireRole("admin", "developer"));
router.param("id", objectIdParam);

/* Fields an admin needs about an account; googleId and preferences are never returned (T19). */
const ADMIN_USER_FIELDS = "name email avatarUrl role status isVerified lastLoginAt createdAt deletedAt";

/* GET /api/admin/users — List all users. */
router.get("/users", requireScope("users:read"), validate({ query: adminUsersQuery }), 
  async (req: Request, res: Response) => {
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
    // Escaped: the search is a literal substring match, not a user-supplied regex (T12).
    const pattern = escapeRegex(q);
    filter.$or = [
      { name: { $regex: pattern, $options: "i" } },
      { email: { $regex: pattern, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(ADMIN_USER_FIELDS)
      .lean(),
    User.countDocuments(filter),
  ]);

  apiSuccess(res, users, { total, page, limit });
});

/* PATCH /api/admin/users/:id — Perform admin action on a user. */
router.patch(
  "/users/:id",
  requireScope("users:manage"),
  requireRecentAuth(30),
  validate({ body: adminUserActionBody }),
  async (req: Request, res: Response) => {
  await connectDB();

  const id = req.params.id as string;
  const { action, reason } = req.body as {
    action: "approve" | "verify" | "suspend" | "ban" | "reinstate";
    reason?: string;
  };

  const user = await User.findById(id);
  if (!user) {
    Errors.notFound(res, "User not found");
    return;
  }

  // Admins manage regular users only; developers also manage admins; nobody acts on themselves.
  if (!canManageAccount({ id: req.user!.id, role: req.user!.role }, { id, role: user.role as UserRole })) {
    logSecurityEvent(
      "authz_denied",
      { userId: req.user!.id, role: req.user!.role, reason: "account_hierarchy", targetUserId: id, targetRole: user.role },
      "warn",
    );
    Errors.forbidden(res, "You cannot manage this account");
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
  await mongoose.connection.transaction(async (session) => {
    const changed = await User.updateOne(
      { _id: user._id, role: user.role, status: previousStatus, updatedAt: user.updatedAt },
      { $set: { status: newStatus, isVerified: user.isVerified } }, { session, runValidators: true },
    );
    if (changed.matchedCount !== 1) throw Object.assign(new Error("Account changed; retry"), { status: 409 });
    if (newStatus === "suspended" || newStatus === "banned") {
      await revokeUserSessions(user._id.toString(), `admin_${action}`, session);
    }
    await AdminActionLog.create([{
    adminUserId: req.user!.id as string,
    targetUserId: id as string,
    action,
    reason,
    previousStatus,
    newStatus,
    }], { session });
  });
  logSecurityEvent("admin_account_action", { userId: req.user!.id, targetUserId: id, action, previousStatus, newStatus });

  apiSuccess(res, await User.findById(id).select(ADMIN_USER_FIELDS).lean());
  },
);

/* PATCH /api/admin/users/:id/role — Change a user's role. */
router.patch(
  "/users/:id/role",
  // README policy: only developers change roles. Sensitive, so it needs a recent sign-in (T19).
  requireScope("roles:manage"),
  requireRecentAuth(30),
  validate({ body: adminRoleBody }),
  async (req: Request, res: Response) => {
  await connectDB();

  const id = req.params.id as string;
  const { role, reason } = req.body as { role: UserRole; reason?: string };

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
  await mongoose.connection.transaction(async (session) => {
    const changed = await User.updateOne(
      { _id: user._id, role: previousRole, updatedAt: user.updatedAt },
      { $set: { role, roleAssignedBy: user.roleAssignedBy, roleAssignedAt: user.roleAssignedAt } },
      { session, runValidators: true },
    );
    if (changed.matchedCount !== 1) throw Object.assign(new Error("Account changed; retry"), { status: 409 });
    await AdminActionLog.create([{
    adminUserId: req.user!.id as string,
    targetUserId: id as string,
    action: "change_role",
    reason: reason || undefined,
    previousStatus: user.status,
    newStatus: user.status,
    previousRole,
    newRole: role,
    }], { session });
  });
  logSecurityEvent("admin_role_change", { userId: req.user!.id, targetUserId: id, previousRole, newRole: role });

  apiSuccess(res, await User.findById(id).select(ADMIN_USER_FIELDS).lean());
  },
);

/* GET /api/admin/logs — List admin action logs. */
router.get("/logs", requireScope("audit:read"), validate({ query: adminLogsQuery }), async (req: Request, res: Response) => {
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

/* GET /api/admin/pipeline/health — Is ingestion and extraction running?
 * status ok | warning | error, the problems in plain Thai, and the numbers
 * behind them (RSS polls, last egp2 ingest, extraction queue, Vertex 7 days). */
router.get("/pipeline/health", requireScope("pipeline:read"), async (_req: Request, res: Response) => {
  await connectDB();
  try {
    apiSuccess(res, await collectPipelineHealth());
  } catch (error) {
    console.error("Pipeline health error:", error);
    Errors.internal(res, "Failed to collect pipeline health");
  }
});

/* GET /api/admin/tor-review — TORs where the model was unsure and no admin
 * has verified them yet, each with the uncertain fields to check.
 * ?status=pending (default) | verified | outdated | all */
router.get("/tor-review", requireScope("tor:review"), validate({ query: torReviewQuery }), async (req: Request, res: Response) => {
  await connectDB();

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? "20", 10));
  const status = (req.query.status as string) ?? "pending";
  const threshold = env.AI_CONFIDENCE_THRESHOLD;
  const filter =
    status === "pending"
      ? needsReviewFilter(threshold)
      : status === "all"
        ? { extractionStatus: "completed" }
        : status === "verified" || status === "outdated"
          ? { "review.status": status }
          : null;
  if (!filter) {
    Errors.badRequest(res, "status must be pending, verified, outdated or all");
    return;
  }

  const [records, total] = await Promise.all([
    TORRecord.find(filter)
      .sort({ "extraction.extractedAt": -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("title agencyName phase submissionDeadline officialPortalUrl metadata.projectId parsedData extraction summary review")
      .lean(),
    TORRecord.countDocuments(filter),
  ]);

  apiSuccess(
    res,
    records.map(({ parsedData: _p, summary: _s, extraction, ...r }) => ({
      ...r,
      extractedAt: extraction?.extractedAt ?? null,
      uncertain: uncertainItems({ parsedData: _p, extraction, summary: _s } as never, threshold),
    })),
    { total, page, limit },
  );
});

/* GET /api/admin/tor-review/:id — The full record to edit, its uncertain
 * fields, and the field names PUT accepts. */
router.get("/tor-review/:id", requireScope("tor:review"), async (req: Request, res: Response) => {
  await connectDB();
  const record = await TORRecord.findById(req.params.id).lean();
  if (!record) {
    Errors.notFound(res, "TOR record not found");
    return;
  }
  apiSuccess(res, {
    record,
    uncertain: uncertainItems(record as never, env.AI_CONFIDENCE_THRESHOLD),
    editableFields: EDITABLE_FIELDS,
  });
});

/* PUT /api/admin/tor-review/:id — Correct fields and mark the record verified.
 * Body: { changes: { <editable field>: value, … }, note?, verify? (default true), dryRun? }
 * Each change is logged to usercorrections; red flags and data checks are
 * recomputed. dryRun validates and returns the result without saving. */
router.put(
  "/tor-review/:id",
  requireScope("tor:review"),
  requireRecentAuth(30),
  validate({ body: torReviewBody }),
  async (req: Request, res: Response) => {
  await connectDB();
  try {
    const changes = parseChanges(req.body?.changes ?? {});
    const result = await applyChanges(req.params.id as string, changes, { id: req.user!.id as string }, {
      note: typeof req.body?.note === "string" ? req.body.note.slice(0, 1000) : null,
      verify: req.body?.verify !== false,
      dryRun: req.body?.dryRun === true,
      expectedUpdatedAt: req.body?.expectedUpdatedAt ?? null,
    });
    if (!result) {
      Errors.notFound(res, "TOR record not found");
      return;
    }
    apiSuccess(res, { ...result, dryRun: req.body?.dryRun === true });
  } catch (error) {
    if (error instanceof ReviewConflictError) {
      Errors.conflict(res, error.message);
      return;
    }
    if (error instanceof ReviewInputError || (error as Error)?.name === "ValidationError") {
      Errors.badRequest(res, (error as Error).message);
      return;
    }
    console.error("TOR review error:", error);
    Errors.internal(res, "Failed to save the review");
  }
  },
);

/* GET /api/admin/tor-checks — Projects whose sources disagree in a way a
 * person should look at (dataChecks.needsCheck), newest first. */
router.get("/tor-checks", requireScope("tor:review"), validate({ query: paginationQuery }), async (req: Request, res: Response) => {
  await connectDB();

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? "20", 10));
  const filter = { "dataChecks.needsCheck": true };

  const [records, total] = await Promise.all([
    TORRecord.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("title agencyName phase budget medianPrice submissionDeadline officialPortalUrl metadata.projectId dataChecks")
      .lean(),
    TORRecord.countDocuments(filter),
  ]);

  apiSuccess(res, records, { total, page, limit });
});

/* PATCH /api/admin/tor-checks/:id — Mark the current conflicts as checked.
 * Only the codes present now are resolved: a new kind of conflict raises
 * needsCheck again on the next daily run. */
router.patch(
  "/tor-checks/:id",
  requireScope("tor:review"),
  validate({ body: torCheckResolveBody }),
  async (req: Request, res: Response) => {
  await connectDB();

  const record = await TORRecord.findById(req.params.id).select("dataChecks").lean();
  if (!record?.dataChecks) {
    Errors.notFound(res, "TOR record or its data checks not found");
    return;
  }

  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 1000) : null;
  const codes = record.dataChecks.conflicts.filter((c) => c.severity === "check").map((c) => c.code);
  const updated = await TORRecord.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        "dataChecks.resolvedCodes": [...new Set([...(record.dataChecks.resolvedCodes ?? []), ...codes])],
        "dataChecks.needsCheck": false,
        "dataChecks.resolvedBy": req.user!.id as string,
        "dataChecks.resolvedAt": new Date(),
        "dataChecks.resolvedNote": note,
      },
    },
    { new: true },
  )
    .select("title dataChecks")
    .lean();

  apiSuccess(res, updated);
  },
);

export default router;
