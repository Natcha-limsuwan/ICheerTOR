/**
 * Turn RSS candidates into TORRecords.
 *
 * The feed gives only a project number and title, so the record is built
 * from the e-GP documents, read in code (no model call):
 *   agency            announcement heading "ประกาศ<agency>"
 *   reference price   announcement, digits checked against words
 *   budget            bid bond in the bidding document ÷ 5 % (e-GP's rule)
 *   bid date, fees…   announcement (archive-facts.ts)
 * The record then waits in the extraction queue like any other.
 *
 * Projects egp2 already brought in (BMA) are left as they are — both
 * sources key a project by the same hash, so there is one record either way.
 */

import RssCandidate, { type IRssCandidate } from "../../db/models/rss-candidate";
import TORRecord, { type IParsedData, type ITORRecord } from "../../db/models/tor-record";
import { prepareDocuments } from "../ai/tor-parser";
import { fetchProjectArchive } from "./egp-client";
import { buildAnnouncementSearchUrl } from "./egp-document-url";
import { torDedupeHash } from "./dedupe";
import { bidWindow } from "./data-checks";

/** Give up on a candidate whose documents are not published after this many tries. */
export const MAX_INGEST_ATTEMPTS = 5;
/** e-GP sets the bid bond at 5 % of the budget. */
const BID_BOND_SHARE = 0.05;

export type IngestResult = "created" | "exists" | "retry" | "skipped" | "failed";

/** Thai fiscal year (B.E.) of a date: October starts the next year. */
export function thaiFiscalYear(isoDate: string): number {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00+07:00`);
  const be = d.getUTCFullYear() + 543;
  return new Date(d.getTime() + 7 * 3600_000).getUTCMonth() >= 9 ? be + 1 : be;
}

const PHASE: Record<string, ITORRecord["phase"]> = { B0: "public_hearing", D0: "bidding" };

export async function ingestCandidate(c: IRssCandidate): Promise<{ result: IngestResult; note?: string }> {
  const hash = torDedupeHash(c.projectNumber);
  const existing = await TORRecord.findOne({ deduplicationHash: hash }).select("_id").lean();
  if (existing) {
    await RssCandidate.updateOne(
      { _id: c._id },
      { $set: { status: "ingested", torRecordId: existing._id, note: "มีอยู่แล้ว (เช่น จาก egp2)" } },
    );
    return { result: "exists" };
  }

  const archive = await fetchProjectArchive(c.projectNumber);
  if (!archive) {
    // Usually published shortly after the announcement — try again next round.
    const attempts = c.attempts + 1;
    const giveUp = attempts >= MAX_INGEST_ATTEMPTS;
    await RssCandidate.updateOne(
      { _id: c._id },
      { $set: { status: giveUp ? "skipped" : "new", attempts, note: "e-GP ยังไม่มีชุดเอกสาร" } },
    );
    return { result: giveUp ? "skipped" : "retry", note: "e-GP ยังไม่มีชุดเอกสาร" };
  }

  const prepared = await prepareDocuments(archive.zip, { zipFileName: archive.info.fileName, stage: archive.info.stage });
  const facts = prepared.facts;
  const phase = PHASE[c.announceType] ?? "bidding";
  const announced = facts.announcedDate ?? c.pubDate ?? new Date().toISOString().slice(0, 10);
  const fiscalYear = thaiFiscalYear(announced);
  const median = facts.medianPrice?.value ?? null;
  const budget = facts.bidBond ? Math.round(facts.bidBond.value / BID_BOND_SHARE) : undefined;
  const window = bidWindow(facts.submissionDate.closesAt);

  const parsedData: Partial<IParsedData> = {
    medianPrice: { value: median, confidence: median != null ? 1 : 0, source: median != null ? "announcement" : null },
    keyDates: {
      documentStage: facts.documentStage,
      announcedDate: facts.announcedDate,
      submissionDate: facts.submissionDate,
      documentFeePeriod: facts.documentFeePeriod,
      announcementDates: facts.announcementDates,
      contractDurationDays: facts.contractDuration
        ? { value: facts.contractDuration.days, confidence: 1, rawText: facts.contractDuration.rawText, source: "bidding_doc" }
        : { value: null, confidence: 0, rawText: null, source: null },
      warrantyMonths: { value: null, confidence: 0 },
    },
  };

  const tags = ["software", `y${fiscalYear}`, phase];
  if (/e-bidding/i.test(c.method ?? "")) tags.push("e-bidding");
  if (window.state !== "closed") tags.push("open");

  const portalUrl = buildAnnouncementSearchUrl(c.projectNumber);
  const res = await TORRecord.updateOne(
    { deduplicationHash: hash },
    {
      // Insert only: if egp2 created it in the meantime, leave egp2's record.
      $setOnInsert: {
        title: c.title,
        agencyName: facts.agencyName ?? "ไม่ทราบหน่วยงาน",
        phase,
        ...(median != null ? { medianPrice: median } : {}),
        ...(budget != null ? { budget } : {}),
        postingDate: new Date(`${announced}T00:00:00+07:00`),
        ...(facts.submissionDate.closesAt ? { submissionDeadline: facts.submissionDate.closesAt } : {}),
        sourceUrl: portalUrl,
        officialPortalUrl: portalUrl,
        deduplicationHash: hash,
        tags,
        parsedData,
        sourceDocuments: prepared.sourceDocuments,
        extractionStatus: "pending",
        metadata: {
          source: "egp-rss",
          projectId: c.projectNumber,
          announceType: c.announceLabel || c.announceType,
          purchaseMethod: c.method,
          deptCode: facts.deptCode,
          filterScore: c.filterScore,
          filterReason: c.filterReason,
          phaseReason: `จาก RSS e-GP: ${c.announceLabel || c.announceType}`,
        },
      },
    },
    { upsert: true },
  );

  const record = await TORRecord.findOne({ deduplicationHash: hash }).select("_id").lean();
  await RssCandidate.updateOne(
    { _id: c._id },
    {
      $set: {
        status: "ingested",
        torRecordId: record?._id,
        note: res.upsertedCount ? `${facts.agencyName ?? "ไม่ทราบหน่วยงาน"}` : "มีอยู่แล้ว",
      },
    },
  );
  return { result: res.upsertedCount ? "created" : "exists", note: facts.agencyName ?? undefined };
}

/**
 * A project that shows up in the invitation feed (D0) has left its public
 * hearing. Draft announcements carry no hearing-close date, so for projects
 * egp2 does not cover this sighting is the only signal. The bid date is
 * filled by the next `extract --refresh-dates`, which also re-queues the TOR
 * for the model if the final version changed.
 */
export async function promoteToBidding(projectNumbers: string[]): Promise<string[]> {
  if (!projectNumbers.length) return [];
  const records = await TORRecord.find({
    deduplicationHash: { $in: projectNumbers.map(torDedupeHash) },
    phase: "public_hearing",
  })
    .select("_id tags metadata.projectId")
    .lean();
  for (const r of records) {
    await TORRecord.updateOne(
      { _id: r._id },
      {
        $set: {
          phase: "bidding",
          tags: [...new Set((r.tags ?? []).map((t) => (t === "public_hearing" ? "bidding" : t)))],
          "metadata.phaseReason": "RSS e-GP: ออกประกาศเชิญชวนแล้ว",
        },
      },
    );
  }
  return records.map((r) => r.metadata?.projectId ?? String(r._id));
}
