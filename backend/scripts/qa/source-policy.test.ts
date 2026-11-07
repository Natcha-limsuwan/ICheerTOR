import test from "node:test";
import assert from "node:assert/strict";
import { createSourceFetch, parseRobots, robotsAllows, SourcePolicyError } from "../../src/services/ingestion/source-fetch.js";
const origin = "https://source.example.invalid";
function fixture(robots: string | number | Error = "User-agent: *\nAllow: /\nCrawl-delay: 1", statuses: Array<number | Error> = []) {
  let clock = 0;
  const calls: Array<{ url: string; time: number; init?: RequestInit }> = [];
  const client = createSourceFetch({
    now: () => clock, sleep: async ms => { clock += ms; }, minimumDelayMs: () => 1000, approvedOrigins: () => [origin],
    fetch: async (input, init) => {
      const url = String(input); calls.push({ url, time: clock, init });
      if (url.endsWith("/robots.txt")) {
        if (robots instanceof Error) throw robots;
        return typeof robots === "number" ? new Response("", { status: robots }) : new Response(robots);
      }
      const next = statuses.shift() ?? 200;
      if (next instanceof Error) throw next;
      return new Response("fixture", { status: next, headers: next === 429 ? { "Retry-After": "45" } : {} });
    },
  });
  return { client, calls };
}
test("SRC-01: unapproved origin refused before requesting robots", async () => {
  let called = false;
  const client = createSourceFetch({ approvedOrigins: () => [], fetch: async () => { called = true; return new Response(""); } });
  await assert.rejects(client(`${origin}/api`), SourcePolicyError); assert.equal(called, false);
});
test("SRC-02: Disallow / stops RSS even on an approved origin", async () => {
  const { client, calls } = fixture("User-agent: *\nDisallow: /");
  await assert.rejects(client(`${origin}/EPROCRssFeedWeb/egpannouncerss.xml`), /disallowed/);
  assert.deepEqual(calls.map(call => call.url), [`${origin}/robots.txt`]);
});
test("SRC-03: longest rule, Allow tie, merged groups, wildcards and percent paths", () => {
  const policy = parseRobots("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /*.pdf$\nAllow: /public/\nUser-agent: *\nDisallow: /admin/\nAllow: /api/public/");
  for (const path of ["/appapi/api/Projects", "/api/public/x", "/public/a.pdf"]) assert.equal(robotsAllows(policy, new URL(origin + path)), true, path);
  for (const path of ["/api/private", "/admin/x", "/file.pdf"]) assert.equal(robotsAllows(policy, new URL(origin + path)), false, path);
  const specific = parseRobots("User-agent: *\nDisallow: /\nUser-agent: ICheerTOR\nDisallow: /secret\nUser-agent: icheertor\nAllow: /secret\nDisallow: /foo");
  assert.equal(robotsAllows(specific, new URL(origin + "/secret")), true);
  assert.equal(robotsAllows(specific, new URL(origin + "/%66oo")), false);
  assert.equal(robotsAllows(specific, new URL(origin + "/other")), true);
});
test("SRC-04: missing/error/malformed robots denies access and is cached briefly", async () => {
  for (const robots of [404, 503, new Error("synthetic robots timeout"), "<html>blocked</html>", "User-agent: *\nCrawl-delay: garbage"]) {
    const { client, calls } = fixture(robots);
    await assert.rejects(client(`${origin}/a`), SourcePolicyError);
    await assert.rejects(client(`${origin}/b`), SourcePolicyError); assert.equal(calls.length, 1);
  }
});
test("SRC-05: concurrent requests share robots and preserve crawl delay", async () => {
  const { client, calls } = fixture("User-agent: *\nAllow: /\nCrawl-delay: 2");
  await Promise.all([client(`${origin}/a`), client(`${origin}/b`), client(`${origin}/c`)]);
  assert.deepEqual(calls.map(call => call.time), [0, 2000, 4000, 6000]);
  for (const call of calls) assert.equal(call.init?.redirect, "manual");
  assert.match(new Headers(calls[1].init?.headers).get("user-agent")!, /ICheerTOR/);
});
test("SRC-06: 429 Retry-After applies to the next caller", async () => {
  const { client, calls } = fixture(undefined, [429, 200]);
  assert.equal((await client(`${origin}/a`)).status, 429); await client(`${origin}/b`);
  assert.equal(calls[2].time - calls[1].time, 45_000);
});
test("SRC-07: content redirects blocked and never followed", async () => {
  const { client, calls } = fixture(undefined, [302]);
  await assert.rejects(client(`${origin}/a`), /redirect/); assert.equal(calls.length, 2);
});
test("SRC-08: network failure delays the next caller", async () => {
  const { client, calls } = fixture(undefined, [new Error("synthetic timeout"), 200]);
  await assert.rejects(client(`${origin}/a`), /timeout/); await client(`${origin}/b`);
  assert.equal(calls[2].time - calls[1].time, 30_000);
});
