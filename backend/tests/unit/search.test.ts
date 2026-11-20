import test from "node:test";
import assert from "node:assert/strict";
import { buildTorSearchFilter, searchTerms } from "../../src/services/search/tor-search.js";
function matches(query: string, record: Record<string, string | string[]>) {
  const filter = buildTorSearchFilter(query) as any;
  return (filter.$and ?? []).every((clause: any) => clause.$or.some((condition: any) => Object.entries(condition).some(([field, pattern]: [string, any]) =>
    [record[field]].flat().some(value => typeof value === "string" && new RegExp(pattern.$regex, pattern.$options).test(value)))));
}
test("SEA-01 #139: empty/whitespace search produces no restriction", () => { assert.deepEqual(buildTorSearchFilter(" \t\n"), {}); });
test("SEA-02 #139: Thai-English synonyms work in either direction", () => {
  assert(matches("เว็บไซต์", { title: "Website development" })); assert(matches("website", { title: "พัฒนาเว็บไซต์" }));
});
test("SEA-03 #139: multiple terms use AND across title, summary and tags", () => {
  assert(matches("เว็บไซต์ cloud maintenance", { title: "Website", tags: ["คลาวด์"], "summary.overview": "บำรุงรักษา" }));
  assert(!matches("เว็บไซต์ cloud maintenance", { title: "Website", tags: ["cloud"] }));
});
test("SEA-04 #139: quoted phrases remain contiguous and do not expand aliases", () => {
  assert(matches('"web app"', { title: "a web app project" })); assert(!matches('"web app"', { title: "web new app" }));
  assert(!matches('"website"', { title: "เว็บไซต์" }));
});
test("SEA-05 #139: AI has word boundaries and cannot match maintenance", () => {
  assert(!matches("AI", { title: "maintenance" })); assert(matches("AI", { title: "AI platform" }));
});
test("SEA-06 #139: regex metacharacters are always literal", () => {
  for (const value of [".*", "[x]", "C++", "(a+)+$"]) {
    assert(matches(value, { title: `literal ${value}` })); assert(!matches(value, { title: "unrelated" }));
  }
});
test("SEA-07 #139: case, duplicate keywords and normalized Unicode are stable", () => {
  assert.deepEqual(searchTerms("WEBSITE website"), ["website"]); assert.deepEqual(searchTerms("cafe\u0301"), ["café"]);
});
test("SEA-08 #139: exact supported length/term boundaries accepted, excess rejected", () => {
  assert.doesNotThrow(() => buildTorSearchFilter("a".repeat(200))); assert.throws(() => buildTorSearchFilter("a".repeat(201)));
  const terms = Array.from({ length: 12 }, (_, index) => `term${index}`); assert.doesNotThrow(() => buildTorSearchFilter(terms.join(" ")));
  assert.throws(() => buildTorSearchFilter([...terms, "extra"].join(" ")));
});
test("SEA-09 #139: project number and parsed scope participate in matching", () => {
  assert(matches("69049037572", { "metadata.projectId": "69049037572" })); assert(matches("ระบบสารสนเทศ", { "parsedData.scopeOfWork.content": "พัฒนาระบบสารสนเทศ" }));
});
