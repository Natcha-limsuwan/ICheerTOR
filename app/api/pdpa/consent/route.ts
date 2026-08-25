import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import ConsentRecord from "@/lib/db/models/consent-record";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** GET /api/pdpa/consent — Get current consent status for all purposes. */
export async function GET() {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  // Get latest consent record per purpose
  const records = await ConsentRecord.aggregate([
    { $match: { userId: auth.id } },
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

  return apiSuccess(records);
}

/** POST /api/pdpa/consent — Grant or revoke consent. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  const body = await request.json();
  if (!body.purpose || typeof body.granted !== "boolean") {
    return Errors.badRequest("purpose and granted are required");
  }

  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const ua = request.headers.get("user-agent") ?? "unknown";

  const record = await ConsentRecord.create({
    userId: auth.id,
    purpose: body.purpose,
    granted: body.granted,
    scope: body.scope ?? "all",
    ipAddress: ip,
    userAgent: ua,
  });

  return apiSuccess(record, undefined, 201);
}
