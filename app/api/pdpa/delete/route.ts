import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** POST /api/pdpa/delete — Request account deletion. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  const body = await request.json();
  if (body.confirmEmail !== auth.email) {
    return Errors.badRequest("Email confirmation does not match");
  }

  // Soft-delete: set deletedAt, anonymise PII
  await User.findByIdAndUpdate(auth.id, {
    $set: {
      deletedAt: new Date(),
      name: "Deleted User",
      email: `deleted-${auth.id}@icheertor.local`,
      avatarUrl: null,
      status: "banned",
    },
  });

  return apiSuccess({
    scheduledAt: new Date().toISOString(),
    completionBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  });
}
