import { NextRequest } from "next/server";
import { exportUserData } from "@/lib/services/pdpa/data-exporter";
import { apiSuccess } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";

/** GET /api/pdpa/export — Export all personal data for current user. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const { searchParams } = request.nextUrl;
  const format = searchParams.get("format") ?? "json";

  const data = await exportUserData(auth.id);

  if (format === "json") {
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="icheertor-data-export-${Date.now()}.json"`,
      },
    });
  }

  // Default JSON response
  return apiSuccess(data);
}
