/**
 * Build e-GP document URLs instead of storing files.
 *
 * We keep only the project id; the archive is fetched on demand when a user
 * asks for it. That avoids warehousing copies of government documents, keeps
 * what users see in step with the source, and sidesteps holding PDFs that may
 * name individuals.
 *
 * The chain (verified against real BMA projects):
 *   project_id → infoProcureDocAnnounZipTemp → zipId → downloadFileTest → ZIP
 *
 * The zipId is not derivable from the project id, so a download needs one
 * lookup first. `resolveDownloadUrl` does both steps; `buildDownloadUrl` is
 * for when a zipId is already known.
 *
 * Every request needs a Referer header — without it the WAF replies 200 with
 * an HTML rejection page. Browsers send it automatically, so a link handed to
 * the user works; server-side fetches must set it explicitly.
 */

const PROCESS5 = "https://process5.gprocurement.go.th";

export const EGP_INFO_ENDPOINT = `${PROCESS5}/egp-approval-service/apv-common/infoProcureDocAnnounZipTemp`;
export const EGP_DOWNLOAD_ENDPOINT = `${PROCESS5}/egp-upload-service/v1/downloadFileTest`;
export const EGP_REFERER = `${PROCESS5}/egp-agpc01-web/`;

/** Public e-GP announcement search — a stable landing page for a project. */
export function buildAnnouncementSearchUrl(projectId: string): string {
  return `${PROCESS5}/egp-agpc01-web/announcement/search?projectId=${encodeURIComponent(projectId)}`;
}

/** Where the zipId lookup happens. Returns JSON, not a file. */
export function buildZipInfoUrl(projectId: string): string {
  return `${EGP_INFO_ENDPOINT}?projectId=${encodeURIComponent(projectId)}`;
}

/** Direct archive URL, once a zipId is known. */
export function buildDownloadUrl(zipId: string): string {
  return `${EGP_DOWNLOAD_ENDPOINT}?fileId=${encodeURIComponent(zipId)}`;
}

export interface ResolvedDocument {
  projectId: string;
  zipId: string;
  /** e.g. "67119538991_28112567.zip" */
  fileName: string | null;
  downloadUrl: string;
}

/**
 * Resolve a project id to a ready-to-use download URL.
 * Returns null when e-GP publishes no archive for the project.
 */
export async function resolveDownloadUrl(
  projectId: string,
  init: { timeoutMs?: number } = {},
): Promise<ResolvedDocument | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);

  try {
    const res = await fetch(buildZipInfoUrl(projectId), {
      headers: {
        Referer: EGP_REFERER,
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    const body = await res.text();

    if (/Request Rejected|support ID is/i.test(body)) {
      throw new Error("ถูก WAF ปฏิเสธ — ตรวจสอบ Referer header หรือความถี่ของ request");
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} จาก infoProcureDocAnnounZipTemp`);
    }

    const json = JSON.parse(body) as {
      data?: { projectId?: string; zipId?: string; buildName1?: string } | null;
    };

    const zipId = json.data?.zipId;
    if (!zipId) return null;

    return {
      projectId: json.data?.projectId ?? projectId,
      zipId,
      fileName: json.data?.buildName1 ?? null,
      downloadUrl: buildDownloadUrl(zipId),
    };
  } finally {
    clearTimeout(timer);
  }
}
