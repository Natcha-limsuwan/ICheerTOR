import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import UserCorrection from "@/lib/db/models/user-correction";
import TORRecord from "@/lib/db/models/tor-record";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** POST /api/tor/[id]/corrections — Submit a field correction. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();
  const { id } = await params;

  const tor = await TORRecord.findById(id);
  if (!tor) return Errors.notFound("TOR record not found");

  const body = await request.json();
  if (!body.fieldPath || body.correctedValue === undefined) {
    return Errors.badRequest("fieldPath and correctedValue are required");
  }

  // Resolve the original value from the nested path
  const pathParts = body.fieldPath.split(".");
  let originalValue: unknown = tor.toObject();
  for (const part of pathParts) {
    originalValue = (originalValue as Record<string, unknown>)?.[part];
  }

  const correction = await UserCorrection.create({
    userId: auth.id,
    torRecordId: id,
    fieldPath: body.fieldPath,
    originalValue,
    correctedValue: body.correctedValue,
    status: "pending",
  });

  return apiSuccess(correction, undefined, 201);
}
