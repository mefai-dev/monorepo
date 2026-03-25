# Router Performance Analyzer

A diagnostic and analytics tool for Connext router operators. Monitors router health across multiple dimensions and generates actionable performance scorecards.

## Features

- **Liquidity Distribution Monitoring** - Tracks how router capital is spread across chains, computes concentration (HHI), and identifies over-allocated chains
- **Auction Performance Analysis** - Measures bid success rates, latency distributions (p50/p95/p99), and per-route win rates in the sequencer auction pipeline
- **Downtime Detection & Prediction** - Identifies activity gaps, computes MTBF/MTTR, and uses trend extrapolation to predict the next likely failure window
- **Optimal Liquidity Allocation** - Calculates volume-proportional capital distribution with minimum floor guarantees per chain
- **Slippage Tracking** - Compares estimated vs actual slippage across routes, detects systematic estimation bias and outlier conditions
- **Performance Scorecards** - Generates per-router scorecards with letter grades (A-F), composite scores, and prioritized recommendations

## Quick Start

```bash
# Install dependencies
yarn install

# Build
yarn build

# Run full analysis (all discovered routers)
yarn start

# Run with specific routers
ROUTER_ADDRESSES=0xabc...,0xdef... yarn start

# Output only scorecards
yarn scorecard

# Output JSON for programmatic consumption
yarn start --mode=json
```

## Configuration

Configuration is driven by environment variables:

| Variable | Default | Description |
|---|---|---|
| `ROUTER_ADDRESSES` | (all) | Comma-separated router addresses to analyze |
| `ANALYSIS_WINDOW_SECONDS` | 604800 (7 days) | Time window for historical analysis |
| `DOWNTIME_THRESHOLD_SECONDS` | 3600 (1 hour) | Gap duration to flag as downtime |
| `MIN_BIDS_FOR_AUCTION` | 10 | Minimum bids to include auction scoring |
| `MIN_TRANSFERS_FOR_SLIPPAGE` | 5 | Minimum transfers for slippage scoring |
| `LOG_LEVEL` | info | Pino log level |
| `ETH_RPC_URL` | ankr | Ethereum RPC endpoint |
| `ETH_SUBGRAPH_URL` | thegraph | Ethereum subgraph endpoint |

Chain-specific RPC and subgraph URLs follow the pattern `{CHAIN}_RPC_URL` and `{CHAIN}_SUBGRAPH_URL` for: ETH, OPTIMISM, BNB, GNOSIS, POLYGON, ARBITRUM.

## Scoring

The composite score (0-100) is a weighted average of four dimensions:

| Dimension | Weight | What it measures |
|---|---|---|
| **Auction** | 30% | Win rate, latency, route consistency |
| **Uptime** | 30% | Uptime ratio, MTBF, MTTR, event frequency |
| **Liquidity** | 25% | HHI concentration, chain coverage, balance |
| **Slippage** | 15% | Estimation accuracy, consistency, underestimate rate |

Grades: A (90+), B (75-89), C (60-74), D (40-59), F (<40)

## Architecture

```
src/
  types/          Type definitions for all data models
  collectors/     Data collection from subgraphs and on-chain sources
  analyzers/      Analysis modules (liquidity, auction, downtime, slippage, scorecard)
  utils/          Statistical functions, logging
  config.ts       Default configuration and env overrides
  index.ts        Pipeline orchestration and CLI entry point
```

## Programmatic Usage

```typescript
import { runAnalysis } from "@connext/router-performance-analyzer";

const scorecards = await runAnalysis({
  routerAddresses: ["0x..."],
  windowSeconds: 3 * 24 * 60 * 60, // 3 days
});

for (const sc of scorecards) {
  console.log(`${sc.routerAddress}: ${sc.grade} (${sc.overallScore})`);
}
```

## Development

```bash
# Run tests
yarn test

# Lint
yarn lint

# Type check
yarn build
```
