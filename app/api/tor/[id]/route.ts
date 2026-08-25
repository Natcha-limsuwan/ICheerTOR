import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import TORRecord from "@/lib/db/models/tor-record";
import TORSource from "@/lib/db/models/tor-source";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/**
 * GET /api/tor/[id] — Get full TOR detail including parsed data and red flags.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  try {
    const { id } = await params;
    const record = await TORRecord.findById(id).lean();

    if (!record) {
      return Errors.notFound("TOR record not found");
    }

    // Fetch associated sources
    const sources = await TORSource.find({ torRecordId: id })
      .sort({ scrapedAt: -1 })
      .lean();

    return apiSuccess({ ...record, sources });
  } catch (error) {
    console.error("TOR detail error:", error);
    return Errors.internal("Failed to fetch TOR record");
  }
}
