import test from "node:test";
import assert from "node:assert/strict";
import { extractionFixture } from "../fixtures/extraction.js";
import { validateExtraction } from "../../src/services/ai/validate-extraction.js";
import { resolvePrices } from "../../src/services/ai/resolve-prices.js";
import { readArchiveFacts } from "../../src/services/ingestion/archive-facts.js";
import { toRecordUpdate } from "../../src/services/ai/tor-parser.js";

test("PAR-01 #138: valid structured output retains scope, qualification, price and evaluation", () => {
  const input = extractionFixture(), result = validateExtraction(input, {});
  assert.equal(result.output.scopeOfWork.summary, "Develop a website"); assert.equal(result.output.qualifications[0].minimumNumber, 600000);
  assert.equal(result.output.medianPrice.value, 1000000); assert.equal(result.output.evaluationCriteria.method, "lowest_price");
  assert.deepEqual(input, extractionFixture(), "validation must not mutate the input");
});
test("PAR-02 #138: Thai amount words correct a digit misread and retain evidence", () => {
  const input = extractionFixture(); input.medianPrice.value = 800000; input.medianPrice.amountWords = "หนึ่งล้านบาทถ้วน";
  const result = validateExtraction(input, {}); assert.equal(result.output.medianPrice.value, 1000000);
  assert(result.issues.some(issue => issue.field === "medianPrice.value" && issue.severity === "corrected"));
});
test("PAR-03 #138: license term is not invented as implementation duration", () => {
  const input = extractionFixture(); input.scopeOfWork.contractDurationDays = 1095; input.scopeOfWork.contractDurationText = "Subscription license ระยะเวลา 3 ปี";
  assert.equal(validateExtraction(input, {}).output.scopeOfWork.contractDurationDays, null);
});
test("PAR-04 #138: null numeric requirement clears its unit instead of becoming zero", () => {
  const input = extractionFixture(); input.qualifications[0].minimumNumber = null;
  const result = validateExtraction(input, {}); assert.equal(result.output.qualifications[0].minimumNumber, null); assert.equal(result.output.qualifications[0].unit, null);
});
test("PAR-05 #138: low confidence creates a review issue rather than disappearing", () => {
  const input = extractionFixture(); input.qualifications[0].confidence = 0.2;
  const result = validateExtraction(input, {}); assert.equal(result.needsReview, true); assert.equal(result.output.qualifications.length, 1);
});
test("PAR-06 #138: silence and equivalent wording are not document conflicts", () => {
  const input = extractionFixture(); input.documentConflicts = [
    { topic: "same", torText: "12 เดือน", biddingDocText: "12 เดือน", torPage: 1 },
    { topic: "missing", torText: "ไม่ระบุ", biddingDocText: "12 เดือน", torPage: 1 },
    { topic: "different", torText: "12 เดือน", biddingDocText: "24 เดือน", torPage: 1 },
  ];
  assert.deepEqual(validateExtraction(input, {}).output.documentConflicts.map(conflict => conflict.topic), ["different"]);
});
test("PAR-07 #138: disagreement between official figures requires review, not silent overwrite", () => {
  const prices = resolvePrices({ egp2Budget: 2000000, egp2MedianPrice: 1000000,
    facts: { medianPrice: { value: 1200000 } as any, bidBond: null }, documentFigures: [1200000] });
  assert.equal(prices.medianPrice.value, 1000000); assert.equal(prices.medianPrice.confidence, 0.5);
  assert(prices.issues.some(issue => issue.severity === "review"));
});
test("PAR-08 #138: final record preserves confidence per field and a separately computed deadline", () => {
  const input = extractionFixture(), facts = readArchiveFacts([]);
  const record = toRecordUpdate(input, facts, [], { phase: "bidding", budget: 2000000 });
  assert.equal(record.summary.confidence, 0.91); assert.equal(record.parsedData.qualifications?.[0].confidence, 0.92);
  assert.equal(record.parsedData.documentPrices?.medianPrice?.confidence, 0.9);
  assert.equal(record.parsedData.medianPrice?.confidence, 0, "an absent authoritative price must not inherit model confidence");
  assert.equal(record.parsedData.evaluationCriteria?.confidence, 0.95);
  assert.equal(record.submissionDeadline, null);
});
