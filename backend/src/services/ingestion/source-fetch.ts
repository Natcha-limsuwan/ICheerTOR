/** Source controls: explicit reviewed origins, robots rules, pacing and cooldown.
 * Rules follow RFC 9309 path precedence; Crawl-delay is honored additionally.
 * Denies missing/error robots and redirects conservatively. Per-process limits;
 * use a single ingestion worker when deploying multiple API instances.
 */
import { env } from "../../config/env.js";
export const SOURCE_USER_AGENT = "ICheerTOR/1.0 (student research project; procurement alerts)";
const TOKEN = "icheertor";
export class SourcePolicyError extends Error {
  constructor(message: string) { super(message); this.name = "SourcePolicyError"; }
}
interface Rule { path: string; allow: boolean }
interface Policy { rules: Rule[]; delayMs: number }
const normalized = (value: string) => encodeURI(value).replace(/%25([0-9a-f]{2})/gi, "%$1")
  .replace(/%([0-9a-f]{2})/gi, (all, hex: string) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    return /[a-z0-9._~-]/i.test(char) ? char : all.toUpperCase();
  });
export function parseRobots(text: string): Policy {
  const groups: Array<{ agents: string[]; rules: Rule[]; delays: number[] }> = [];
  let current: typeof groups[number] | undefined;
  let hasDirectives = false;
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n|\r/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) throw new SourcePolicyError("Unrecognized robots policy; source stopped");
    const [, key, value] = match;
    if (key.toLowerCase() === "user-agent") {
      if (!current || hasDirectives) {
        current = { agents: [], rules: [], delays: [] }; groups.push(current); hasDirectives = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (current) {
      hasDirectives = true;
      if (/^(allow|disallow)$/i.test(key) && value) {
        if (!value.startsWith("/")) throw new SourcePolicyError("Unsupported robots path; source stopped");
        current.rules.push({ path: value, allow: key.toLowerCase() === "allow" });
      }
      if (key.toLowerCase() === "crawl-delay") {
        const delay = Number(value);
        if (!Number.isFinite(delay) || delay < 0) throw new SourcePolicyError("Invalid crawl delay; source stopped");
        current.delays.push(delay * 1000);
      }
    }
  }
  const specific = groups.filter(group => group.agents.includes(TOKEN));
  const selected = specific.length ? specific : groups.filter(group => group.agents.includes("*"));
  return { rules: selected.flatMap(group => group.rules), delayMs: Math.max(0, ...selected.flatMap(group => group.delays)) };
}
export function robotsAllows(policy: Policy, target: URL): boolean {
  const path = normalized(target.pathname + target.search);
  let best = -1, allowed = true;
  for (const rule of policy.rules) {
    const pattern = normalized(rule.path);
    const end = pattern.endsWith("$");
    const body = end ? pattern.slice(0, -1) : pattern;
    const expression = "^" + body.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (end ? "$" : "");
    if (!new RegExp(expression).test(path)) continue;
    const length = Buffer.byteLength(body.replace(/\*/g, ""));
    if (length > best || (length === best && rule.allow)) { best = length; allowed = rule.allow; }
  }
  return allowed;
}

interface Options {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  approvedOrigins?: () => string[];
  minimumDelayMs?: () => number;
}
export function createSourceFetch(options: Options = {}) {
  const request = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const approved = options.approvedOrigins ?? (() => env.SCRAPER_APPROVED_ORIGINS);
  const minimumDelay = options.minimumDelayMs ?? (() => Math.max(1000, env.SCRAPER_RATE_LIMIT_MS || 0));
  const spacingFor = (policy?: Policy) => {
    const configured = minimumDelay();
    return Math.max(1000, Number.isFinite(configured) ? configured : 2000, policy?.delayMs ?? 0);
  };
  const states = new Map<string, { tail: Promise<unknown>; next: number; expires: number; policy?: Policy; failure?: boolean }>();
  return async function sourceFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const target = new URL(input);
    if (!approved().includes(target.origin) || target.username || target.password || target.protocol !== "https:") {
      throw new SourcePolicyError("Source origin has not been reviewed and approved");
    }
    let state = states.get(target.origin);
    if (!state) { state = { tail: Promise.resolve(), next: 0, expires: 0 }; states.set(target.origin, state); }
    const source = state;
    const noteCooldown = (response: Response) => {
      if (response.status !== 429 && response.status !== 503) return;
      const retry = response.headers.get("retry-after");
      const retryMs = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - now() : 0;
      source.next = Math.max(source.next, now() + (Number.isFinite(retryMs) && retryMs > 0 ? Math.max(30_000, retryMs) : 30_000));
    };
    const run = source.tail.catch(() => {}).then(async () => {
      const wait = async () => {
        const delay = Math.max(0, source.next - now());
        if (delay > 60_000) throw new SourcePolicyError("Source cooldown active; try a later ingestion run");
        if (delay) await sleep(delay);
        init.signal?.throwIfAborted();
      };
      await wait();
      if (source.expires <= now()) {
        source.policy = undefined; source.failure = true; source.expires = now() + 60_000;
        try {
          const robots = await request(`${target.origin}/robots.txt`, {
            headers: { "User-Agent": SOURCE_USER_AGENT, Accept: "text/plain" },
            redirect: "manual", signal: AbortSignal.timeout(10_000),
          });
          noteCooldown(robots);
          if (!robots.ok) { await robots.body?.cancel(); throw new SourcePolicyError("Robots policy unavailable; source stopped"); }
          const reader = robots.body?.getReader();
          const chunks: Uint8Array[] = []; let size = 0;
          if (reader) {
            try {
              for (;;) {
                const chunk = await reader.read(); if (chunk.done) break;
                size += chunk.value.length;
                if (size > 512_000) { await reader.cancel(); throw new SourcePolicyError("Robots policy exceeds supported size"); }
                chunks.push(chunk.value);
              }
            } finally { reader.releaseLock(); }
          }
          source.policy = parseRobots(Buffer.concat(chunks).toString("utf8"));
          source.failure = false; source.expires = now() + 60 * 60_000;
        } catch { throw new SourcePolicyError("Cannot verify robots policy; source stopped"); }
        finally { source.next = Math.max(source.next, now() + spacingFor(source.policy)); }
      }
      if (source.failure || !source.policy) throw new SourcePolicyError("Robots policy unavailable; source stopped");
      if (!robotsAllows(source.policy, target)) throw new SourcePolicyError("Source path is disallowed by robots policy");
      await wait();
      const headers = new Headers(init.headers); headers.set("User-Agent", SOURCE_USER_AGENT);
      const spacing = spacingFor(source.policy);
      source.next = now() + spacing;
      try {
        const response = await request(target.href, { ...init, headers, redirect: "manual" });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel(); throw new SourcePolicyError("Source redirect requires separate policy review");
        }
        noteCooldown(response);
        return response;
      } catch (error) { source.next = Math.max(source.next, now() + 30_000); throw error; }
    });
    source.tail = run.then(() => {}, () => {});
    return run;
  };
}
export const sourceFetch = createSourceFetch();
