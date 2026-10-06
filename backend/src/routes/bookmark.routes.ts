import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import Bookmark from "../db/models/bookmark.js";
import { displayPhase } from "../services/ingestion/data-checks.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

/** GET /api/bookmarks — List current user's bookmarks. */
router.get("/", async (req: Request, res: Response) => {
  await connectDB();

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(100, parseInt((req.query.limit as string) ?? "20", 10));

  const [bookmarks, total] = await Promise.all([
    Bookmark.find({ userId: req.user!.id })
      .populate("torRecordId", "title agencyName phase medianPrice submissionDeadline tags officialPortalUrl")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Bookmark.countDocuments({ userId: req.user!.id }),
  ]);

  const now = new Date();
  apiSuccess(
    res,
    bookmarks.map((bookmark) => {
      const tor = bookmark.torRecordId;
      if (!tor || typeof tor !== "object" || !("phase" in tor)) return bookmark;
      const populatedTor = tor as unknown as {
        phase: "public_hearing" | "bidding" | "awarded" | "cancelled";
        submissionDeadline?: Date | null;
      };
      return {
        ...bookmark,
        torRecordId: {
          ...tor,
          displayPhase: displayPhase(populatedTor.phase, populatedTor.submissionDeadline, now),
        },
      };
    }),
    { total, page, limit },
  );
});

/** GET /api/bookmarks/tor/:torRecordId — Bookmark state for one TOR. */
router.get("/tor/:torRecordId", async (req: Request, res: Response) => {
  await connectDB();

  const bookmark = await Bookmark.findOne({
    userId: req.user!.id,
    torRecordId: req.params.torRecordId,
  })
    .select("_id")
    .lean();

  apiSuccess(res, {
    bookmarked: Boolean(bookmark),
    bookmarkId: bookmark?._id.toString() ?? null,
  });
});

/** POST /api/bookmarks — Create a bookmark. */
router.post("/", async (req: Request, res: Response) => {
  await connectDB();

  try {
    const bookmark = await Bookmark.create({
      userId: req.user!.id,
      torRecordId: req.body.torRecordId,
      notes: req.body.notes,
    });
    apiSuccess(res, bookmark, undefined, 201);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      Errors.conflict(res, "Already bookmarked");
      return;
    }
    console.error("Bookmark creation error:", error);
    Errors.badRequest(res, "Invalid bookmark data");
  }
});

/** DELETE /api/bookmarks/:id — Remove a bookmark. */
router.delete("/:id", async (req: Request, res: Response) => {
  await connectDB();

  const bookmark = await Bookmark.findOneAndDelete({
    _id: req.params.id,
    userId: req.user!.id,
  });

  if (!bookmark) {
    Errors.notFound(res, "Bookmark not found");
    return;
  }
  apiSuccess(res, { deleted: true });
});

export default router;
