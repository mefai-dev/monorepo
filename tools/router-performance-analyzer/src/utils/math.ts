/**
 * Statistical and mathematical utilities for the performance analyzer.
 */

/**
 * Compute the percentile value from a sorted array.
 * Uses linear interpolation between closest ranks.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];

  const rank = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const fraction = rank - lower;

  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

/**
 * Compute the mean of an array of numbers.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute the standard deviation of an array of numbers.
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/**
 * Volume-weighted average: sum(value_i * weight_i) / sum(weight_i).
 */
export function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0 || values.length !== weights.length) return 0;
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = values.reduce((sum, v, i) => sum + v * weights[i], 0);
  return weightedSum / totalWeight;
}

/**
 * Compute the Herfindahl-Hirschman Index for a set of market shares.
 * Input: array of values (not percentages). HHI ranges from 0 to 10000.
 * An HHI below 1500 indicates a well-diversified distribution.
 */
export function computeHHI(values: number[]): number {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total === 0) return 0;
  return values.reduce((hhi, v) => {
    const share = (v / total) * 100;
    return hhi + share * share;
  }, 0);
}

/**
 * Clamp a value to the range [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert a score (0-100) to a letter grade.
 */
export function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Simple linear regression on (x, y) pairs.
 * Returns { slope, intercept, r2 }.
 */
export function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const xMean = mean(xs);
  const yMean = mean(ys);

  let ssXX = 0;
  let ssXY = 0;
  let ssYY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    ssXX += dx * dx;
    ssXY += dx * dy;
    ssYY += dy * dy;
  }

  if (ssXX === 0) return { slope: 0, intercept: yMean, r2: 0 };

  const slope = ssXY / ssXX;
  const intercept = yMean - slope * xMean;
  const r2 = ssYY === 0 ? 0 : (ssXY * ssXY) / (ssXX * ssYY);

  return { slope, intercept, r2 };
}
