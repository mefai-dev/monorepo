/**
 * Auction Performance Analyzer.
 *
 * Evaluates router bidding behaviour in the Connext sequencer auction system.
 * Computes win rates, latency distributions, and per-route breakdowns to
 * identify bottlenecks and competitive disadvantages.
 */

import { AuctionBidRecord, AuctionPerformanceMetrics } from "../types";
import { mean, percentile, clamp } from "../utils/math";

/**
 * Build auction performance metrics from raw bid records.
 */
export function analyzeAuctionPerformance(
  routerAddress: string,
  bids: AuctionBidRecord[],
): AuctionPerformanceMetrics {
  const routerBids = bids.filter(
    (b) => b.routerAddress.toLowerCase() === routerAddress.toLowerCase(),
  );

  const totalBids = routerBids.length;
  const wonBids = routerBids.filter((b) => b.won).length;
  const winRate = totalBids > 0 ? wonBids / totalBids : 0;

  // Latency distribution
  const latencies = routerBids.map((b) => b.latencyMs).sort((a, b) => a - b);
  const avgLatencyMs = mean(latencies);
  const p50LatencyMs = percentile(latencies, 50);
  const p95LatencyMs = percentile(latencies, 95);
  const p99LatencyMs = percentile(latencies, 99);

  // Per-route breakdowns
  const routeGroups = groupByRoute(routerBids);
  const winRateByRoute: Record<string, number> = {};
  const avgLatencyByRoute: Record<string, number> = {};

  for (const [route, routeBids] of Object.entries(routeGroups)) {
    const routeWon = routeBids.filter((b) => b.won).length;
    winRateByRoute[route] = routeBids.length > 0 ? routeWon / routeBids.length : 0;
    avgLatencyByRoute[route] = mean(routeBids.map((b) => b.latencyMs));
  }

  return {
    routerAddress,
    totalBids,
    wonBids,
    winRate: Math.round(winRate * 10000) / 10000,
    avgLatencyMs: Math.round(avgLatencyMs),
    p50LatencyMs: Math.round(p50LatencyMs),
    p95LatencyMs: Math.round(p95LatencyMs),
    p99LatencyMs: Math.round(p99LatencyMs),
    winRateByRoute,
    avgLatencyByRoute,
  };
}

/**
 * Score auction performance (0-100).
 *
 * Factors:
 * - Win rate (higher is better, target > 0.5)
 * - p95 latency (lower is better, target < 30s)
 * - Consistency across routes (low variance is better)
 */
export function scoreAuction(metrics: AuctionPerformanceMetrics): number {
  if (metrics.totalBids === 0) return 50; // Neutral score when no data

  // Win rate score: 100 at winRate=1, 0 at winRate=0
  const winScore = metrics.winRate * 100;

  // Latency score: 100 at 0ms, 0 at 120s
  const maxAcceptableLatency = 120_000;
  const latencyScore = clamp(100 - (metrics.p95LatencyMs / maxAcceptableLatency) * 100, 0, 100);

  // Route consistency: penalize high variance in win rates
  const routeWinRates = Object.values(metrics.winRateByRoute);
  let consistencyScore = 100;
  if (routeWinRates.length > 1) {
    const routeMean = mean(routeWinRates);
    const routeVariance =
      routeWinRates.reduce((sum, r) => sum + (r - routeMean) ** 2, 0) / routeWinRates.length;
    consistencyScore = clamp(100 - routeVariance * 400, 0, 100);
  }

  return Math.round((winScore * 0.5 + latencyScore * 0.3 + consistencyScore * 0.2) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByRoute(bids: AuctionBidRecord[]): Record<string, AuctionBidRecord[]> {
  const groups: Record<string, AuctionBidRecord[]> = {};
  for (const bid of bids) {
    const key = `${bid.originDomain}->${bid.destinationDomain}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(bid);
  }
  return groups;
}
