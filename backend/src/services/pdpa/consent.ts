import ConsentRecord from "../../db/models/consent-record.js";

export const PRIVACY_NOTICE_VERSION = "2026-11-07";
export const DATA_PROCESSING_PURPOSE = "data_processing";

export async function hasProcessingConsent(userId: string): Promise<boolean> {
  const latest = await ConsentRecord.findOne({ userId, purpose: DATA_PROCESSING_PURPOSE })
    .sort({ createdAt: -1, _id: -1 }).lean();
  return latest?.granted === true && latest.noticeVersion === PRIVACY_NOTICE_VERSION;
}
