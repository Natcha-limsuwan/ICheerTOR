/**
 * The Comptroller General's Department e-GP announcement RSS feed — the
 * nationwide source of new announcements, published the same day as
 * process5 and not behind Cloudflare (unlike process5's search page and its
 * Turnstile-gated JSON API, which we do not touch).
 *
 *   GET https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml
 *       ?anounceType=B0|D0|…   (sic — one "n")
 *       &deptId=<4-digit department code>   (optional; omitted = nationwide)
 *
 * Not documented by CGD; described in a 2022 municipal integration guide
 * (kelangnakorn.go.th/kelang/?p=20759). What it returns, as observed:
 *   - RSS 2.0 in Windows-874, with <countbyday> = that day's total
 *   - only the newest 20 items — no paging, no history — so it must be polled
 *     often enough that 20 covers the gap, and every item kept on our side
 *   - item: <title> project name, <link> announcement PDF on process5,
 *     <description> "<projectNumber>, <method>, <announcement type>",
 *     <pubDate> YYYY-MM-DD
 *   - HTTP 429 after ~12 rapid requests; it has also dropped connections
 *     for a day at a time — so: one request at a time, back off, retry later
 */

export const RSS_URL = "https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml";

/** Announcement types the feed accepts. Only B0 and D0 are polled today. */
export const RSS_TYPES = {
  /** Draft bid document for public hearing — ร่างเอกสารประกวดราคา (รับฟังความคิดเห็น). */
  B0: "draft_bidding",
  /** Invitation to bid — ประกาศเชิญชวน. */
  D0: "invitation",
  /** Procurement plan. */
  P0: "plan",
  /** Winner announcement. */
  W0: "winner",
  /** Reference price. */
  "15": "median_price",
} as const;
export type RssAnnounceType = keyof typeof RSS_TYPES;

export interface RssItem {
  projectNumber: string;
  title: string;
  /** e.g. "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)". */
  method: string;
  /** The feed's own label, e.g. "ประกาศเชิญชวน". */
  announceLabel: string;
  announceType: RssAnnounceType;
  /** ISO date. */
  pubDate: string | null;
  /** The announcement PDF on process5. */
  link: string | null;
}

export interface RssFeed {
  announceType: RssAnnounceType;
  countByDay: number | null;
  items: RssItem[];
}

const USER_AGENT = "ICheerTOR/1.0 (student research project; procurement alerts)";
const TIMEOUT_MS = 40_000;
const MAX_ATTEMPTS = 3;
/** Network and quota errors are worth waiting out. */
const RETRYABLE = /\b(429|500|502|503|504)\b|fetch failed|ECONNRESET|ETIMEDOUT|aborted|timeout/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function text(raw: string | undefined): string {
  return (raw ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];

/** Parse the feed's XML (already decoded to a string). Pure — no I/O. */
export function parseRss(xml: string, announceType: RssAnnounceType): RssFeed {
  const count = text(tag(xml, "countbyday"));
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    // "69109098603, ประกวดราคาอิเล็กทรอนิกส์ (e-bidding), ประกาศเชิญชวน"
    const [projectNumber = "", method = "", ...label] = text(tag(body, "description")).split(",").map((s) => s.trim());
    if (!/^\d{8,14}$/.test(projectNumber)) continue;
    const pubDate = text(tag(body, "pubDate"));
    items.push({
      projectNumber,
      title: text(tag(body, "title")),
      method,
      announceLabel: label.join(", "),
      announceType,
      pubDate: /^\d{4}-\d{2}-\d{2}/.test(pubDate) ? pubDate.slice(0, 10) : null,
      link: text(tag(body, "link")) || null,
    });
  }
  return { announceType, countByDay: count && /^\d+$/.test(count) ? Number(count) : null, items };
}

/**
 * Fetch one feed. Retries quota and network errors with a long back-off
 * (30 s, 60 s) — the feed is shared by every agency's website.
 */
export async function fetchRssFeed(
  announceType: RssAnnounceType,
  options: { deptId?: string; onRetry?: (attempt: number, waitMs: number, error: unknown) => void } = {},
): Promise<RssFeed> {
  const qs = new URLSearchParams({ anounceType: announceType });
  if (options.deptId) qs.set("deptId", options.deptId);

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${RSS_URL}?${qs}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} จาก e-GP RSS`);
      const xml = new TextDecoder("windows-874").decode(Buffer.from(await res.arrayBuffer()));
      if (!xml.includes("<rss")) throw new Error(`e-GP RSS ตอบไม่ใช่ RSS: ${xml.slice(0, 120)}`);
      return parseRss(xml, announceType);
    } catch (e) {
      const cause = e instanceof Error && e.cause ? ` ${String(e.cause)}` : "";
      if (attempt >= MAX_ATTEMPTS || !RETRYABLE.test(String(e) + cause)) throw e;
      const waitMs = attempt * 30_000;
      options.onRetry?.(attempt, waitMs, e);
      await sleep(waitMs);
    }
  }
}
