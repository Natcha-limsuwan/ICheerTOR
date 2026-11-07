import test from "node:test";
import assert from "node:assert/strict";
import { confidenceMetrics } from "../../src/services/ai/confidence-metrics.js";
test("CAL-01: empty observations return unknown metrics, not a perfect score", () => {
  const result = confidenceMetrics([]);
  assert.equal(result.count, 0); assert.equal(result.accuracy, null); assert.equal(result.brierScore, null); assert.equal(result.expectedCalibrationError, null);
});
test("CAL-02: overconfidence and bin boundaries are counted accurately", () => {
  const result = confidenceMetrics([{ confidence: 0, correct: false }, { confidence: 0.6, correct: true }, { confidence: 0.8, correct: false }, { confidence: 1, correct: true }]);
  assert.deepEqual(result.bins.map(bin => bin.count), [1, 1, 2]);
  assert.equal(result.accuracy, 0.5); assert.ok(Math.abs(result.brierScore! - 0.2) < 1e-12);
  assert.ok(Math.abs(result.expectedCalibrationError! - 0.3) < 1e-12);
});
test("CAL-03: invalid confidence or nonboolean correctness is rejected", () => {
  for (const confidence of [-1, 1.01, NaN, Infinity]) assert.throws(() => confidenceMetrics([{ confidence, correct: true }]));
  assert.throws(() => confidenceMetrics([{ confidence: 0.9, correct: "true" as any }]));
});
