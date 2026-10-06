import { Router, Request, Response } from "express";
import { connectDB } from "../db/connection.js";
import TORRecord from "../db/models/tor-record.js";
import TORSource from "../db/models/tor-source.js";
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
 * Fields a procurement-list row needs: the egp2 data plus the few extraction
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
  "parsedData.keyDates.announcedDate",
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

/** Projects a bidder can still act on. A confirmed submission deadline takes
 * precedence; otherwise public hearings use their own closing date. */
function openOpportunityFilter(now = new Date()): Record<string, unknown> {
  const noSubmissionDeadline = {
    $or: [{ submissionDeadline: { $exists: false } }, { submissionDeadline: null }],
  };
  const hearingStillOpenOrUndated = {
    $or: [
      { publicHearingEnd: { $gte: now } },
      { publicHearingEnd: { $exists: false } },
      { publicHearingEnd: null },
    ],
  };

  return {
    phase: { $in: ["public_hearing", "bidding"] },
    tags: "open",
    $or: [
      { submissionDeadline: { $gte: now } },
      { $and: [noSubmissionDeadline, hearingStillOpenOrUndated] },
    ],
  };
}

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
  const status = req.query.status as string | undefined;
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
  if (status && status !== "open" && status !== "closed") {
    Errors.badRequest(res, "status must be open or closed");
    return;
  }
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
    // e-GP can leave projects tagged open after their actionable deadline.
    const openCondition = openOpportunityFilter();
    if (openOnly || status === "open") tagConditions.push(openCondition);
    if (status === "closed") tagConditions.push({ $nor: [openCondition] });
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
    const sortFields: Record<string, string> = {
      announcedDate: "parsedData.keyDates.announcedDate",
      postingDate: "postingDate",
      medianPrice: "medianPrice",
      publicHearingEnd: "publicHearingEnd",
      submissionDeadline: "submissionDeadline",
    };
    const resolvedSortField = sortFields[sortBy];
    if (resolvedSortField) {
      sortField[resolvedSortField] = sortOrder;
      // Keep pagination stable when several announcements share the same day.
      if (sortBy === "announcedDate") sortField.postingDate = sortOrder;
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
          displayPhase: displayPhase(
            r.phase,
            r.submissionDeadline ?? (r.phase === "public_hearing" ? r.publicHearingEnd : undefined),
            now,
          ),
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
      displayPhase: displayPhase(
        record.phase,
        record.submissionDeadline ?? (record.phase === "public_hearing" ? record.publicHearingEnd : undefined),
      ),
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
