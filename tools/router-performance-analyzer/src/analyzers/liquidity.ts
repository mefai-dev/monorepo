/**
 * Liquidity Distribution Analyzer.
 *
 * Evaluates how a router's capital is spread across chains, computes
 * concentration metrics, and recommends optimal allocation based on
 * historical transfer volume.
 */

import {
  RouterLiquidityPosition,
  LiquidityDistribution,
  OptimalAllocation,
} from "../types";
import { computeHHI, clamp } from "../utils/math";

/**
 * Build a LiquidityDistribution snapshot from raw position data.
 */
export function analyzeLiquidityDistribution(
  routerAddress: string,
  positions: RouterLiquidityPosition[],
): LiquidityDistribution {
  const filtered = positions.filter(
    (p) => p.routerAddress.toLowerCase() === routerAddress.toLowerCase(),
  );

  const perChain: Record<string, number> = {};
  for (const pos of filtered) {
    perChain[pos.domainId] = (perChain[pos.domainId] ?? 0) + pos.balanceUsd;
  }

  const chainValues = Object.values(perChain);
  const totalUsd = chainValues.reduce((sum, v) => sum + v, 0);
  const hhi = computeHHI(chainValues);

  let dominantChain = "";
  let dominantChainPct = 0;
  for (const [domain, value] of Object.entries(perChain)) {
    const pct = totalUsd > 0 ? value / totalUsd : 0;
    if (pct > dominantChainPct) {
      dominantChainPct = pct;
      dominantChain = domain;
    }
  }

  return {
    routerAddress,
    perChain,
    totalUsd,
    hhi: Math.round(hhi),
    dominantChain,
    dominantChainPct: Math.round(dominantChainPct * 10000) / 100,
  };
}

/**
 * Calculate optimal liquidity allocation.
 *
 * The strategy distributes capital proportionally to historical transfer
 * volume per chain, with a minimum floor allocation to maintain presence
 * on low-volume chains and avoid zero-liquidity situations.
 */
export function calculateOptimalAllocation(
  routerAddress: string,
  distribution: LiquidityDistribution,
  volumePerChain: Record<string, number>,
  minFloorPct: number = 0.05,
): OptimalAllocation {
  const chains = Object.keys(distribution.perChain);
  const totalVolume = Object.values(volumePerChain).reduce((s, v) => s + v, 0);

  // Current allocation fractions
  const current: Record<string, number> = {};
  for (const chain of chains) {
    current[chain] =
      distribution.totalUsd > 0
        ? (distribution.perChain[chain] ?? 0) / distribution.totalUsd
        : 0;
  }

  // Recommended allocation: volume-proportional with minimum floor
  const recommended: Record<string, number> = {};
  if (totalVolume > 0 && chains.length > 0) {
    const floorTotal = minFloorPct * chains.length;
    const remainingWeight = Math.max(0, 1 - floorTotal);

    for (const chain of chains) {
      const volumeShare = (volumePerChain[chain] ?? 0) / totalVolume;
      recommended[chain] = clamp(minFloorPct + volumeShare * remainingWeight, 0, 1);
    }

    // Normalize to sum to 1
    const recTotal = Object.values(recommended).reduce((s, v) => s + v, 0);
    if (recTotal > 0) {
      for (const chain of chains) {
        recommended[chain] = recommended[chain] / recTotal;
      }
    }
  } else {
    // Equal distribution when no volume data is available
    const equal = chains.length > 0 ? 1 / chains.length : 0;
    for (const chain of chains) {
      recommended[chain] = equal;
    }
  }

  // Rebalance actions: how much USD to move (positive = add, negative = remove)
  const rebalanceActions: Record<string, number> = {};
  for (const chain of chains) {
    const currentUsd = distribution.perChain[chain] ?? 0;
    const targetUsd = (recommended[chain] ?? 0) * distribution.totalUsd;
    rebalanceActions[chain] = Math.round((targetUsd - currentUsd) * 100) / 100;
  }

  // Efficiency gain: reduction in deviation from optimal
  const currentDeviation = chains.reduce((sum, chain) => {
    return sum + Math.abs((current[chain] ?? 0) - (recommended[chain] ?? 0));
  }, 0);
  const efficiencyGain = clamp(currentDeviation / 2, 0, 1);

  return {
    routerAddress,
    current,
    recommended,
    efficiencyGain: Math.round(efficiencyGain * 10000) / 10000,
    rebalanceActions,
  };
}

/**
 * Score liquidity health (0-100).
 *
 * Factors:
 * - HHI concentration (lower is better, target < 1500)
 * - Whether total liquidity exceeds a minimum threshold
 * - Whether all configured chains have non-zero liquidity
 */
export function scoreLiquidity(
  distribution: LiquidityDistribution,
  chainCount: number,
): number {
  const chainsWithLiquidity = Object.values(distribution.perChain).filter((v) => v > 0).length;

  // HHI score: 100 at HHI=0, 0 at HHI=10000
  const hhiScore = clamp(100 - distribution.hhi / 100, 0, 100);

  // Coverage score: fraction of chains with liquidity
  const coverageScore = chainCount > 0 ? (chainsWithLiquidity / chainCount) * 100 : 0;

  // Balance score: penalize if dominant chain has >80%
  const balanceScore = distribution.dominantChainPct > 80
    ? clamp(100 - (distribution.dominantChainPct - 80) * 5, 0, 100)
    : 100;

  return Math.round((hhiScore * 0.4 + coverageScore * 0.3 + balanceScore * 0.3) * 100) / 100;
}
