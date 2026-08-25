import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import VendorProfile from "@/lib/db/models/vendor-profile";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** GET /api/profile — Get current user's vendor profile. */
export async function GET() {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();
  const profile = await VendorProfile.findOne({ userId: auth.id }).lean();
  if (!profile) return Errors.notFound("No vendor profile found");
  return apiSuccess(profile);
}

/** POST /api/profile — Create vendor profile. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  const existing = await VendorProfile.findOne({ userId: auth.id });
  if (existing) return Errors.conflict("Vendor profile already exists");

  try {
    const body = await request.json();
    const profile = await VendorProfile.create({ ...body, userId: auth.id });
    return apiSuccess(profile, undefined, 201);
  } catch (error) {
    console.error("Profile creation error:", error);
    return Errors.badRequest("Invalid profile data");
  }
}

/** PUT /api/profile — Update vendor profile. */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  try {
    const body = await request.json();
    const profile = await VendorProfile.findOneAndUpdate(
      { userId: auth.id },
      { $set: body },
      { new: true, runValidators: true },
    );

    if (!profile) return Errors.notFound("No vendor profile found");
    return apiSuccess(profile);
  } catch (error) {
    console.error("Profile update error:", error);
    return Errors.badRequest("Invalid profile data");
  }
}
