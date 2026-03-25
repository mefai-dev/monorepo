/**
 * Downtime Pattern Analyzer.
 *
 * Detects gaps in router activity that indicate downtime, computes reliability
 * metrics (MTBF, MTTR, uptime ratio), and uses simple trend extrapolation to
 * predict the next likely failure window.
 */

import {
  AuctionBidRecord,
  DowntimeEvent,
  DowntimeAnalysis,
} from "../types";
import { mean, linearRegression, clamp } from "../utils/math";

/**
 * Detect downtime events by finding gaps in the router's bid/execution timeline
 * that exceed the configured threshold.
 */
export function detectDowntimeEvents(
  routerAddress: string,
  bids: AuctionBidRecord[],
  thresholdSeconds: number,
): DowntimeEvent[] {
  const routerBids = bids
    .filter((b) => b.routerAddress.toLowerCase() === routerAddress.toLowerCase())
    .sort((a, b) => a.bidTimestamp - b.bidTimestamp);

  if (routerBids.length < 2) return [];

  const events: DowntimeEvent[] = [];

  // Group by domain for per-chain downtime detection
  const domainGroups: Record<string, AuctionBidRecord[]> = {};
  for (const bid of routerBids) {
    const domain = bid.destinationDomain;
    if (!domainGroups[domain]) domainGroups[domain] = [];
    domainGroups[domain].push(bid);
  }

  for (const [domainId, domainBids] of Object.entries(domainGroups)) {
    const sorted = domainBids.sort((a, b) => a.bidTimestamp - b.bidTimestamp);
    for (let i = 1; i < sorted.length; i++) {
      const gapMs = sorted[i].bidTimestamp - sorted[i - 1].bidTimestamp;
      const gapSeconds = gapMs / 1000;

      if (gapSeconds > thresholdSeconds) {
        events.push({
          routerAddress,
          domainId,
          startTimestamp: Math.floor(sorted[i - 1].bidTimestamp / 1000),
          endTimestamp: Math.floor(sorted[i].bidTimestamp / 1000),
          durationSeconds: Math.floor(gapSeconds),
          source: "bid_gap",
        });
      }
    }
  }

  return events.sort((a, b) => b.startTimestamp - a.startTimestamp);
}

/**
 * Build a complete downtime analysis from detected events.
 */
export function analyzeDowntime(
  routerAddress: string,
  events: DowntimeEvent[],
  windowSeconds: number,
): DowntimeAnalysis {
  const routerEvents = events.filter(
    (e) => e.routerAddress.toLowerCase() === routerAddress.toLowerCase(),
  );

  const totalDowntimeSeconds = routerEvents.reduce((sum, e) => sum + e.durationSeconds, 0);
  const uptimeRatio = windowSeconds > 0 ? clamp(1 - totalDowntimeSeconds / windowSeconds, 0, 1) : 1;

  // MTBF: average time between the start of consecutive downtime events
  let mtbfSeconds = 0;
  if (routerEvents.length > 1) {
    const sorted = [...routerEvents].sort((a, b) => a.startTimestamp - b.startTimestamp);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].startTimestamp - sorted[i - 1].startTimestamp);
    }
    mtbfSeconds = Math.round(mean(intervals));
  }

  // MTTR: average recovery time (duration of downtime events)
  const mttrSeconds =
    routerEvents.length > 0
      ? Math.round(mean(routerEvents.map((e) => e.durationSeconds)))
      : 0;

  // Failure prediction via linear regression on inter-failure intervals
  const predictedNextFailureWindow = predictNextFailure(routerEvents);

  return {
    routerAddress,
    totalEvents: routerEvents.length,
    totalDowntimeSeconds,
    uptimeRatio: Math.round(uptimeRatio * 10000) / 10000,
    mtbfSeconds,
    mttrSeconds,
    events: routerEvents,
    predictedNextFailureWindow,
  };
}

/**
 * Score uptime health (0-100).
 */
export function scoreUptime(analysis: DowntimeAnalysis): number {
  // Base score from uptime ratio
  const uptimeScore = analysis.uptimeRatio * 100;

  // Penalty for frequent events (more than 5 events in the window is concerning)
  const frequencyPenalty = clamp(analysis.totalEvents * 4, 0, 30);

  // Penalty for long MTTR (more than 1 hour is bad)
  const mttrPenalty =
    analysis.mttrSeconds > 3600
      ? clamp((analysis.mttrSeconds - 3600) / 360, 0, 20)
      : 0;

  return Math.round(clamp(uptimeScore - frequencyPenalty - mttrPenalty, 0, 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

/**
 * Use linear regression on inter-failure intervals to estimate the next
 * failure window. Returns null if there are fewer than 3 events (insufficient
 * data for meaningful extrapolation).
 */
function predictNextFailure(
  events: DowntimeEvent[],
): { start: number; end: number } | null {
  if (events.length < 3) return null;

  const sorted = [...events].sort((a, b) => a.startTimestamp - b.startTimestamp);

  // x = event index, y = timestamp of failure start
  const xs = sorted.map((_, i) => i);
  const ys = sorted.map((e) => e.startTimestamp);

  const { slope, intercept, r2 } = linearRegression(xs, ys);

  // Only predict if the model explains at least 50% of variance
  if (r2 < 0.5 || slope <= 0) return null;

  const nextIndex = sorted.length;
  const predictedStart = Math.round(slope * nextIndex + intercept);

  // Use average MTTR for predicted duration
  const avgDuration = mean(sorted.map((e) => e.durationSeconds));
  const predictedEnd = predictedStart + Math.round(avgDuration);

  // Sanity check: predicted time should be in the future
  const now = Math.floor(Date.now() / 1000);
  if (predictedStart < now) return null;

  return { start: predictedStart, end: predictedEnd };
}
