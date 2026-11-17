import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import Notification from "../db/models/notification.js";
import User from "../db/models/user.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate, requireScope } from "../middleware/auth.js";
import { objectIdParam, validate } from "../middleware/validate.js";
import { notificationListQuery, notificationPrefsBody } from "../validation/schemas.js";

const router = Router();
router.use(authenticate, requireScope("notifications:own"));
router.param("id", objectIdParam);

// Every query is scoped to the session's userId (object-level access control, threat T07).

/** GET /api/notifications/prefs — Get current user's notification preferences. */
router.get("/prefs", async (req: Request, res: Response) => {
  await connectDB();
  const user = await User.findById(req.user!.id).select("notificationPrefs").lean();
  apiSuccess(res, user?.notificationPrefs ?? { inApp: true, email: false });
});

/** GET /api/notifications/unread-count — Get count of unread notifications. */
router.get("/unread-count", async (req: Request, res: Response) => {
  await connectDB();
  const unreadCount = await Notification.countDocuments({
    userId: req.user!.id,
    "channels.inApp.readAt": { $exists: false },
  });
  apiSuccess(res, { unreadCount });
});

/** GET /api/notifications — List current user's notifications. */
router.get("/", validate({ query: notificationListQuery }), async (req: Request, res: Response) => {
  await connectDB();

  const unreadOnly = req.query.unreadOnly === "true";
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? "20", 10));

  const filter: Record<string, unknown> = { userId: req.user!.id };
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

  apiSuccess(res, notifications, { total, page, limit });
});

/**
 * PUT /api/notifications — Update notification channel preferences.
 * Body: { inApp?: boolean, email?: boolean }. Only these two fields can be
 * written; previously the whole request body was $set (mass assignment).
 */
router.put("/", validate({ body: notificationPrefsBody }), async (req: Request, res: Response) => {
  await connectDB();
  const { inApp, email } = req.body as { inApp?: boolean; email?: boolean };

  const set: Record<string, boolean> = {};
  if (inApp !== undefined) set["notificationPrefs.inApp"] = inApp;
  if (email !== undefined) set["notificationPrefs.email"] = email;

  const user = await User.findByIdAndUpdate(req.user!.id, { $set: set }, { returnDocument: "after" })
    .select("notificationPrefs")
    .lean();

  apiSuccess(res, user?.notificationPrefs);
});

/** PATCH /api/notifications/read-all — Mark all notifications as read. */
router.patch("/read-all", async (req: Request, res: Response) => {
  await connectDB();

  await Notification.updateMany(
    { userId: req.user!.id, "channels.inApp.readAt": { $exists: false } },
    { $set: { "channels.inApp.readAt": new Date() } },
  );

  apiSuccess(res, { success: true });
});

/** PATCH /api/notifications/:id/read — Mark single notification as read. */
router.patch("/:id/read", async (req: Request, res: Response) => {
  await connectDB();

  // Ownership check and update are one atomic operation (no TOCTOU, ASVS V15.4.2).
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.id },
    { $set: { "channels.inApp.readAt": new Date() } },
    { returnDocument: "after" },
  );

  if (!notification) {
    Errors.notFound(res, "Notification not found");
    return;
  }

  apiSuccess(res, notification);
});

export default router;
