import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import Bookmark from "@/lib/db/models/bookmark";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** DELETE /api/bookmarks/[id] — Remove a bookmark. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  await connectDB();
  const { id } = await params;

  const bookmark = await Bookmark.findOneAndDelete({
    _id: id,
    userId: auth.id,
  });

  if (!bookmark) return Errors.notFound("Bookmark not found");
  return apiSuccess({ deleted: true });
}
