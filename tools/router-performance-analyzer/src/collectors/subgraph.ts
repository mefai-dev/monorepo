/**
 * Subgraph data collector.
 *
 * Queries Connext subgraphs to retrieve router liquidity positions, transfer
 * execution history, and bid records for the performance analysis pipeline.
 */

import { logger } from "../utils/logger";
import {
  ChainConfig,
  RouterLiquidityPosition,
  AuctionBidRecord,
  SlippageRecord,
} from "../types";

// ---------------------------------------------------------------------------
// GraphQL Fragments
// ---------------------------------------------------------------------------

const ROUTER_LIQUIDITY_QUERY = `
  query RouterLiquidity($routerAddresses: [String!], $first: Int!, $skip: Int!) {
    routers(
      where: { id_in: $routerAddresses }
      first: $first
      skip: $skip
    ) {
      id
      assetBalances {
        id
        amount
        asset {
          id
          adoptedAsset
          canonicalId
          canonicalDomain
          adoptedDecimal
          localAsset
        }
      }
    }
  }
`;

const TRANSFERS_QUERY = `
  query TransfersByRouter(
    $routerAddress: String!
    $startTimestamp: BigInt!
    $first: Int!
    $skip: Int!
  ) {
    originTransfers(
      where: {
        timestamp_gte: $startTimestamp
      }
      first: $first
      skip: $skip
      orderBy: timestamp
      orderDirection: desc
    ) {
      id
      transferId
      originDomain
      destinationDomain
      normalizedIn
      timestamp
      transactingAsset
    }
    destinationTransfers(
      where: {
        routers_contains: [$routerAddress]
        executedTimestamp_gte: $startTimestamp
      }
      first: $first
      skip: $skip
      orderBy: executedTimestamp
      orderDirection: desc
    ) {
      id
      transferId
      originDomain
      destinationDomain
      amount
      routersFee
      executedTimestamp
      executedTransactionHash
      routers {
        id
      }
      slippage
    }
  }
`;

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

export class SubgraphCollector {
  private readonly chains: ChainConfig[];

  constructor(chains: ChainConfig[]) {
    this.chains = chains;
  }

  /**
   * Fetch router liquidity positions across all configured chains.
   */
  async fetchRouterLiquidity(
    routerAddresses: string[],
  ): Promise<RouterLiquidityPosition[]> {
    const positions: RouterLiquidityPosition[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const chain of this.chains) {
      try {
        const data = await this.querySubgraph(chain.subgraphUrl, ROUTER_LIQUIDITY_QUERY, {
          routerAddresses: routerAddresses.map((a) => a.toLowerCase()),
          first: 1000,
          skip: 0,
        });

        if (!data?.routers) continue;

        for (const router of data.routers) {
          for (const ab of router.assetBalances ?? []) {
            positions.push({
              routerAddress: router.id,
              domainId: chain.domainId,
              asset: ab.asset?.adoptedAsset ?? ab.asset?.localAsset ?? ab.asset?.id ?? "unknown",
              balance: ab.amount ?? "0",
              balanceUsd: 0, // Populated by the price enrichment step
              timestamp: now,
            });
          }
        }
      } catch (err) {
        logger.warn({ chain: chain.chainName, err }, "Failed to fetch liquidity from subgraph");
      }
    }

    return positions;
  }

  /**
   * Fetch transfer execution records to derive slippage data.
   */
  async fetchTransferRecords(
    routerAddress: string,
    startTimestamp: number,
  ): Promise<SlippageRecord[]> {
    const records: SlippageRecord[] = [];

    for (const chain of this.chains) {
      try {
        const data = await this.querySubgraph(chain.subgraphUrl, TRANSFERS_QUERY, {
          routerAddress: routerAddress.toLowerCase(),
          startTimestamp: startTimestamp.toString(),
          first: 1000,
          skip: 0,
        });

        if (!data?.destinationTransfers) continue;

        for (const tx of data.destinationTransfers) {
          const estimatedSlippage = tx.slippage ? Number(tx.slippage) : 0;
          // Actual slippage derived from the difference between origin normalizedIn
          // and destination amount, accounting for fees.
          const originMatch = data.originTransfers?.find(
            (ot: { transferId: string }) => ot.transferId === tx.transferId,
          );
          const originAmount = originMatch ? Number(originMatch.normalizedIn) : 0;
          const destAmount = Number(tx.amount ?? 0);
          const fee = Number(tx.routersFee ?? 0);

          let actualSlippageBps = 0;
          if (originAmount > 0) {
            const expectedOut = originAmount - fee;
            if (expectedOut > 0) {
              actualSlippageBps = Math.round(((expectedOut - destAmount) / expectedOut) * 10000);
            }
          }

          records.push({
            transferId: tx.transferId,
            routerAddress,
            originDomain: tx.originDomain,
            destinationDomain: tx.destinationDomain,
            asset: originMatch?.transactingAsset ?? "unknown",
            estimatedSlippageBps: estimatedSlippage,
            actualSlippageBps,
            deviationBps: actualSlippageBps - estimatedSlippage,
            transferAmount: originMatch?.normalizedIn ?? tx.amount ?? "0",
            timestamp: Number(tx.executedTimestamp ?? 0),
          });
        }
      } catch (err) {
        logger.warn({ chain: chain.chainName, err }, "Failed to fetch transfers from subgraph");
      }
    }

    return records;
  }

  /**
   * Fetch auction bid records from the sequencer cache/subgraph.
   * In production this would hit the sequencer API; this implementation
   * parses from the subgraph execution events to reconstruct bid timing.
   */
  async fetchAuctionBids(
    routerAddress: string,
    startTimestamp: number,
  ): Promise<AuctionBidRecord[]> {
    const bids: AuctionBidRecord[] = [];

    for (const chain of this.chains) {
      try {
        const data = await this.querySubgraph(chain.subgraphUrl, TRANSFERS_QUERY, {
          routerAddress: routerAddress.toLowerCase(),
          startTimestamp: startTimestamp.toString(),
          first: 1000,
          skip: 0,
        });

        if (!data?.destinationTransfers) continue;

        for (const tx of data.destinationTransfers) {
          const executedTs = Number(tx.executedTimestamp ?? 0) * 1000;
          const originMatch = data.originTransfers?.find(
            (ot: { transferId: string }) => ot.transferId === tx.transferId,
          );
          const auctionStart = originMatch ? Number(originMatch.timestamp) * 1000 : executedTs;

          // The router won if it is listed in the routers array for this execution.
          const won = (tx.routers ?? []).some(
            (r: { id: string }) => r.id.toLowerCase() === routerAddress.toLowerCase(),
          );

          bids.push({
            transferId: tx.transferId,
            routerAddress,
            originDomain: tx.originDomain,
            destinationDomain: tx.destinationDomain,
            bidTimestamp: executedTs,
            auctionStartTimestamp: auctionStart,
            latencyMs: executedTs - auctionStart,
            won,
            round: 1,
            transferAmount: originMatch?.normalizedIn ?? tx.amount ?? "0",
          });
        }
      } catch (err) {
        logger.warn({ chain: chain.chainName, err }, "Failed to fetch bids from subgraph");
      }
    }

    return bids;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async querySubgraph(
    url: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        logger.warn({ url, status: response.status }, "Subgraph request failed");
        return null;
      }

      const json = (await response.json()) as { data?: Record<string, unknown> };
      return json.data ?? null;
    } catch (err) {
      logger.error({ url, err }, "Subgraph query error");
      return null;
    }
  }
}
