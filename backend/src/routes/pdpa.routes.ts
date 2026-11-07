import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import ConsentRecord from "../db/models/consent-record.js";
import User from "../db/models/user.js";
import { exportUserData } from "../services/pdpa/data-exporter.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate } from "../middleware/auth.js";
import { Types } from "mongoose";
import { PRIVACY_NOTICE_VERSION, DATA_PROCESSING_PURPOSE } from "../services/pdpa/consent.js";
import { purgeUserData } from "../services/pdpa/data-deleter.js";

const router = Router();
router.use(authenticate);

/** GET /api/pdpa/consent — Get current consent status. */
router.get("/consent", async (req: Request, res: Response) => {
  await connectDB();

  const records = await ConsentRecord.aggregate([
    { $match: { userId: new Types.ObjectId(req.user!.id) } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: "$purpose",
        granted: { $first: "$granted" },
        scope: { $first: "$scope" },
        createdAt: { $first: "$createdAt" },
        noticeVersion: { $first: "$noticeVersion" },
      },
    },
  ]);

  apiSuccess(res, records);
});

/** POST /api/pdpa/consent — Grant or revoke consent. */
router.post("/consent", async (req: Request, res: Response) => {
  await connectDB();

  if (req.body?.purpose !== DATA_PROCESSING_PURPOSE || typeof req.body.granted !== "boolean"
    || (req.body.granted && req.body.noticeVersion !== PRIVACY_NOTICE_VERSION)) {
    Errors.badRequest(res, "กรุณาระบุความยินยอมและเวอร์ชันนโยบายปัจจุบันให้ถูกต้อง");
    return;
  }

  const record = await ConsentRecord.create({
    userId: req.user!.id,
    purpose: req.body.purpose,
    granted: req.body.granted,
    scope: "profile_matching",
    noticeVersion: PRIVACY_NOTICE_VERSION,
  });

  apiSuccess(res, record, undefined, 201);
});

/** POST /api/pdpa/delete — Request account deletion. */
router.post("/delete", async (req: Request, res: Response) => {
  await connectDB();

  if (req.body?.confirmEmail !== req.user!.email) {
    Errors.badRequest(res, "Email confirmation does not match");
    return;
  }

  await User.findByIdAndUpdate(req.user!.id, {
    $set: {
      deletedAt: new Date(),
      status: "banned",
      "notificationPrefs.email": false,
    },
  });

  try {
    await purgeUserData(req.user!.id);
    apiSuccess(res, { deleted: true, completedAt: new Date().toISOString() });
  } catch {
    // deletedAt remains durable; server worker resumes cleanup after restart.
    console.error("[PDPA] Deletion queued for retry");
    apiSuccess(res, { deleted: false, status: "pending", message: "ปิดการใช้งานบัญชีแล้ว ระบบจะลบข้อมูลที่เหลือต่อโดยอัตโนมัติ" }, undefined, 202);
  }
});

/** GET /api/pdpa/export — Export all personal data. */
router.get("/export", async (req: Request, res: Response) => {
  const format = req.query.format as string ?? "json";
  const data = await exportUserData(req.user!.id);

  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="icheertor-data-export-${Date.now()}.json"`);
    res.status(200).send(JSON.stringify(data, null, 2));
    return;
  }

  apiSuccess(res, data);
});

export default router;
