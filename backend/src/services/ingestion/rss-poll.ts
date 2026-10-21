/**
 * One poll of the e-GP RSS feed: find announcements not seen before, keep
 * the ones whose title is confidently software work, remember the window.
 *
 * Nothing here downloads documents or calls the model — rss-ingest.ts turns
 * kept candidates into TORRecords.
 */

import RssCandidate from "../../db/models/rss-candidate";
import RssPollState from "../../db/models/rss-poll-state";
import { fetchRssFeed, type RssAnnounceType, type RssItem } from "./egp-rss-client";
import { scoreSoftware } from "./software-filter";
import { promoteToBidding } from "./rss-ingest";

/** The feed never returns more than this many items. */
export const RSS_WINDOW = 20;

export interface WindowDiff {
  fresh: RssItem[];
  /**
   * None of a full window was in the previous one: items may have scrolled
   * past between polls. Only meaningful when there was a previous window.
   */
  gap: boolean;
}

export function diffWindow(previous: string[], items: RssItem[]): WindowDiff {
  const seen = new Set(previous);
  const fresh = items.filter((i) => !seen.has(i.projectNumber));
  const gap = previous.length > 0 && items.length >= RSS_WINDOW && fresh.length === items.length;
  return { fresh, gap };
}

export type TitleVerdict = "kept" | "uncertain" | "rejected";

/** Kept = the software filter is sure. Uncertain titles are counted, not stored. */
export function classifyTitle(title: string): { verdict: TitleVerdict; score: number; reason: string } {
  const r = scoreSoftware(title);
  return {
    verdict: r.isSoftware && !r.isUncertain ? "kept" : r.isSoftware ? "uncertain" : "rejected",
    score: r.score,
    reason: r.reason,
  };
}

export interface TypePollResult {
  announceType: RssAnnounceType;
  ok: boolean;
  error?: string;
  countByDay: number | null;
  items: number;
  fresh: number;
  kept: number;
  uncertain: number;
  gap: boolean;
  keptItems: Array<{ projectNumber: string; title: string; score: number }>;
  /** Records moved from public hearing to bidding because they appeared in D0. */
  promoted: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Between feed requests in one poll — the feed answers 429 to bursts. */
const BETWEEN_REQUESTS_MS = 5_000;

export async function pollOnce(
  types: RssAnnounceType[],
  options: { dryRun?: boolean; onRetry?: (type: RssAnnounceType, attempt: number, waitMs: number) => void } = {},
): Promise<TypePollResult[]> {
  const results: TypePollResult[] = [];

  for (const [i, type] of types.entries()) {
    if (i > 0) await sleep(BETWEEN_REQUESTS_MS);
    const state = await RssPollState.findOne({ announceType: type }).lean();
    const now = new Date();
    try {
      const feed = await fetchRssFeed(type, { onRetry: (attempt, waitMs) => options.onRetry?.(type, attempt, waitMs) });
      const { fresh, gap } = diffWindow(state?.lastWindow ?? [], feed.items);

      const keptItems: TypePollResult["keptItems"] = [];
      let uncertain = 0;
      for (const item of fresh) {
        const c = classifyTitle(item.title);
        if (c.verdict === "uncertain") uncertain++;
        if (c.verdict !== "kept") continue;
        keptItems.push({ projectNumber: item.projectNumber, title: item.title, score: c.score });
        if (options.dryRun) continue;
        // Insert once; a project seen again (B0 then D0) keeps its first entry.
        await RssCandidate.updateOne(
          { projectNumber: item.projectNumber },
          {
            $setOnInsert: {
              projectNumber: item.projectNumber,
              announceType: type,
              title: item.title,
              method: item.method,
              announceLabel: item.announceLabel,
              pubDate: item.pubDate,
              firstSeenAt: now,
              filterScore: c.score,
              filterReason: c.reason,
              status: "new",
              attempts: 0,
            },
          },
          { upsert: true },
        );
      }

      const promoted =
        type === "D0" && !options.dryRun ? await promoteToBidding(fresh.map((x) => x.projectNumber)) : [];

      if (!options.dryRun) {
        await RssPollState.updateOne(
          { announceType: type },
          {
            $set: {
              lastWindow: feed.items.map((x) => x.projectNumber),
              lastPolledAt: now,
              lastSuccessAt: now,
              lastCountByDay: feed.countByDay,
              lastError: null,
            },
            $inc: {
              "stats.polls": 1,
              "stats.seen": fresh.length,
              "stats.kept": keptItems.length,
              "stats.uncertain": uncertain,
              "stats.gaps": gap ? 1 : 0,
            },
          },
          { upsert: true },
        );
      }

      results.push({
        announceType: type,
        ok: true,
        countByDay: feed.countByDay,
        items: feed.items.length,
        fresh: fresh.length,
        kept: keptItems.length,
        uncertain,
        gap,
        keptItems,
        promoted,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (!options.dryRun) {
        await RssPollState.updateOne(
          { announceType: type },
          { $set: { lastPolledAt: now, lastError: error.slice(0, 500) }, $inc: { "stats.polls": 1, "stats.failures": 1 } },
          { upsert: true },
        );
      }
      results.push({
        announceType: type,
        ok: false,
        error,
        countByDay: null,
        items: 0,
        fresh: 0,
        kept: 0,
        uncertain: 0,
        gap: false,
        keptItems: [],
        promoted: [],
      });
    }
  }
  return results;
}
