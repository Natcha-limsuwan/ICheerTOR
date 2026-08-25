import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import Bookmark from "@/lib/db/models/bookmark";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** GET /api/bookmarks — List current user's bookmarks with populated TOR data. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));

  const [bookmarks, total] = await Promise.all([
    Bookmark.find({ userId: auth.id })
      .populate("torRecordId", "title agencyName phase medianPrice submissionDeadline tags officialPortalUrl")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Bookmark.countDocuments({ userId: auth.id }),
  ]);

  return apiSuccess(bookmarks, { total, page, limit });
}

/** POST /api/bookmarks — Create a bookmark. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();

  try {
    const body = await request.json();
    const bookmark = await Bookmark.create({
      userId: auth.id,
      torRecordId: body.torRecordId,
      notes: body.notes,
    });
    return apiSuccess(bookmark, undefined, 201);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      return Errors.conflict("Already bookmarked");
    }
    console.error("Bookmark creation error:", error);
    return Errors.badRequest("Invalid bookmark data");
  }
}
