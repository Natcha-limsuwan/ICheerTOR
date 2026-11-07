/** Descriptive calibration metrics; callers must supply independently checked
 * correctness labels. Small samples do not establish calibration quality. */
export interface ConfidenceObservation { confidence: number; correct: boolean }
export function confidenceMetrics(observations: ConfidenceObservation[]) {
  for (const observation of observations) {
    if (!Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1
      || typeof observation.correct !== "boolean") throw new Error("Invalid confidence observation");
  }
  const bins = [[0, 0.6], [0.6, 0.8], [0.8, 1]].map(([lower, upper], index) => {
    const values = observations.filter(value => value.confidence >= lower && (index === 2 ? value.confidence <= upper : value.confidence < upper));
    return { lower, upper, count: values.length,
      meanConfidence: values.length ? values.reduce((sum, value) => sum + value.confidence, 0) / values.length : null,
      accuracy: values.length ? values.filter(value => value.correct).length / values.length : null };
  });
  const count = observations.length;
  return { count, bins, accuracy: count ? observations.filter(value => value.correct).length / count : null,
    brierScore: count ? observations.reduce((sum, value) => sum + (value.confidence - Number(value.correct)) ** 2, 0) / count : null,
    expectedCalibrationError: count ? bins.reduce((sum, bin) => sum + bin.count / count * Math.abs((bin.accuracy ?? 0) - (bin.meanConfidence ?? 0)), 0) : null };
}
