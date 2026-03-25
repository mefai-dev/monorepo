/**
 * Default configuration and environment-based overrides.
 */

import { AnalyzerConfig, ChainConfig } from "./types";

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const ONE_HOUR = 60 * 60;

/**
 * Well-known Connext production chains and their subgraph endpoints.
 * These can be overridden via environment variables or a config file.
 */
const DEFAULT_CHAINS: ChainConfig[] = [
  {
    domainId: "6648936",
    chainName: "Ethereum",
    rpcUrl: process.env.ETH_RPC_URL ?? "https://rpc.ankr.com/eth",
    subgraphUrl:
      process.env.ETH_SUBGRAPH_URL ??
      "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-mainnet",
    blockTimeSeconds: 12,
  },
  {
    domainId: "1869640809",
    chainName: "Optimism",
    rpcUrl: process.env.OPTIMISM_RPC_URL ?? "https://rpc.ankr.com/optimism",
    subgraphUrl:
      process.env.OPTIMISM_SUBGRAPH_URL ??
      "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-optimism",
    blockTimeSeconds: 2,
  },
  {
    domainId: "6450786",
    chainName: "BNB Chain",
    rpcUrl: process.env.BNB_RPC_URL ?? "https://rpc.ankr.com/bsc",
    subgraphUrl:
      process.env.BNB_SUBGRAPH_URL ??
      "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-bnb",
    blockTimeSeconds: 3,
  },
  {
    domainId: "6778479",
    chainName: "Gnosis",
    rpcUrl: process.env.GNOSIS_RPC_URL ?? "https://rpc.ankr.com/gnosis",
    subgraphUrl:
      process.env.GNOSIS_SUBGRAPH_URL ??
      "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-gnosis",
    blockTimeSeconds: 5,
  },
  {
    domainId: "1886350457",
    chainName: "Polygon",
    rpcUrl: process.env.POLYGON_RPC_URL ?? "https://rpc.ankr.com/polygon",
    subgraphUrl:
      process.env.POLYGON_SUBGRAPH_URL ??
      "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-polygon",
    blockTimeSeconds: 2,
  },
  {
    domainId: "1634886255",
    chainName: "Arbitrum One",
    rpcUrl: process.env.ARBITRUM_RPC_URL ?? "https://rpc.ankr.com/arbitrum",
    subgraphUrl:
      process.env.ARBITRUM_SUBGRAPH_URL ??
      "https://api.thegraph.com/subgraphs/name/connext/amarok-runtime-v0-arbitrum-one",
    blockTimeSeconds: 0.25,
  },
];

export function getDefaultConfig(): AnalyzerConfig {
  const routerAddresses = process.env.ROUTER_ADDRESSES
    ? process.env.ROUTER_ADDRESSES.split(",").map((a) => a.trim())
    : [];

  return {
    chains: DEFAULT_CHAINS,
    routerAddresses,
    windowSeconds: Number(process.env.ANALYSIS_WINDOW_SECONDS) || SEVEN_DAYS,
    minBidsForAuctionAnalysis: Number(process.env.MIN_BIDS_FOR_AUCTION) || 10,
    minTransfersForSlippageAnalysis: Number(process.env.MIN_TRANSFERS_FOR_SLIPPAGE) || 5,
    downtimeThresholdSeconds: Number(process.env.DOWNTIME_THRESHOLD_SECONDS) || ONE_HOUR,
    scoreWeights: {
      liquidity: 0.25,
      auction: 0.30,
      uptime: 0.30,
      slippage: 0.15,
    },
  };
}
