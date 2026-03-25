/**
 * Router Performance Scorecard Generator.
 *
 * Combines all sub-analyses into a single scorecard per router, computes the
 * composite score, assigns a letter grade, and generates actionable
 * recommendations for router operators.
 */

import {
  AnalyzerConfig,
  RouterScorecard,
  LiquidityDistribution,
  AuctionPerformanceMetrics,
  DowntimeAnalysis,
  SlippageAnalysis,
  OptimalAllocation,
  HealthGrade,
} from "../types";
import { clamp, scoreToGrade } from "../utils/math";

export interface ScorecardInput {
  routerAddress: string;
  liquidityScore: number;
  auctionScore: number;
  uptimeScore: number;
  slippageScore: number;
  liquidity: LiquidityDistribution;
  auction: AuctionPerformanceMetrics;
  downtime: DowntimeAnalysis;
  slippage: SlippageAnalysis;
  optimalAllocation: OptimalAllocation;
  windowStart: number;
  windowEnd: number;
}

/**
 * Generate a complete performance scorecard for a router.
 */
export function generateScorecard(
  input: ScorecardInput,
  config: AnalyzerConfig,
): RouterScorecard {
  const { scoreWeights } = config;

  const overallScore = Math.round(
    (input.liquidityScore * scoreWeights.liquidity +
      input.auctionScore * scoreWeights.auction +
      input.uptimeScore * scoreWeights.uptime +
      input.slippageScore * scoreWeights.slippage) *
      100,
  ) / 100;

  const grade = scoreToGrade(overallScore);

  const recommendations = generateRecommendations(input, grade);

  return {
    routerAddress: input.routerAddress,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    generatedAt: Date.now(),
    liquidityScore: input.liquidityScore,
    auctionScore: input.auctionScore,
    uptimeScore: input.uptimeScore,
    slippageScore: input.slippageScore,
    overallScore,
    grade,
    liquidity: input.liquidity,
    auction: input.auction,
    downtime: input.downtime,
    slippage: input.slippage,
    optimalAllocation: input.optimalAllocation,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Recommendation Engine
// ---------------------------------------------------------------------------

function generateRecommendations(
  input: ScorecardInput,
  grade: HealthGrade,
): string[] {
  const recs: string[] = [];

  // Liquidity recommendations
  if (input.liquidity.hhi > 5000) {
    recs.push(
      `Liquidity is heavily concentrated (HHI=${input.liquidity.hhi}). ` +
        `Consider redistributing capital across chains to reduce single-chain risk.`,
    );
  }
  if (input.liquidity.dominantChainPct > 80) {
    recs.push(
      `${input.liquidity.dominantChainPct}% of liquidity is on a single chain. ` +
        `Diversifying will improve fault tolerance and capital efficiency.`,
    );
  }
  if (input.optimalAllocation.efficiencyGain > 0.15) {
    const topRebalance = Object.entries(input.optimalAllocation.rebalanceActions)
      .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
      .slice(0, 3);
    if (topRebalance.length > 0) {
      const actions = topRebalance
        .map(([chain, amount]) => {
          const direction = amount > 0 ? "add" : "remove";
          return `${direction} $${Math.abs(amount).toFixed(0)} on chain ${chain}`;
        })
        .join("; ");
      recs.push(`Rebalancing opportunity: ${actions}.`);
    }
  }

  // Auction recommendations
  if (input.auction.winRate < 0.3 && input.auction.totalBids > 10) {
    recs.push(
      `Auction win rate is ${(input.auction.winRate * 100).toFixed(1)}%. ` +
        `Review bid pricing strategy and ensure competitive fee structure.`,
    );
  }
  if (input.auction.p95LatencyMs > 30000) {
    recs.push(
      `p95 bid latency is ${(input.auction.p95LatencyMs / 1000).toFixed(1)}s. ` +
        `Consider optimizing RPC connections, co-locating with the sequencer, ` +
        `or upgrading infrastructure to reduce latency.`,
    );
  }

  // Check for routes with zero wins
  const zeroWinRoutes = Object.entries(input.auction.winRateByRoute)
    .filter(([, rate]) => rate === 0)
    .map(([route]) => route);
  if (zeroWinRoutes.length > 0) {
    recs.push(
      `Zero wins on routes: ${zeroWinRoutes.join(", ")}. ` +
        `Investigate whether these routes have sufficient liquidity or if ` +
        `competing routers have a structural advantage.`,
    );
  }

  // Uptime recommendations
  if (input.downtime.uptimeRatio < 0.95) {
    recs.push(
      `Uptime is ${(input.downtime.uptimeRatio * 100).toFixed(1)}%. ` +
        `Investigate infrastructure stability and consider redundant setups.`,
    );
  }
  if (input.downtime.mttrSeconds > 3600) {
    recs.push(
      `Mean time to recovery is ${(input.downtime.mttrSeconds / 3600).toFixed(1)} hours. ` +
        `Set up automated health monitoring and restart procedures.`,
    );
  }
  if (input.downtime.predictedNextFailureWindow) {
    const predicted = new Date(input.downtime.predictedNextFailureWindow.start * 1000);
    recs.push(
      `Trend analysis predicts next potential downtime around ${predicted.toISOString()}. ` +
        `Schedule preventive maintenance before this window.`,
    );
  }

  // Slippage recommendations
  if (input.slippage.avgDeviationBps > 10) {
    recs.push(
      `Average slippage deviation is +${input.slippage.avgDeviationBps.toFixed(1)} bps ` +
        `(actual > estimated). Review AMM pool depth assumptions and price oracle freshness.`,
    );
  }
  if (input.slippage.underestimatePct > 60) {
    recs.push(
      `Slippage is underestimated in ${input.slippage.underestimatePct.toFixed(0)}% of transfers. ` +
        `Consider adding a safety buffer to slippage estimates to improve user experience.`,
    );
  }

  // High-level summary
  if (grade === "A") {
    recs.push("Overall performance is excellent. Maintain current operational practices.");
  } else if (grade === "F") {
    recs.push(
      "Overall performance is critically low. Immediate attention required across " +
        "liquidity, auction competitiveness, and uptime.",
    );
  }

  return recs;
}

/**
 * Format a scorecard as a human-readable text report.
 */
export function formatScorecardReport(scorecard: RouterScorecard): string {
  const lines: string[] = [];
  const divider = "=".repeat(72);
  const subDivider = "-".repeat(72);

  lines.push(divider);
  lines.push(`ROUTER PERFORMANCE SCORECARD`);
  lines.push(divider);
  lines.push(`Router:     ${scorecard.routerAddress}`);
  lines.push(`Window:     ${new Date(scorecard.windowStart * 1000).toISOString()} to ${new Date(scorecard.windowEnd * 1000).toISOString()}`);
  lines.push(`Generated:  ${new Date(scorecard.generatedAt).toISOString()}`);
  lines.push("");
  lines.push(`OVERALL GRADE: ${scorecard.grade}  (${scorecard.overallScore}/100)`);
  lines.push(subDivider);

  lines.push("");
  lines.push(`Liquidity Score:  ${scorecard.liquidityScore}/100`);
  lines.push(`  Total USD:       $${scorecard.liquidity.totalUsd.toLocaleString()}`);
  lines.push(`  HHI:             ${scorecard.liquidity.hhi}`);
  lines.push(`  Dominant Chain:  ${scorecard.liquidity.dominantChain} (${scorecard.liquidity.dominantChainPct}%)`);

  lines.push("");
  lines.push(`Auction Score:    ${scorecard.auctionScore}/100`);
  lines.push(`  Win Rate:        ${(scorecard.auction.winRate * 100).toFixed(1)}% (${scorecard.auction.wonBids}/${scorecard.auction.totalBids})`);
  lines.push(`  Avg Latency:     ${scorecard.auction.avgLatencyMs}ms`);
  lines.push(`  p95 Latency:     ${scorecard.auction.p95LatencyMs}ms`);

  lines.push("");
  lines.push(`Uptime Score:     ${scorecard.uptimeScore}/100`);
  lines.push(`  Uptime Ratio:    ${(scorecard.downtime.uptimeRatio * 100).toFixed(2)}%`);
  lines.push(`  MTBF:            ${(scorecard.downtime.mtbfSeconds / 3600).toFixed(1)} hours`);
  lines.push(`  MTTR:            ${(scorecard.downtime.mttrSeconds / 60).toFixed(0)} minutes`);
  lines.push(`  Events:          ${scorecard.downtime.totalEvents}`);

  lines.push("");
  lines.push(`Slippage Score:   ${scorecard.slippageScore}/100`);
  lines.push(`  Avg Deviation:   ${scorecard.slippage.avgDeviationBps.toFixed(1)} bps`);
  lines.push(`  Vol-Wtd Dev:     ${scorecard.slippage.volumeWeightedDeviationBps.toFixed(1)} bps`);
  lines.push(`  Underestimate:   ${scorecard.slippage.underestimatePct.toFixed(0)}%`);

  if (scorecard.recommendations.length > 0) {
    lines.push("");
    lines.push(subDivider);
    lines.push("RECOMMENDATIONS");
    lines.push(subDivider);
    for (const rec of scorecard.recommendations) {
      lines.push(`  * ${rec}`);
    }
  }

  lines.push("");
  lines.push(divider);

  return lines.join("\n");
}
