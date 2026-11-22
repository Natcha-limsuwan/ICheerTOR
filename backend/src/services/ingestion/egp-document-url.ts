/* Resolve e-GP document URLs from project identifiers without storing PDFs.
 * Look up the archive zipId before building the download URL. Prefer the invitation
 * archive, then the public-hearing draft. Server requests need a Referer header
 * because the upstream WAF otherwise returns an HTML rejection page. */

import { getLatestZipInfo, type ArchiveStage } from "./egp-client";

const PROCESS5 = "https://process5.gprocurement.go.th";

export const EGP_DOWNLOAD_ENDPOINT = `${PROCESS5}/egp-upload-service/v1/downloadFileTest`;
export const EGP_REFERER = `${PROCESS5}/egp-agpc01-web/`;

/* Public e-GP announcement page for a project — what users open. The old
 * "/announcement/search?projectId=" form no longer lands on the project.
 * Behind Cloudflare: works in a browser, not from a server-side fetch. */
export function buildAnnouncementSearchUrl(projectId: string): string {
  return `${PROCESS5}/egp-agpc01-web/announcement?keywordSearch=${encodeURIComponent(projectId)}`;
}

/* Direct archive URL, once a zipId is known. */
export function buildDownloadUrl(zipId: string): string {
  return `${EGP_DOWNLOAD_ENDPOINT}?fileId=${encodeURIComponent(zipId)}`;
}

export interface ResolvedDocument {
  projectId: string;
  zipId: string;
  /* e.g. "67119538991_28112567.zip" */
  fileName: string | null;
  /* "final" = the announced invitation, "draft" = the public-hearing draft. */
  stage: ArchiveStage;
  downloadUrl: string;
}

/* Resolve a project id to a ready-to-use download URL.
 * Returns null when e-GP publishes no archive for the project. */
export async function resolveDownloadUrl(projectId: string): Promise<ResolvedDocument | null> {
  const info = await getLatestZipInfo(projectId);
  if (!info) return null;
  return { ...info, downloadUrl: buildDownloadUrl(info.zipId) };
}
