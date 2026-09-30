import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import TORRecord from "../db/models/tor-record.js";
import TORSource from "../db/models/tor-source.js";
import UserCorrection from "../db/models/user-correction.js";
import VendorProfile from "../db/models/vendor-profile.js";
import { matchQualifications } from "../services/matching/qualification-matcher.js";
import { resolveDownloadUrl } from "../services/ingestion/egp-document-url.js";
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
  "parsedData.keyDates.submissionDate",
  "parsedData.keyDates.contractDurationDays.value",
  "summary.overview",
  "redFlags.ruleId",
  "redFlags.severity",
  "createdAt",
  "updatedAt",
].join(" ");

/**
 * GET /api/tor — Search and list TOR records with filtering.
 */
router.get("/", async (req: Request, res: Response) => {
  await connectDB();

  const q = req.query.q as string | undefined;
  const agency = req.query.agency as string | undefined;
  const budgetMin = req.query.budgetMin as string | undefined;
  const budgetMax = req.query.budgetMax as string | undefined;
  const phase = req.query.phase as string | undefined;
  const openOnly = req.query.openOnly === "true";
  const techStack = req.query.techStack as string | undefined;
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

    const tagConditions: Record<string, unknown>[] = [];
    if (openOnly) tagConditions.push({ tags: "open" });
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

    const [records, total] = await Promise.all([
      TORRecord.find(filter)
        .sort(sortField)
        .skip((page - 1) * limit)
        .limit(limit)
        .select(LIST_FIELDS)
        .lean(),
      TORRecord.countDocuments(filter),
    ]);

    apiSuccess(res, records, { total, page, limit });
  } catch (error) {
    console.error("TOR search error:", error);
    Errors.internal(res, "Failed to search TOR records");
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

    apiSuccess(res, { ...record, sources });
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
