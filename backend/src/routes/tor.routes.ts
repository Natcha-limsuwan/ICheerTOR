import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { connectDB } from "../db/connection.js";
import TORRecord from "../db/models/tor-record.js";
import TORSource from "../db/models/tor-source.js";
import Bookmark from "../db/models/bookmark.js";
import Notification from "../db/models/notification.js";
import UserCorrection from "../db/models/user-correction.js";
import VendorProfile from "../db/models/vendor-profile.js";
import { matchQualifications } from "../services/matching/qualification-matcher.js";
import { resolveDownloadUrl } from "../services/ingestion/egp-document-url.js";
import { bidWindow, displayPhase } from "../services/ingestion/data-checks.js";
import { apiSuccess, Errors } from "../utils/api-response.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// All TOR routes require authentication
router.use(authenticate);

/**
 * Fields a list/dashboard row needs: the egp2 data plus the few extraction
 * results that help decide whether to open a project. Qualifications, scope
 * text, conflicts and risk evidence are 10–20 KB per record and only come
 * with GET /api/tor/:id.
 */
const LIST_FIELDS = [
  "title",
  "agencyName",
  "phase",
  "budget",
  "medianPrice",
  // egp2's medianPrice as checked at extraction (dropped digits) — prefer it.
  "parsedData.medianPrice",
  "postingDate",
  "publicHearingStart",
  "publicHearingEnd",
  "submissionDeadline",
  "sourceUrl",
  "officialPortalUrl",
  "tags",
  "extractionStatus",
  "extraction.needsReview",
  "metadata.projectId",
  "metadata.contractStatus",
  "metadata.phaseReason",
  "parsedData.workType",
  "parsedData.keyDates.documentStage",
  "parsedData.keyDates.submissionDate",
  "parsedData.keyDates.documentFeePeriod",
  "parsedData.keyDates.contractDurationDays.value",
  "summary.overview",
  "redFlags.ruleId",
  "redFlags.severity",
  "dataChecks.conflicts",
  "dataChecks.needsCheck",
  "createdAt",
  "updatedAt",
].join(" ");

/**
 * Which records a list shows. The default is what the product is built on —
 * TORs the AI has read; the others are opt-in, so the response shape never
 * changes, only how many rows come back.
 *
 *   parsed (default)  extractionStatus "completed"
 *   new               parsed + still-open projects not read yet (just
 *                     ingested, or failed) — so a project in public hearing
 *                     is not hidden while it waits for the model
 *   all               every record (admin, history)
 */
export type ListScope = "parsed" | "new" | "all";

export function scopeFilter(scope: ListScope, now = new Date()): Record<string, unknown> {
  if (scope === "all") return {};
  const parsed = { extractionStatus: "completed" };
  if (scope === "parsed") return parsed;
  return {
    $or: [
      parsed,
      {
        extractionStatus: { $in: ["pending", "processing", "failed"] },
        phase: { $in: ["public_hearing", "bidding"] },
        $or: [{ submissionDeadline: { $exists: false } }, { submissionDeadline: null }, { submissionDeadline: { $gte: now } }],
      },
    ],
  };
}

const LIST_SCOPES: ListScope[] = ["parsed", "new", "all"];

/**
 * GET /api/tor — Search and list TOR records with filtering.
 * ?scope=parsed|new|all (default parsed) — see scopeFilter.
 */
router.get("/", async (req: Request, res: Response) => {
  await connectDB();

  const q = req.query.q as string | undefined;
  const agency = req.query.agency as string | undefined;
  const budgetMin = req.query.budgetMin as string | undefined;
  const budgetMax = req.query.budgetMax as string | undefined;
  const phase = req.query.phase as string | undefined;
  const openOnly = req.query.openOnly === "true";
  const needsCheck = req.query.needsCheck === "true";
  const techStack = req.query.techStack as string | undefined;
  /** Attach the authenticated user's qualification result to each list row. */
  const includeMatch = req.query.includeMatch === "true";
  const scopeParam = (req.query.scope as string | undefined) ?? "parsed";
  if (!LIST_SCOPES.includes(scopeParam as ListScope)) {
    Errors.badRequest(res, `scope must be one of: ${LIST_SCOPES.join(", ")}`);
    return;
  }
  const scope = scopeParam as ListScope;
  const sortBy = (req.query.sortBy as string) ?? "postingDate";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)));

  try {
    const filter: Record<string, unknown> = {};

    if (q) filter.$text = { $search: q };
    if (agency) filter.agencyName = { $regex: agency, $options: "i" };
    if (budgetMin || budgetMax) {
      filter.medianPrice = {};
      if (budgetMin) (filter.medianPrice as Record<string, number>).$gte = Number(budgetMin);
      if (budgetMax) (filter.medianPrice as Record<string, number>).$lte = Number(budgetMax);
    }
    if (phase) filter.phase = phase;
    if (needsCheck) filter["dataChecks.needsCheck"] = true;

    const tagConditions: Record<string, unknown>[] = [];
    const inScope = scopeFilter(scope);
    if (Object.keys(inScope).length) tagConditions.push(inScope);
    // "Open" = egp2 says so AND the bid day has not passed. egp2 keeps a
    // project open until the contract is signed, long after bids close.
    if (openOnly) {
      tagConditions.push({ tags: "open" });
      tagConditions.push({
        $or: [{ submissionDeadline: { $exists: false } }, { submissionDeadline: null }, { submissionDeadline: { $gte: new Date() } }],
      });
    }
    if (techStack) {
      const stacks = techStack.split(",").map((s) => s.trim()).filter(Boolean);
      if (stacks.length) tagConditions.push({ tags: { $in: stacks } });
    }
    if (tagConditions.length === 1) {
      Object.assign(filter, tagConditions[0]);
    } else if (tagConditions.length > 1) {
      filter.$and = tagConditions;
    }

    const sortField: Record<string, 1 | -1> = {};
    const validSortFields = ["postingDate", "medianPrice", "publicHearingEnd", "submissionDeadline"];
    if (validSortFields.includes(sortBy)) {
      sortField[sortBy] = sortOrder;
    } else {
      sortField.postingDate = -1;
    }

    const [records, total, profile] = await Promise.all([
      TORRecord.find(filter)
        .sort(sortField)
        .skip((page - 1) * limit)
        .limit(limit)
        .select(includeMatch ? `${LIST_FIELDS} parsedData.qualifications` : LIST_FIELDS)
        .lean(),
      TORRecord.countDocuments(filter),
      includeMatch ? VendorProfile.findOne({ userId: req.user!.id }).lean() : null,
    ]);

    const now = new Date();
    apiSuccess(
      res,
      records.map((r) => {
        const match = profile ? matchQualifications(profile, r.parsedData?.qualifications ?? []) : null;
        // Qualifications are selected only to calculate the private match;
        // list clients still receive the compact list representation.
        const { parsedData: rawParsedData, ...record } = r;
        const { qualifications: _qualifications, ...parsedData } = rawParsedData ?? {};
        return {
          ...record,
          ...(Object.keys(parsedData).length ? { parsedData } : {}),
          bidWindow: bidWindow(r.submissionDeadline, now),
          displayPhase: displayPhase(r.phase, r.submissionDeadline, now),
          ...(includeMatch ? { match } : {}),
        };
      }),
      { total, page, limit },
    );
  } catch (error) {
    console.error("TOR search error:", error);
    Errors.internal(res, "Failed to search TOR records");
  }
});

/**
 * GET /api/tor/dashboard — Counts for the signed-in user's dashboard.
 * This stays separate from the paginated list so card totals are never based
 * on whichever page of TOR rows happens to be visible.
 */
router.get("/dashboard", async (req: Request, res: Response) => {
  await connectDB();

  try {
    const now = new Date();
    // Start of the current Bangkok calendar day, regardless of server TZ.
    const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStart = new Date(
      Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate()) - 7 * 60 * 60 * 1000,
    );
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Counted like the default list (scope "parsed"), so a card never says
    // 110 while the list shows 51.
    const parsed = scopeFilter("parsed", now);
    // aggregate() does not cast like find() does: the id must be an ObjectId.
    const userObjectId = new mongoose.Types.ObjectId(req.user!.id as string);

    const [torTotal, torNewToday, torAnalyzing, bookmarked, closingSoon, notificationTotal, notificationUnread, profile, records] = await Promise.all([
      TORRecord.countDocuments(parsed),
      TORRecord.countDocuments({ ...scopeFilter("new", now), createdAt: { $gte: todayStart } }),
      TORRecord.countDocuments({ $and: [scopeFilter("new", now), { extractionStatus: { $ne: "completed" } }] }),
      Bookmark.countDocuments({ userId: req.user!.id }),
      Bookmark.aggregate<{ count: number }>([
        { $match: { userId: userObjectId } },
        {
          $lookup: {
            from: "torrecords",
            localField: "torRecordId",
            foreignField: "_id",
            as: "tor",
          },
        },
        { $unwind: "$tor" },
        { $match: { "tor.submissionDeadline": { $gte: now, $lte: soon } } },
        { $count: "count" },
      ]),
      Notification.countDocuments({ userId: req.user!.id }),
      Notification.countDocuments({ userId: req.user!.id, "channels.inApp.readAt": { $exists: false } }),
      VendorProfile.findOne({ userId: req.user!.id }).lean(),
      TORRecord.find(parsed)
        .select("parsedData.qualifications")
        .lean(),
    ]);

    const scores = profile
      ? records
          .map((record) => matchQualifications(profile, record.parsedData?.qualifications ?? []).matchScore)
          .filter((score): score is number => score != null)
      : [];

    apiSuccess(res, {
      // total: AI-read TORs (the default list). newToday: added today, read or
      // waiting. analyzing: open projects still waiting for the model.
      tor: { total: torTotal, newToday: torNewToday, analyzing: torAnalyzing },
      bookmarks: { total: bookmarked, closingSoon: closingSoon[0]?.count ?? 0 },
      notifications: { total: notificationTotal, unread: notificationUnread },
      matching: {
        averageScore: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
        evaluated: scores.length,
      },
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    Errors.internal(res, "Failed to load dashboard summary");
  }
});

/**
 * GET /api/tor/:id — Get full TOR detail, including every extraction result.
 * Never calls Vertex AI: extraction runs in the background (extract-tors.ts);
 * until it has, extractionStatus is "pending" and parsedData is empty.
 */
router.get("/:id", async (req: Request, res: Response) => {
  await connectDB();

  try {
    const record = await TORRecord.findById(req.params.id).lean();
    if (!record) {
      Errors.notFound(res, "TOR record not found");
      return;
    }

    const sources = await TORSource.find({ torRecordId: req.params.id })
      .sort({ scrapedAt: -1 })
      .lean();

    apiSuccess(res, {
      ...record,
      bidWindow: bidWindow(record.submissionDeadline),
      displayPhase: displayPhase(record.phase, record.submissionDeadline),
      sources,
    });
  } catch (error) {
    console.error("TOR detail error:", error);
    Errors.internal(res, "Failed to fetch TOR record");
  }
});

/**
 * POST /api/tor/:id/corrections — Submit a field correction.
 */
router.post("/:id/corrections", async (req: Request, res: Response) => {
  await connectDB();

  const tor = await TORRecord.findById(req.params.id);
  if (!tor) {
    Errors.notFound(res, "TOR record not found");
    return;
  }

  const body = req.body;
  if (!body.fieldPath || body.correctedValue === undefined) {
    Errors.badRequest(res, "fieldPath and correctedValue are required");
    return;
  }

  const pathParts = body.fieldPath.split(".");
  let originalValue: unknown = tor.toObject();
  for (const part of pathParts) {
    originalValue = (originalValue as Record<string, unknown>)?.[part];
  }

  const correction = await UserCorrection.create({
    userId: req.user!.id as string,
    torRecordId: req.params.id as string,
    fieldPath: body.fieldPath,
    originalValue,
    correctedValue: body.correctedValue,
    status: "pending",
  });

  apiSuccess(res, correction, undefined, 201);
});

/**
 * GET /api/tor/:id/document — Resolve the e-GP document archive URL.
 */
router.get("/:id/document", async (req: Request, res: Response) => {
  await connectDB();

  try {
    const record = await TORRecord.findById(req.params.id)
      .select("title metadata officialPortalUrl")
      .lean();

    if (!record) {
      Errors.notFound(res, "TOR record not found");
      return;
    }

    const projectId = record.metadata?.projectId;
    if (!projectId) {
      Errors.notFound(res, "No project ID found for this TOR record");
      return;
    }

    const resolved = await resolveDownloadUrl(projectId);

    if (!resolved) {
      apiSuccess(res, {
        available: false,
        projectId,
        officialPortalUrl: record.officialPortalUrl ?? null,
        message: "Document not available from e-GP",
      });
      return;
    }

    apiSuccess(res, {
      available: true,
      projectId,
      fileName: resolved.fileName,
      downloadUrl: resolved.downloadUrl,
      officialPortalUrl: record.officialPortalUrl ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    Errors.internal(res, `Failed to resolve e-GP document: ${message}`);
  }
});

/**
 * GET /api/tor/:id/match — Qualification match analysis for current user.
 */
router.get("/:id/match", async (req: Request, res: Response) => {
  await connectDB();

  const profile = await VendorProfile.findOne({ userId: req.user!.id });
  if (!profile) {
    Errors.badRequest(res, "No vendor profile found. Create a profile first.");
    return;
  }

  const tor = await TORRecord.findById(req.params.id);
  if (!tor) {
    Errors.notFound(res, "TOR record not found");
    return;
  }

  const result = matchQualifications(profile, tor.parsedData.qualifications);

  apiSuccess(res, { torRecordId: req.params.id, ...result });
});

export default router;
