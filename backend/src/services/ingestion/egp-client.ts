/**
 * Client for the e-GP document pipeline on process5.gprocurement.go.th.
 *
 * The chain, verified end to end against real BMA projects:
 *   project_id  →  infoProcureDocAnnounZip(Temp)  →  zipId
 *               →  downloadFileTest               →  ZIP archive
 *               →  (unzip elsewhere)              →  TOR PDF
 *
 * Two archives per project:
 *   infoProcureDocAnnounZip      the invitation as announced ("final") —
 *                                the forms carry the bid date and time
 *   infoProcureDocAnnounZipTemp  the public-hearing draft ("draft") — the
 *                                same forms with the dates left blank
 * A project without a hearing returns the same archive from both; one still
 * in its hearing has only the draft. fetchProjectArchive takes the final one
 * when it exists — reading only the draft is why every bid date came back
 * blank before.
 *
 * A Referer header is mandatory on every call. Without it the WAF returns a
 * 200 whose body is "Request Rejected" — not an auth failure, so it is easy
 * to misread as the endpoint being closed. It is not: no login is required.
 *
 * PDPA: archives may contain documents naming individuals (bid bonds,
 * signatories). Extract only what is needed and filter before persisting.
 */

const PROCESS5 = "https://process5.gprocurement.go.th";
const APPROVAL_SERVICE = `${PROCESS5}/egp-approval-service/apv-common`;
const UPLOAD_SERVICE = `${PROCESS5}/egp-upload-service/v1`;

/** Any page under the e-GP web app satisfies the WAF's Referer check. */
const REFERER = `${PROCESS5}/egp-agpc01-web/`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const INFO_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Archives run to a few MB; anything far larger is a red flag, not a TOR. */
const MAX_ZIP_BYTES = 80 * 1024 * 1024;

export class EgpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "EgpError";
  }
}

function baseHeaders(): Record<string, string> {
  return {
    "User-Agent": UA,
    Referer: REFERER,
    "Accept-Language": "th,en;q=0.9",
  };
}

/** The WAF answers with HTTP 200 and an HTML rejection page. */
function assertNotBlocked(body: string): void {
  if (/Request Rejected|support ID is/i.test(body)) {
    throw new EgpError(
      "ถูก WAF ปฏิเสธ — ตรวจสอบว่าได้ส่ง Referer header หรือยิงถี่เกินไป",
    );
  }
}

export type ArchiveStage = "final" | "draft";

const ZIP_INFO_ENDPOINT: Record<ArchiveStage, string> = {
  final: "infoProcureDocAnnounZip",
  draft: "infoProcureDocAnnounZipTemp",
};

export interface ZipInfo {
  projectId: string;
  zipId: string;
  /** e.g. "67119538991_28112567.zip" — carries the project id and post date. */
  fileName: string | null;
  stage: ArchiveStage;
}

/**
 * Resolve a project id to the id of its document archive.
 * Returns null when the project has no published archive.
 */
export async function getZipInfo(projectId: string, stage: ArchiveStage = "final"): Promise<ZipInfo | null> {
  const endpoint = ZIP_INFO_ENDPOINT[stage];
  const url = `${APPROVAL_SERVICE}/${endpoint}?projectId=${encodeURIComponent(projectId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INFO_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { ...baseHeaders(), Accept: "application/json, text/plain, */*" },
      signal: controller.signal,
    });
    const body = await res.text();
    assertNotBlocked(body);

    if (!res.ok) {
      throw new EgpError(`HTTP ${res.status} จาก ${endpoint}`, res.status);
    }

    const json = JSON.parse(body) as {
      response?: { responseCode?: string; description?: string };
      data?: { projectId?: string; zipId?: string; buildName1?: string } | null;
    };

    const zipId = json.data?.zipId;
    if (!zipId) return null;

    return {
      projectId: json.data?.projectId ?? projectId,
      zipId,
      fileName: json.data?.buildName1 ?? null,
      stage,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Download the document archive for a resolved zipId. */
export async function downloadZip(zipId: string): Promise<Buffer> {
  const url = `${UPLOAD_SERVICE}/downloadFileTest?fileId=${encodeURIComponent(zipId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers: baseHeaders(), signal: controller.signal });

    if (!res.ok) {
      throw new EgpError(`HTTP ${res.status} ขณะดาวน์โหลด ZIP`, res.status);
    }

    const buf = Buffer.from(await res.arrayBuffer());

    // A rejection page is small and HTML; check bytes rather than trusting status.
    if (buf.length < 1024) {
      assertNotBlocked(buf.toString("utf-8"));
    }
    if (buf.length > MAX_ZIP_BYTES) {
      throw new EgpError(`ไฟล์ใหญ่เกินกำหนด (${buf.length} bytes)`);
    }
    // PK\x03\x04
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
      throw new EgpError(`ไฟล์ที่ได้ไม่ใช่ ZIP (ขึ้นต้นด้วย ${buf.subarray(0, 4).toString("hex")})`);
    }

    return buf;
  } finally {
    clearTimeout(timer);
  }
}

/** The newest archive: the announced invitation, else the hearing draft. */
export async function getLatestZipInfo(projectId: string): Promise<ZipInfo | null> {
  return (await getZipInfo(projectId, "final")) ?? (await getZipInfo(projectId, "draft"));
}

/** Convenience: project id straight to the newest archive's bytes. */
export async function fetchProjectArchive(
  projectId: string,
): Promise<{ info: ZipInfo; zip: Buffer } | null> {
  const info = await getLatestZipInfo(projectId);
  if (!info) return null;
  return { info, zip: await downloadZip(info.zipId) };
}
