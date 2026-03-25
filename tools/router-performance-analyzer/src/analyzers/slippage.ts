/**
 * Slippage Analyzer.
 *
 * Compares estimated slippage (at bid time) to actual slippage (at execution)
 * to identify systematic estimation errors, per-route patterns, and outliers
 * that may indicate AMM pool imbalances or stale price data.
 */

import { SlippageRecord, SlippageAnalysis } from "../types";
import { mean, standardDeviation, weightedMean, clamp } from "../utils/math";

/**
 * Build a slippage analysis from raw transfer records.
 */
export function analyzeSlippage(
  routerAddress: string,
  records: SlippageRecord[],
): SlippageAnalysis {
  const filtered = records.filter(
    (r) => r.routerAddress.toLowerCase() === routerAddress.toLowerCase(),
  );

  if (filtered.length === 0) {
    return emptyAnalysis(routerAddress);
  }

  const estimatedValues = filtered.map((r) => r.estimatedSlippageBps);
  const actualValues = filtered.map((r) => r.actualSlippageBps);
  const deviations = filtered.map((r) => r.deviationBps);
  const weights = filtered.map((r) => Number(r.transferAmount) || 1);

  const underestimateCount = filtered.filter((r) => r.actualSlippageBps > r.estimatedSlippageBps).length;

  // Per-route breakdown
  const routeGroups: Record<string, SlippageRecord[]> = {};
  for (const rec of filtered) {
    const key = `${rec.originDomain}->${rec.destinationDomain}`;
    if (!routeGroups[key]) routeGroups[key] = [];
    routeGroups[key].push(rec);
  }

  const perRoute: SlippageAnalysis["perRoute"] = {};
  for (const [route, routeRecords] of Object.entries(routeGroups)) {
    perRoute[route] = {
      avgEstimatedBps: Math.round(mean(routeRecords.map((r) => r.estimatedSlippageBps)) * 100) / 100,
      avgActualBps: Math.round(mean(routeRecords.map((r) => r.actualSlippageBps)) * 100) / 100,
      avgDeviationBps: Math.round(mean(routeRecords.map((r) => r.deviationBps)) * 100) / 100,
      count: routeRecords.length,
    };
  }

  return {
    routerAddress,
    totalTransfers: filtered.length,
    avgEstimatedBps: Math.round(mean(estimatedValues) * 100) / 100,
    avgActualBps: Math.round(mean(actualValues) * 100) / 100,
    avgDeviationBps: Math.round(mean(deviations) * 100) / 100,
    volumeWeightedDeviationBps: Math.round(weightedMean(deviations, weights) * 100) / 100,
    deviationStdBps: Math.round(standardDeviation(deviations) * 100) / 100,
    underestimatePct:
      filtered.length > 0
        ? Math.round((underestimateCount / filtered.length) * 10000) / 100
        : 0,
    perRoute,
  };
}

/**
 * Score slippage accuracy (0-100).
 *
 * A perfect score means estimated slippage always matches actual slippage.
 * Penalties for:
 * - Large average deviation (systematic bias)
 * - High deviation standard deviation (unpredictability)
 * - High underestimate rate (users get worse than quoted)
 */
export function scoreSlippage(analysis: SlippageAnalysis): number {
  if (analysis.totalTransfers === 0) return 50; // Neutral when no data

  // Deviation penalty: 100 at 0bps deviation, 0 at 100bps deviation
  const absDeviation = Math.abs(analysis.avgDeviationBps);
  const deviationScore = clamp(100 - absDeviation, 0, 100);

  // Consistency: penalize high std deviation
  const consistencyScore = clamp(100 - analysis.deviationStdBps * 2, 0, 100);

  // Underestimate penalty: users care more about actual > estimated
  const underestimateScore = clamp(100 - analysis.underestimatePct, 0, 100);

  return Math.round(
    (deviationScore * 0.4 + consistencyScore * 0.3 + underestimateScore * 0.3) * 100,
  ) / 100;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyAnalysis(routerAddress: string): SlippageAnalysis {
  return {
    routerAddress,
    totalTransfers: 0,
    avgEstimatedBps: 0,
    avgActualBps: 0,
    avgDeviationBps: 0,
    volumeWeightedDeviationBps: 0,
    deviationStdBps: 0,
    underestimatePct: 0,
    perRoute: {},
  };
}
