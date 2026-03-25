/**
 * Core types for the Router Performance Analyzer.
 *
 * These types model the data collected from on-chain events, subgraph queries,
 * and the sequencer auction pipeline to build a complete picture of router
 * health and efficiency across the Connext network.
 */

// ---------------------------------------------------------------------------
// Domain & Chain
// ---------------------------------------------------------------------------

export interface ChainConfig {
  /** Connext domain ID (e.g. "6648936" for Ethereum). */
  domainId: string;
  /** Human-readable chain name. */
  chainName: string;
  /** RPC endpoint for the chain. */
  rpcUrl: string;
  /** Subgraph endpoint for the chain. */
  subgraphUrl: string;
  /** Block time in seconds (used for downtime estimation). */
  blockTimeSeconds: number;
}

// ---------------------------------------------------------------------------
// Liquidity
// ---------------------------------------------------------------------------

export interface RouterLiquidityPosition {
  routerAddress: string;
  domainId: string;
  asset: string;
  /** Raw balance in the smallest denomination. */
  balance: string;
  /** USD-equivalent value at the time of snapshot. */
  balanceUsd: number;
  /** Timestamp of the snapshot (epoch seconds). */
  timestamp: number;
}

export interface LiquidityDistribution {
  routerAddress: string;
  /** Mapping from domainId to total USD liquidity on that chain. */
  perChain: Record<string, number>;
  /** Total liquidity across all chains. */
  totalUsd: number;
  /** Herfindahl-Hirschman Index (0-10000) measuring concentration. */
  hhi: number;
  /** The chain domainId with the highest share. */
  dominantChain: string;
  /** Percentage of total on the dominant chain. */
  dominantChainPct: number;
}

export interface OptimalAllocation {
  routerAddress: string;
  /** Current allocation per chain (domainId -> fraction 0-1). */
  current: Record<string, number>;
  /** Recommended allocation per chain (domainId -> fraction 0-1). */
  recommended: Record<string, number>;
  /** Expected improvement in capital efficiency (0-1 scale). */
  efficiencyGain: number;
  /** Per-chain rebalancing actions needed (positive = add, negative = remove). */
  rebalanceActions: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Auction Performance
// ---------------------------------------------------------------------------

export interface AuctionBidRecord {
  transferId: string;
  routerAddress: string;
  originDomain: string;
  destinationDomain: string;
  /** Timestamp when the bid was submitted (epoch ms). */
  bidTimestamp: number;
  /** Timestamp when the auction started (epoch ms). */
  auctionStartTimestamp: number;
  /** Latency = bidTimestamp - auctionStartTimestamp. */
  latencyMs: number;
  /** Whether this bid was selected by the sequencer. */
  won: boolean;
  /** Auction round in which this bid participated. */
  round: number;
  /** Transfer amount in the transacting asset. */
  transferAmount: string;
}

export interface AuctionPerformanceMetrics {
  routerAddress: string;
  /** Total bids submitted in the analysis window. */
  totalBids: number;
  /** Bids that won the auction. */
  wonBids: number;
  /** Win rate as a fraction (0-1). */
  winRate: number;
  /** Average bid latency in ms. */
  avgLatencyMs: number;
  /** p50 latency in ms. */
  p50LatencyMs: number;
  /** p95 latency in ms. */
  p95LatencyMs: number;
  /** p99 latency in ms. */
  p99LatencyMs: number;
  /** Win rate broken down by origin-destination pair. */
  winRateByRoute: Record<string, number>;
  /** Average latency broken down by origin-destination pair. */
  avgLatencyByRoute: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Downtime & Health
// ---------------------------------------------------------------------------

export interface DowntimeEvent {
  routerAddress: string;
  /** Chain where downtime was detected. */
  domainId: string;
  /** Start of the gap (epoch seconds). */
  startTimestamp: number;
  /** End of the gap (epoch seconds). */
  endTimestamp: number;
  /** Duration in seconds. */
  durationSeconds: number;
  /** Whether this was detected from bid gaps vs execution gaps. */
  source: "bid_gap" | "execution_gap";
}

export interface DowntimeAnalysis {
  routerAddress: string;
  /** Total number of downtime events detected. */
  totalEvents: number;
  /** Total downtime in seconds over the analysis window. */
  totalDowntimeSeconds: number;
  /** Uptime as a fraction (0-1). */
  uptimeRatio: number;
  /** Mean time between failures in seconds. */
  mtbfSeconds: number;
  /** Mean time to recovery in seconds. */
  mttrSeconds: number;
  /** Downtime events sorted by recency. */
  events: DowntimeEvent[];
  /** Predicted next failure window (epoch seconds), null if insufficient data. */
  predictedNextFailureWindow: { start: number; end: number } | null;
}

// ---------------------------------------------------------------------------
// Slippage
// ---------------------------------------------------------------------------

export interface SlippageRecord {
  transferId: string;
  routerAddress: string;
  originDomain: string;
  destinationDomain: string;
  asset: string;
  /** Slippage estimated at bid time (basis points). */
  estimatedSlippageBps: number;
  /** Actual slippage experienced on execution (basis points). */
  actualSlippageBps: number;
  /** Deviation = actual - estimated. Positive means worse than expected. */
  deviationBps: number;
  /** Transfer amount (used for volume-weighted calculations). */
  transferAmount: string;
  timestamp: number;
}

export interface SlippageAnalysis {
  routerAddress: string;
  /** Total transfers analyzed. */
  totalTransfers: number;
  /** Average estimated slippage (bps). */
  avgEstimatedBps: number;
  /** Average actual slippage (bps). */
  avgActualBps: number;
  /** Average deviation (actual - estimated, bps). */
  avgDeviationBps: number;
  /** Volume-weighted average deviation. */
  volumeWeightedDeviationBps: number;
  /** Standard deviation of the deviation. */
  deviationStdBps: number;
  /** Percentage of transfers where actual > estimated. */
  underestimatePct: number;
  /** Per-route breakdown. */
  perRoute: Record<
    string,
    {
      avgEstimatedBps: number;
      avgActualBps: number;
      avgDeviationBps: number;
      count: number;
    }
  >;
}

// ---------------------------------------------------------------------------
// Performance Scorecard
// ---------------------------------------------------------------------------

export type HealthGrade = "A" | "B" | "C" | "D" | "F";

export interface RouterScorecard {
  routerAddress: string;
  /** Analysis window start (epoch seconds). */
  windowStart: number;
  /** Analysis window end (epoch seconds). */
  windowEnd: number;
  /** Generated at (epoch ms). */
  generatedAt: number;

  // Sub-scores (0-100)
  liquidityScore: number;
  auctionScore: number;
  uptimeScore: number;
  slippageScore: number;

  /** Composite score (0-100), weighted average of sub-scores. */
  overallScore: number;
  /** Letter grade derived from overallScore. */
  grade: HealthGrade;

  // Detailed breakdowns
  liquidity: LiquidityDistribution;
  auction: AuctionPerformanceMetrics;
  downtime: DowntimeAnalysis;
  slippage: SlippageAnalysis;
  optimalAllocation: OptimalAllocation;

  /** Actionable recommendations for the router operator. */
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Analyzer Configuration
// ---------------------------------------------------------------------------

export interface AnalyzerConfig {
  /** Chains to analyze. */
  chains: ChainConfig[];
  /** List of router addresses to analyze (empty = all discovered routers). */
  routerAddresses: string[];
  /** Analysis window in seconds (default: 7 days). */
  windowSeconds: number;
  /** Minimum number of bids to include a router in auction analysis. */
  minBidsForAuctionAnalysis: number;
  /** Minimum number of transfers for slippage analysis. */
  minTransfersForSlippageAnalysis: number;
  /** Downtime detection threshold: gap in seconds to consider as downtime. */
  downtimeThresholdSeconds: number;
  /** Score weights for composite score. Must sum to 1. */
  scoreWeights: {
    liquidity: number;
    auction: number;
    uptime: number;
    slippage: number;
  };
}
