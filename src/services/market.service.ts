import { Market, MarketStatus, Outcome } from "@prisma/client";
import { db } from "../db";

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

export async function getMarketById(market_id: string): Promise<Market | null> {
  return db.market.findUnique({ where: { id: market_id } });
}

export async function createMarketRecord(marketData: CreateMarketDTO): Promise<Market> {
  return db.market.upsert({
    where: { id: marketData.id },
    update: {},
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
    },
  });
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
      ...(status === MarketStatus.Resolved && { resolvedAt: new Date() }),
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

  return { totalBets, uniqueBettors, poolA, poolB, totalVolume, impliedOddsA, impliedOddsB };
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
