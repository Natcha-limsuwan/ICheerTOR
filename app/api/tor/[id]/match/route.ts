import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import TORRecord from "@/lib/db/models/tor-record";
import VendorProfile from "@/lib/db/models/vendor-profile";
import { matchQualifications } from "@/lib/services/matching/qualification-matcher";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** GET /api/tor/[id]/match — Qualification match analysis for current user. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();
  const { id } = await params;

  const profile = await VendorProfile.findOne({ userId: auth.id });
  if (!profile) {
    return Errors.badRequest("No vendor profile found. Create a profile first.");
  }

  const tor = await TORRecord.findById(id);
  if (!tor) return Errors.notFound("TOR record not found");

  const result = matchQualifications(profile, tor.parsedData.qualifications);

  return apiSuccess({
    torRecordId: id,
    ...result,
  });
}
