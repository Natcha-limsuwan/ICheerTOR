import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import Bookmark from "../db/models/bookmark.js";
import TORRecord from "../db/models/tor-record.js";
import { displayPhase } from "../services/ingestion/data-checks.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate, requireScope } from "../middleware/auth.js";
import { objectIdParam, validate } from "../middleware/validate.js";
import { bookmarkCreateBody, paginationQuery } from "../validation/schemas.js";

const router = Router();
router.use(authenticate, requireScope("bookmarks:own"));
router.param("id", objectIdParam);
router.param("torRecordId", objectIdParam);

/*
 * Object-level access control (threat T07; ASVS V8.2.2): every query below
 * includes userId taken from the authenticated session, never from the
 * request, so one user can never read or delete another user's bookmarks.
 */

/** GET /api/bookmarks — List current user's bookmarks. */
router.get("/", validate({ query: paginationQuery }), async (req: Request, res: Response) => {
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

/** POST /api/bookmarks — Create a bookmark. Body: { torRecordId, notes? } */
router.post("/", validate({ body: bookmarkCreateBody }), async (req: Request, res: Response) => {
  await connectDB();
  const { torRecordId, notes } = req.body as { torRecordId: string; notes?: string };

  // Business-logic step check: the TOR must exist before it can be bookmarked (ASVS V2.3.1).
  if (!(await TORRecord.exists({ _id: torRecordId }))) {
    Errors.notFound(res, "TOR record not found");
    return;
  }

  // Atomic upsert: concurrent requests cannot create duplicates (threat T20).
  const bookmark = await Bookmark.findOneAndUpdate(
    { userId: req.user!.id, torRecordId },
    { $setOnInsert: { userId: req.user!.id, torRecordId, notes } },
    { upsert: true, returnDocument: "after", includeResultMetadata: true },
  );

  const created = !bookmark.lastErrorObject?.updatedExisting;
  apiSuccess(res, bookmark.value, undefined, created ? 201 : 200);
});

/** DELETE /api/bookmarks/:id — Remove a bookmark (only the caller's own). */
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
