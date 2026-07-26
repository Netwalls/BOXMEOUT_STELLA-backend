import { Market, MarketStatus, Outcome, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface MarketFilters {
  status?: MarketStatus;
  weightClass?: string;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface MarketStats {
  totalBets: number;
  uniqueBettors: number;
  poolA: bigint;
  poolB: bigint;
  totalVolume: bigint;
  impliedOddsA: number; // payout multiplier: (total_pool - fee) / pool_a
  impliedOddsB: number; // payout multiplier: (total_pool - fee) / pool_b
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

/**
 * Fetches all markets from the database with optional filters and pagination.
 * Returns results ordered by scheduledAt ascending.
 */
export async function getAllMarkets(
  filters?: MarketFilters,
  pagination?: Pagination
): Promise<Market[]> {
  throw new Error("Not implemented");
}

/**
 * Fetches a single market by its on-chain market_id.
 * Returns null if not found — does NOT throw.
 */
export async function getMarketById(market_id: string): Promise<Market | null> {
  throw new Error("Not implemented");
}

/**
 * Persists a newly deployed market to the database.
 * Called by the indexer on MarketCreated event.
 * Must be idempotent — safe to call again on event replay.
 */
export async function createMarketRecord(
  marketData: CreateMarketDTO
): Promise<Market> {
  throw new Error("Not implemented");
}

/**
 * Updates a market's status and optional outcome in the database.
 * Called when the indexer detects MarketLocked, MarketResolved, or Cancelled events.
 */
export async function updateMarketStatus(
  market_id: string,
  status: MarketStatus,
  outcome?: Outcome
): Promise<Market> {
  throw new Error("Not implemented");
}

/**
 * Updates pool_a, pool_b, and total_pool after each BetPlaced event.
 * Keeps the database in sync with on-chain pool state.
 */
export async function updateMarketPools(
  market_id: string,
  pool_a: bigint,
  pool_b: bigint
): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Returns aggregate stats: total bets, unique bettors, pool sizes, implied odds.
 */
export async function getMarketStats(market_id: string): Promise<MarketStats> {
  throw new Error("Not implemented");
}

/**
 * Returns the top bettors by stake size for a given market.
 */
export async function getMarketLeaderboard(
  market_id: string
): Promise<LeaderboardEntry[]> {
  throw new Error("Not implemented");
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
