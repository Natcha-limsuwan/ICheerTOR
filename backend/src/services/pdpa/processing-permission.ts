import ConsentRecord from "../../db/models/consent-record.js";

/* Honour explicit withdrawal for optional matching/notifications.
 * Accounts without a record retain existing service behaviour; that is not
 * evidence of consent. A full consent-enrolment UI/policy remains separate. */
export async function processingAllowed(userId: string): Promise<boolean> {
  const latest = await ConsentRecord.findOne({ userId, purpose: "data_processing" }).sort({ createdAt: -1, _id: -1 }).lean();
  return !latest || latest.granted === true;
}
