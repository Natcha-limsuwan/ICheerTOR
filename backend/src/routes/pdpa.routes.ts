import { Router, Request, Response } from "express";
import { Types } from "mongoose";
import { connectDB } from "../db/connection.js";
import ConsentRecord from "../db/models/consent-record.js";
import User from "../db/models/user.js";
import VendorProfile from "../db/models/vendor-profile.js";
import Bookmark from "../db/models/bookmark.js";
import Notification from "../db/models/notification.js";
import { exportUserData } from "../services/pdpa/data-exporter.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate, requireRecentAuth, requireScope } from "../middleware/auth.js";
import { sensitiveLimiter } from "../middleware/rate-limit.js";
import { validate } from "../middleware/validate.js";
import { consentBody, deleteAccountBody, exportQuery } from "../validation/schemas.js";
import { revokeUserSessions } from "../auth/session-service.js";
import { logSecurityEvent } from "../utils/security-log.js";

const router = Router();
router.use(authenticate, requireScope("pdpa:own"));

// All personal-data operations act only on the session's own userId (threat T24).

/** GET /api/pdpa/consent — Get current consent status. */
router.get("/consent", async (req: Request, res: Response) => {
  await connectDB();

  // aggregate() does not cast types like find() does: match on a real ObjectId.
  const records = await ConsentRecord.aggregate([
    { $match: { userId: new Types.ObjectId(req.user!.id) } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$purpose",
        granted: { $first: "$granted" },
        scope: { $first: "$scope" },
        createdAt: { $first: "$createdAt" },
      },
    },
  ]);

  apiSuccess(res, records);
});

/** POST /api/pdpa/consent — Grant or revoke consent. Body: { purpose, granted, scope? } */
router.post("/consent", validate({ body: consentBody }), async (req: Request, res: Response) => {
  await connectDB();
  const { purpose, granted, scope } = req.body as { purpose: string; granted: boolean; scope?: string };

  const record = await ConsentRecord.create({
    userId: req.user!.id,
    purpose,
    granted,
    scope: scope ?? "all",
    // req.ip honours TRUST_PROXY; a raw X-Forwarded-For header can be forged by the client.
    ipAddress: req.ip ?? "unknown",
    userAgent: (req.get("user-agent") ?? "unknown").slice(0, 512),
  });

  apiSuccess(res, record, undefined, 201);
});

/**
 * POST /api/pdpa/delete — Delete the account.
 * Requires a recent sign-in (a stolen long-lived session cannot delete the
 * account) and the account email typed again as confirmation.
 */
router.post(
  "/delete",
  sensitiveLimiter,
  requireRecentAuth(),
  validate({ body: deleteAccountBody }),
  async (req: Request, res: Response) => {
    await connectDB();

    if ((req.body as { confirmEmail: string }).confirmEmail !== req.user!.email) {
      Errors.badRequest(res, "Email confirmation does not match");
      return;
    }

    const userId = req.user!.id;
    await User.findByIdAndUpdate(userId, {
      $set: {
        deletedAt: new Date(),
        name: "Deleted User",
        email: `deleted-${userId}@icheertor.local`,
        avatarUrl: null,
        status: "banned",
        notificationPrefs: { inApp: false, email: false },
      },
    });

    // Retention rule: personal working data goes now; consent records stay as
    // legal evidence and corrections stay for audit, both linked only to the
    // anonymised account.
    await Promise.all([
      VendorProfile.deleteOne({ userId }),
      Bookmark.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
    ]);

    // Deletion ends every session immediately, including copies of the token elsewhere (ASVS V7.4.2).
    await revokeUserSessions(userId, "account_deleted");
    logSecurityEvent("account_deletion", { userId });

    apiSuccess(res, {
      scheduledAt: new Date().toISOString(),
      completionBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  },
);

/** GET /api/pdpa/export — Export all personal data of the caller. */
router.get("/export", sensitiveLimiter, validate({ query: exportQuery }), async (req: Request, res: Response) => {
  const data = await exportUserData(req.user!.id);
  logSecurityEvent("personal_data_export", { userId: req.user!.id });

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Server-generated filename only; nothing from the request goes into the header (ASVS V5.4.1).
  res.setHeader("Content-Disposition", `attachment; filename="icheertor-data-export-${Date.now()}.json"`);
  res.status(200).send(JSON.stringify(data, null, 2));
});

export default router;
