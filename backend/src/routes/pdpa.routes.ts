import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import ConsentRecord from "../db/models/consent-record.js";
import User from "../db/models/user.js";
import { exportUserData } from "../services/pdpa/data-exporter.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

/** GET /api/pdpa/consent — Get current consent status. */
router.get("/consent", async (req: Request, res: Response) => {
  await connectDB();

  const records = await ConsentRecord.aggregate([
    { $match: { userId: req.user!.id } },
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

/** POST /api/pdpa/consent — Grant or revoke consent. */
router.post("/consent", async (req: Request, res: Response) => {
  await connectDB();

  if (!req.body.purpose || typeof req.body.granted !== "boolean") {
    Errors.badRequest(res, "purpose and granted are required");
    return;
  }

  const ip = req.headers["x-forwarded-for"] as string ?? req.headers["x-real-ip"] as string ?? "unknown";
  const ua = req.headers["user-agent"] ?? "unknown";

  const record = await ConsentRecord.create({
    userId: req.user!.id,
    purpose: req.body.purpose,
    granted: req.body.granted,
    scope: req.body.scope ?? "all",
    ipAddress: typeof ip === "string" ? ip : ip[0],
    userAgent: ua,
  });

  apiSuccess(res, record, undefined, 201);
});

/** POST /api/pdpa/delete — Request account deletion. */
router.post("/delete", async (req: Request, res: Response) => {
  await connectDB();

  if (req.body.confirmEmail !== req.user!.email) {
    Errors.badRequest(res, "Email confirmation does not match");
    return;
  }

  await User.findByIdAndUpdate(req.user!.id, {
    $set: {
      deletedAt: new Date(),
      name: "Deleted User",
      email: `deleted-${req.user!.id}@icheertor.local`,
      avatarUrl: null,
      status: "banned",
    },
  });

  apiSuccess(res, {
    scheduledAt: new Date().toISOString(),
    completionBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
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
