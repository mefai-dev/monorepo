/**
 * Router Performance Analyzer - Entry Point
 *
 * Orchestrates the full analysis pipeline:
 * 1. Collect data from subgraphs (liquidity, transfers, bids)
 * 2. Run analyzers (liquidity, auction, downtime, slippage)
 * 3. Generate scorecards per router
 * 4. Output results as JSON and/or human-readable reports
 */

import "dotenv/config";
import { SubgraphCollector } from "./collectors";
import {
  analyzeLiquidityDistribution,
  calculateOptimalAllocation,
  scoreLiquidity,
  analyzeAuctionPerformance,
  scoreAuction,
  detectDowntimeEvents,
  analyzeDowntime,
  scoreUptime,
  analyzeSlippage,
  scoreSlippage,
  generateScorecard,
  formatScorecardReport,
} from "./analyzers";
import { getDefaultConfig } from "./config";
import { logger } from "./utils/logger";
import type { AnalyzerConfig, RouterScorecard } from "./types";
import type { ScorecardInput } from "./analyzers";

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function runAnalysis(
  configOverride?: Partial<AnalyzerConfig>,
): Promise<RouterScorecard[]> {
  const config: AnalyzerConfig = {
    ...getDefaultConfig(),
    ...configOverride,
  };

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - config.windowSeconds;

  logger.info(
    {
      chains: config.chains.length,
      routers: config.routerAddresses.length || "all",
      windowDays: Math.round(config.windowSeconds / 86400),
    },
    "Starting router performance analysis",
  );

  const collector = new SubgraphCollector(config.chains);

  // Step 1: Discover routers if none specified
  let routerAddresses = config.routerAddresses;
  if (routerAddresses.length === 0) {
    logger.info("No router addresses specified; fetching all known routers from subgraphs");
    const allPositions = await collector.fetchRouterLiquidity([]);
    routerAddresses = [...new Set(allPositions.map((p) => p.routerAddress))];
    logger.info({ count: routerAddresses.length }, "Discovered routers");
  }

  if (routerAddresses.length === 0) {
    logger.warn("No routers found. Exiting.");
    return [];
  }

  // Step 2: Collect data for each router
  const scorecards: RouterScorecard[] = [];

  for (const routerAddress of routerAddresses) {
    logger.info({ router: routerAddress }, "Analyzing router");

    try {
      // Collect
      const [positions, bids, slippageRecords] = await Promise.all([
        collector.fetchRouterLiquidity([routerAddress]),
        collector.fetchAuctionBids(routerAddress, windowStart),
        collector.fetchTransferRecords(routerAddress, windowStart),
      ]);

      // Analyze liquidity
      const liquidityDist = analyzeLiquidityDistribution(routerAddress, positions);
      const liquidityScore = scoreLiquidity(liquidityDist, config.chains.length);

      // Compute volume per chain from transfer records for optimal allocation
      const volumePerChain: Record<string, number> = {};
      for (const rec of slippageRecords) {
        const amount = Number(rec.transferAmount) || 0;
        volumePerChain[rec.destinationDomain] =
          (volumePerChain[rec.destinationDomain] ?? 0) + amount;
      }
      const optimalAllocation = calculateOptimalAllocation(
        routerAddress,
        liquidityDist,
        volumePerChain,
      );

      // Analyze auctions
      const auctionMetrics = analyzeAuctionPerformance(routerAddress, bids);
      const auctionScore =
        auctionMetrics.totalBids >= config.minBidsForAuctionAnalysis
          ? scoreAuction(auctionMetrics)
          : 50;

      // Analyze downtime
      const downtimeEvents = detectDowntimeEvents(
        routerAddress,
        bids,
        config.downtimeThresholdSeconds,
      );
      const downtimeAnalysis = analyzeDowntime(routerAddress, downtimeEvents, config.windowSeconds);
      const uptimeScore = scoreUptime(downtimeAnalysis);

      // Analyze slippage
      const slippageAnalysis = analyzeSlippage(routerAddress, slippageRecords);
      const slippageScore =
        slippageAnalysis.totalTransfers >= config.minTransfersForSlippageAnalysis
          ? scoreSlippage(slippageAnalysis)
          : 50;

      // Generate scorecard
      const input: ScorecardInput = {
        routerAddress,
        liquidityScore,
        auctionScore,
        uptimeScore,
        slippageScore,
        liquidity: liquidityDist,
        auction: auctionMetrics,
        downtime: downtimeAnalysis,
        slippage: slippageAnalysis,
        optimalAllocation,
        windowStart,
        windowEnd: now,
      };

      const scorecard = generateScorecard(input, config);
      scorecards.push(scorecard);

      logger.info(
        {
          router: routerAddress,
          grade: scorecard.grade,
          score: scorecard.overallScore,
        },
        "Scorecard generated",
      );
    } catch (err) {
      logger.error({ router: routerAddress, err }, "Failed to analyze router");
    }
  }

  logger.info({ total: scorecards.length }, "Analysis complete");
  return scorecards;
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "full";

  const scorecards = await runAnalysis();

  if (mode === "scorecard" || mode === "full") {
    for (const sc of scorecards) {
      console.log(formatScorecardReport(sc));
    }
  }

  if (mode === "json" || mode === "full") {
    console.log(JSON.stringify(scorecards, null, 2));
  }
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error");
  process.exit(1);
});

// Re-export for programmatic use
export { getDefaultConfig } from "./config";
export type { AnalyzerConfig, RouterScorecard } from "./types";
export * from "./analyzers";
export * from "./collectors";
export * from "./utils";
