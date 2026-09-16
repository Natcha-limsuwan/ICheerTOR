import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import Notification from "../db/models/notification.js";
import User from "../db/models/user.js";
import { apiSuccess } from "../utils/api-response.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

/** GET /api/notifications — List current user's notifications. */
router.get("/", async (req: Request, res: Response) => {
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

/** PUT /api/notifications — Update notification channel preferences. */
router.put("/", async (req: Request, res: Response) => {
  await connectDB();

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: { notificationPrefs: req.body } },
    { new: true },
  );

  apiSuccess(res, user?.notificationPrefs);
});

export default router;
