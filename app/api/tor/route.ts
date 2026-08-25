import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import TORRecord from "@/lib/db/models/tor-record";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/**
 * GET /api/tor — Search and list TOR records with filtering.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q");
  const agency = searchParams.get("agency");
  const budgetMin = searchParams.get("budgetMin");
  const budgetMax = searchParams.get("budgetMax");
  const phase = searchParams.get("phase");
  const techStack = searchParams.get("techStack");
  const sortBy = searchParams.get("sortBy") ?? "postingDate";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  try {
    // Build query
    const filter: Record<string, unknown> = {};

    if (q) {
      filter.$text = { $search: q };
    }
    if (agency) {
      filter.agencyName = { $regex: agency, $options: "i" };
    }
    if (budgetMin || budgetMax) {
      filter.medianPrice = {};
      if (budgetMin) (filter.medianPrice as Record<string, number>).$gte = Number(budgetMin);
      if (budgetMax) (filter.medianPrice as Record<string, number>).$lte = Number(budgetMax);
    }
    if (phase) {
      filter.phase = phase;
    }
    if (techStack) {
      const stacks = techStack.split(",").map((s) => s.trim());
      filter.tags = { $in: stacks };
    }

    // Sort
    const sortField: Record<string, 1 | -1> = {};
    const validSortFields = ["postingDate", "medianPrice", "submissionDeadline"];
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
        .select("-parsedData.scopeOfWork.content -parsedData.evaluationCriteria.content")
        .lean(),
      TORRecord.countDocuments(filter),
    ]);

    return apiSuccess(records, { total, page, limit });
  } catch (error) {
    console.error("TOR search error:", error);
    return Errors.internal("Failed to search TOR records");
  }
}
