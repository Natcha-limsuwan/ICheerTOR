import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db/connection";
import TORRecord from "@/lib/db/models/tor-record";
import { apiSuccess, Errors } from "@/lib/utils/api-response";
import { requireAuth, isErrorResponse } from "@/lib/auth/middleware";
import { resolveDownloadUrl } from "@/lib/services/ingestion/egp-document-url";

/**
 * GET /api/tor/[id]/document — Resolve the e-GP document archive URL.
 *
 * We deliberately do not store or proxy the file. Only the project id lives
 * in our database; the archive URL is resolved at request time, so users
 * always receive the current document straight from e-GP and we never keep
 * copies of government files (some of which name individuals).
 *
 * The returned URL is meant to be opened by the user's browser: e-GP requires
 * a Referer header, which browsers send automatically on navigation.
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
    const record = await TORRecord.findById(id)
      .select("title metadata officialPortalUrl")
      .lean();

    if (!record) {
      return Errors.notFound("ไม่พบประกาศที่ระบุ");
    }

    const projectId = record.metadata?.projectId;
    if (!projectId) {
      return Errors.notFound(
        "ประกาศนี้ไม่มีเลขที่โครงการ จึงไม่สามารถดึงเอกสารจาก e-GP ได้",
      );
    }

    const resolved = await resolveDownloadUrl(projectId);

    if (!resolved) {
      // e-GP publishes no archive for some projects; this is expected, not a fault.
      return apiSuccess({
        available: false,
        projectId,
        officialPortalUrl: record.officialPortalUrl ?? null,
        message: "e-GP ยังไม่ได้เผยแพร่ชุดเอกสารสำหรับโครงการนี้",
      });
    }

    return apiSuccess({
      available: true,
      projectId,
      fileName: resolved.fileName,
      downloadUrl: resolved.downloadUrl,
      officialPortalUrl: record.officialPortalUrl ?? null,
      // The archive bundles several documents (TOR, price table, announcement).
      note: "ไฟล์เป็น ZIP รวมเอกสารหลายฉบับ รวมถึงร่างขอบเขตงาน (TOR) หากมี",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
    // e-GP being unreachable is an upstream problem, not a client mistake.
    return Errors.internal(`ไม่สามารถติดต่อระบบ e-GP ได้: ${message}`);
  }
}
