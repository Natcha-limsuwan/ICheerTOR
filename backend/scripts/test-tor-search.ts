import assert from "node:assert/strict";
import { buildTorSearchFilter, searchTerms } from "../src/services/search/tor-search.js";

type Clause = { $or: Record<string, { $regex: string; $options: string }>[] };
function matches(query: string, record: Record<string, string>): boolean {
  const filter = buildTorSearchFilter(query) as { $and?: Clause[] };
  return (filter.$and ?? []).every((clause) => clause.$or.some((condition) =>
    Object.entries(condition).some(([field, regex]) =>
      new RegExp(regex.$regex, regex.$options).test(record[field] ?? ""))));
}

assert.deepEqual(buildTorSearchFilter("  "), {});
assert.deepEqual(searchTerms('Website website "web application"'), ["website", "web application"]);
assert(matches("เว็บไซต์", { title: "จ้างพัฒนา Website สำหรับหน่วยงาน" }));
assert(matches("website", { title: "จ้างพัฒนาเว็บไซต์" }));
assert(matches("เว็บไซต์ บำรุงรักษา", { title: "Website", "summary.overview": "Maintenance services" }));
assert(!matches("เว็บไซต์ บำรุงรักษา", { title: "Website" }));
assert(matches('"ระบบสารสนเทศ"', { "parsedData.scopeOfWork.content": "พัฒนาระบบสารสนเทศ" }));
assert(!matches('"web app"', { title: "web new app" }));
assert(matches("660123456", { "metadata.projectId": "660123456" }));
assert(matches("cloud", { "parsedData.techRequirements.name": "คลาวด์" }));
assert(!matches("AI", { title: "maintenance" }));
assert(matches("AI", { title: "AI platform" }));
assert(matches("C++", { "parsedData.techRequirements.name": "C++" }));
assert(!matches(".*", { title: "anything" }));
assert(matches(".*", { title: "literal .*" }));
assert.throws(() => buildTorSearchFilter("a".repeat(201)));
assert.throws(() => buildTorSearchFilter(Array.from({ length: 13 }, (_, i) => `term${i}`).join(" ")));
console.log("TOR smart search: 17 assertions passed");
