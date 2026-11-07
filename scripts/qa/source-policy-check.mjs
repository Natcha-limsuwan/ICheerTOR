/** Read-only policy evidence: one robots request per origin, no scraping. */
import { writeFile, mkdir } from "node:fs/promises";
const results = [];
for (const origin of ["https://egp2.bangkok.go.th", "https://process.gprocurement.go.th", "https://process5.gprocurement.go.th"]) {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": "ICheerTOR-QA/1.0 (student project; policy check only)" },
      redirect: "follow", signal: AbortSignal.timeout(15000),
    });
    const content = (await response.text()).slice(0, 8000);
    const looksLikeRobots = /^(user-agent|allow|disallow|sitemap)\s*:/im.test(content) && !/<html/i.test(content);
    results.push({ origin, status: response.status, contentType: response.headers.get("content-type"),
      robotsText: looksLikeRobots ? content : null,
      conclusion: looksLikeRobots ? "Rules retrieved; source terms/permission still require review" : "No usable robots policy obtained; not an authorization to scrape" });
  } catch (error) {
    results.push({ origin, status: null, error: error.message, conclusion: "Unreachable; not an authorization to scrape" });
  }
  console.log(`${origin}: ${results.at(-1).status ?? results.at(-1).error}`);
}
await mkdir("docs/qa/evidence", { recursive: true });
await writeFile("docs/qa/evidence/source-policy-results.json", JSON.stringify({
  method: "One read-only robots.txt request per origin; no scraping, retries, or WAF bypass",
  results, limitations: "This checks retrieval only. It neither implements robots enforcement nor approves source terms.",
}, null, 2) + "\n");
