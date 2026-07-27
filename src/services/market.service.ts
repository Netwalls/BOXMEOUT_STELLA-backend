import { Market, MarketStatus, Outcome } from "@prisma/client";
import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Keypair,
  BASE_FEE,
  scValToNative,
} from "@stellar/stellar-sdk";
import { db } from "../db";
import { logger } from "../logger";

export interface MarketFilters {
  status?: MarketStatus;
  weightClass?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const MAX_PAGE_SIZE = 100;

export interface MarketStats {
  totalBets: number;
  uniqueBettors: number;
  poolA: bigint;
  poolB: bigint;
  totalVolume: bigint;
  impliedOddsA: number;
  impliedOddsB: number;
}

export interface LeaderboardEntry {
  bettor: string;
  totalStaked: bigint;
  betCount: number;
}

export interface CreateMarketDTO {
  id: string;
  contractAddress: string;
  fighterA: object;
  fighterB: object;
  scheduledAt: Date;
  bettingEndsAt: Date;
  createdAt: Date;
  createdBy: string;
  oracleAddress: string;
  txHash?: string;
}

const PROTOCOL_FEE_RATE = 0.02; // 2% protocol fee

/**
 * Calculates the implied odds (payout multiplier) for each side.
 * Formula: (total_pool - fee) / pool_side
 * Returns 0 if pool_side is zero to avoid division by zero.
 */
export function calculateImpliedOdds(
  poolA: bigint,
  poolB: bigint
): { impliedOddsA: number; impliedOddsB: number } {
  const total = poolA + poolB;
  if (total === 0n) return { impliedOddsA: 0, impliedOddsB: 0 };

  const netPool = Number(total) * (1 - PROTOCOL_FEE_RATE);
  const impliedOddsA = poolA > 0n ? netPool / Number(poolA) : 0;
  const impliedOddsB = poolB > 0n ? netPool / Number(poolB) : 0;

  return { impliedOddsA, impliedOddsB };
}

export async function getAllMarkets(
  filters?: MarketFilters,
  pagination?: Pagination
): Promise<Market[]> {
  const where: Record<string, unknown> = {};

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.weightClass) {
    where.weightClass = filters.weightClass;
  }

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;

  return db.market.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

/**
 * Single-market lookup by marketId.
 * Returns null for unknown IDs (not a thrown error).
 */
export async function getMarketById(market_id: string): Promise<Market | null> {
  return db.market.findUnique({ where: { id: market_id } });
}

export async function createMarketRecord(marketData: CreateMarketDTO): Promise<Market> {
  return db.market.upsert({
    where: { id: txHash },
    update: {},
    create: {
      id: txHash,
      contractAddress: marketData.contractAddress ?? "",
      fighterA: marketData.fighterA,
      fighterB: marketData.fighterB,
      scheduledAt: marketData.scheduledAt,
      bettingEndsAt: marketData.bettingEndsAt,
      createdAt: new Date(),
      createdBy: marketData.createdBy,
      oracleAddress: marketData.oracleAddress ?? "",
      txHash,
      status: "Open",
    },
  });
}

/**
 * Creates or updates a market record from an indexed MarketCreated event.
 *
 * If an optimistic row exists with a matching txHash, it reconciles by:
 * 1. Deleting the optimistic row (which used txHash as its id)
 * 2. Upserting with the real on-chain market_id
 *
 * The entire reconciliation runs inside an interactive Prisma transaction
 * to avoid race conditions with concurrent indexer or API calls.
 */
export async function createMarketRecord(
  marketData: CreateMarketDTO
): Promise<Market> {
  return db.$transaction(async (tx) => {
    // Check for an existing optimistic row matched by txHash (inside txn)
    if (marketData.txHash) {
      const optimistic = await tx.market.findUnique({
        where: { id: marketData.txHash },
      });

      if (optimistic) {
        // Atomically delete the optimistic row and create the real one
        await tx.market.delete({ where: { id: marketData.txHash! } });
        const market = await tx.market.create({
          data: {
            id: marketData.id,
            contractAddress: marketData.contractAddress,
            fighterA: marketData.fighterA,
            fighterB: marketData.fighterB,
            scheduledAt: marketData.scheduledAt,
            bettingEndsAt: marketData.bettingEndsAt,
            createdAt: marketData.createdAt,
            createdBy: marketData.createdBy,
            oracleAddress: marketData.oracleAddress,
            txHash: marketData.txHash,
            status: "Open",
          },
        });
        logger.info(
          { marketId: marketData.id, txHash: marketData.txHash },
          "Reconciled optimistic market row with on-chain event"
        );
        return market;
      }
    }

    // Standard upsert path — no optimistic row to reconcile
    return tx.market.upsert({
      where: { id: marketData.id },
      update: {
        // Backfill txHash if it was missing on a previous create
        ...(marketData.txHash ? { txHash: marketData.txHash } : {}),
      },
      create: {
        id: marketData.id,
        contractAddress: marketData.contractAddress,
        fighterA: marketData.fighterA,
        fighterB: marketData.fighterB,
        scheduledAt: marketData.scheduledAt,
        bettingEndsAt: marketData.bettingEndsAt,
        createdAt: marketData.createdAt,
        createdBy: marketData.createdBy,
        oracleAddress: marketData.oracleAddress,
        txHash: marketData.txHash,
        status: "Open",
      },
    });
  });
}

/**
 * Fallback reconciliation that re-reads a market's state directly from Soroban RPC.
 * Used when cached data is suspected stale (e.g. admin "force refresh" action).
 * Overwrites the DB row with on-chain truth.
 *
 * Calls the contract's get_market_info() function via a simulated transaction
 * and maps the decoded result to DB columns.
 */
export async function reconcileMarketFromChain(
  marketId: string
): Promise<Market> {
  const market = await db.market.findUnique({ where: { id: marketId } });
  if (!market) {
    throw Object.assign(new Error(`Market not found: ${marketId}`), {
      code: "NOT_FOUND",
    });
  }

  const rpcUrl = process.env.STELLAR_RPC_URL;
  if (!rpcUrl) {
    throw new Error("STELLAR_RPC_URL environment variable is not set");
  }

  const server = new SorobanRpc.Server(rpcUrl);
  const contract = new Contract(market.contractAddress);

  // Use a throwaway keypair as the source account for read-only simulation.
  // The simulation doesn't require a real account with funds — any valid
  // keypair works because the tx is never submitted to the network.
  const throwawayKeypair = Keypair.random();
  const networkPassphrase =
    process.env.STELLAR_NETWORK === "mainnet"
      ? Networks.PUBLIC
      : Networks.TESTNET;

  // Build a minimal transaction for simulating the get_market_info() call
  const account = await server.getAccount(throwawayKeypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("get_market_info"))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(
      `Simulation error for market ${marketId}: ${JSON.stringify(simResult)}`
    );
  }

  if (!simResult.result?.retval) {
    throw new Error(
      `Empty simulation result for market ${marketId}`
    );
  }

  // Convert the ScVal return value to a native JS object.
  // The Market struct fields become object properties.
  const raw = scValToNative(simResult.result.retval) as Record<string, unknown>;

  // Map contract MarketStatus to DB MarketStatus enum
  const statusMap: Record<string, MarketStatus> = {
    Open: "Open",
    Locked: "Locked",
    Resolved: "Resolved",
    Cancelled: "Cancelled",
    Disputed: "Disputed",
  };

  // The contract uses Soroban enums where scValToNative returns { name: "Open" } etc.
  const contractStatus: string =
    typeof raw?.status === "object" && raw?.status !== null
      ? String((raw.status as Record<string, unknown>)?.name ?? "Open")
      : String(raw?.status ?? "Open");

  // Map outcome if present (also a Soroban enum)
  let outcome: Outcome | undefined;
  if (raw?.outcome && typeof raw.outcome === "object") {
    const outcomeName = String(
      (raw.outcome as Record<string, unknown>)?.name ?? ""
    );
    if (["FighterA", "FighterB", "Draw", "NoContest"].includes(outcomeName)) {
      outcome = outcomeName as Outcome;
    }
  }

  const updated = await db.market.update({
    where: { id: marketId },
    data: {
      poolA: BigInt(String(raw?.pool_a ?? 0)),
      poolB: BigInt(String(raw?.pool_b ?? 0)),
      totalPool: BigInt(String(raw?.total_pool ?? 0)),
      status: statusMap[contractStatus] ?? "Open",
      ...(outcome && { outcome }),
    },
  });

  logger.info(
    {
      marketId,
      contractStatus,
      poolA: updated.poolA.toString(),
      poolB: updated.poolB.toString(),
      totalPool: updated.totalPool.toString(),
    },
    "Market reconciled from on-chain state"
  );

  return updated;
}

export async function updateMarketStatus(
  market_id: string,
  status: MarketStatus,
  outcome?: Outcome
): Promise<Market> {
  return db.market.update({
    where: { id: market_id },
    data: {
      status,
      ...(outcome !== undefined && { outcome }),
      ...(status === "Resolved" && { resolvedAt: new Date() }),
    },
  });
}

export async function updateMarketPools(
  market_id: string,
  pool_a: bigint,
  pool_b: bigint
): Promise<void> {
  await db.market.update({
    where: { id: market_id },
    data: { poolA: pool_a, poolB: pool_b, totalPool: pool_a + pool_b },
  });
}

export async function getMarketStats(market_id: string): Promise<MarketStats> {
  const market = await db.market.findUnique({
    where: { id: market_id },
    include: { bets: true },
  });

  if (!market) {
    throw Object.assign(new Error("Market not found"), { code: "NOT_FOUND" });
  }

  const totalBets = market.bets.length;
  const uniqueBettors = new Set(market.bets.map((b) => b.bettor)).size;
  const poolA = market.poolA;
  const poolB = market.poolB;
  const totalVolume = market.totalPool;

  const impliedOddsA =
    totalVolume > 0n ? Number((poolA * 10000n) / totalVolume) / 100 : 50;
  const impliedOddsB =
    totalVolume > 0n ? Number((poolB * 10000n) / totalVolume) / 100 : 50;

  return {
    totalBets,
    uniqueBettors,
    poolA,
    poolB,
    totalVolume,
    impliedOddsA,
    impliedOddsB,
  };
}

/**
 * Returns a paginated leaderboard of bettors for a market, sorted by total staked descending.
 * Groups bets by bettor and aggregates total staked and bet count.
 */
export async function getMarketLeaderboard(
  market_id: string,
  pagination?: Pagination
): Promise<LeaderboardEntry[]> {
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const skip = (page - 1) * limit;

  const bets = await db.bet.findMany({
    where: { marketId: market_id },
    select: { bettor: true, amount: true },
  });

  // Aggregate by bettor
  const bettorMap = new Map<string, { totalStaked: bigint; betCount: number }>();
  for (const bet of bets) {
    const existing = bettorMap.get(bet.bettor);
    if (existing) {
      existing.totalStaked += bet.amount;
      existing.betCount += 1;
    } else {
      bettorMap.set(bet.bettor, { totalStaked: bet.amount, betCount: 1 });
    }
  }

  // Sort by totalStaked desc, apply pagination
  const sorted = Array.from(bettorMap.entries())
    .map(([bettor, stats]) => ({ bettor, ...stats }))
    .sort((a, b) => (b.totalStaked > a.totalStaked ? 1 : b.totalStaked < a.totalStaked ? -1 : 0));

  return sorted.slice(skip, skip + limit);
}

/**
 * Admin resolves a market with a final outcome.
 * Updates market status to Resolved and writes an AdminLog entry.
 */
export async function resolveMarket(
  marketId: string,
  outcome: Outcome,
  source: string,
  admin: string
): Promise<Market> {
  const market = await prisma.market.update({
    where: { id: marketId },
    data: {
      status: MarketStatus.Resolved,
      outcome,
      resolvedAt: new Date(),
    },
  });

  await prisma.adminLog.create({
    data: {
      action: "RESOLVE_MARKET",
      actor: admin,
      target: marketId,
      metadata: { outcome, source },
    },
  });

  return market;
}

/**
 * Admin cancels a market (e.g., fight postponed, insufficient liquidity).
 * Updates market status to Cancelled and writes an AdminLog entry.
 */
export async function cancelMarket(
  marketId: string,
  admin: string,
  reason?: string
): Promise<Market> {
  const market = await prisma.market.update({
    where: { id: marketId },
    data: {
      status: MarketStatus.Cancelled,
      resolvedAt: new Date(),
    },
  });

  await prisma.adminLog.create({
    data: {
      action: "CANCEL_MARKET",
      actor: admin,
      target: marketId,
      metadata: reason ? { reason } : undefined,
    },
  });

  return market;
}

/**
 * Admin resolves a disputed market with an override outcome.
 * Writes an AdminLog entry recording the resolution.
 */
export async function resolveMarketDispute(
  marketId: string,
  overrideOutcome: Outcome,
  admin: string,
  resolution?: string
): Promise<Market> {
  const market = await prisma.market.update({
    where: { id: marketId },
    data: {
      status: MarketStatus.Resolved,
      outcome: overrideOutcome,
      resolvedAt: new Date(),
    },
  });

  await prisma.adminLog.create({
    data: {
      action: "RESOLVE_DISPUTE",
      actor: admin,
      target: marketId,
      metadata: { overrideOutcome, resolution },
    },
  });

  return market;
}
