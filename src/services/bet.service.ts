import { Bet, BetSide, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface BetFilters {
  status?: "pending" | "won" | "lost" | "claimed";
  marketId?: string;
}

export interface CreateBetDTO {
  id: string;
  marketId: string;
  bettor: string;
  side: BetSide;
  amount: bigint;
  placedAt: Date;
  txHash?: string;
}

export interface PortfolioSummary {
  totalStaked: bigint;
  totalWinnings: bigint;
  pendingClaims: bigint;
  activeBets: number;
  completedBets: number;
  roi: number; // e.g. 12.5 = +12.5%
}

/**
 * Fetches all bets placed by a specific Stellar address.
 * Supports optional filters by status and marketId.
 */
export async function getBetsByAddress(
  address: string,
  filters?: BetFilters
): Promise<Bet[]> {
  const where: Record<string, unknown> = { bettor: address };

  if (filters?.marketId) {
    where.marketId = filters.marketId;
  }

  const bets = await prisma.bet.findMany({
    where,
    orderBy: { placedAt: "desc" },
  });

  return bets;
}

/**
 * Fetches all bets for a given market, optionally filtered by outcome (side).
 * @param market_id - The market ID to query
 * @param outcome - Optional filter: "yes" maps to FighterA, "no" maps to FighterB
 */
export async function getBetsByMarket(
  market_id: string,
  outcome?: "yes" | "no"
): Promise<Bet[]> {
  const where: Record<string, unknown> = { marketId: market_id };

  if (outcome === "yes") {
    where.side = BetSide.FighterA;
  } else if (outcome === "no") {
    where.side = BetSide.FighterB;
  }

  const bets = await prisma.bet.findMany({
    where,
    orderBy: { placedAt: "desc" },
  });

  return bets;
}

/**
 * Persists a new bet from the indexer.
 * Must be idempotent — upsert on bet_id to handle event replays.
 */
export async function recordBet(betData: CreateBetDTO): Promise<Bet> {
  throw new Error("Not implemented");
}

/**
 * Marks a bet as claimed and stores the final payout.
 * Called when indexer detects WinningsClaimed or RefundClaimed event.
 */
export async function markBetClaimed(
  bet_id: string,
  payout: bigint
): Promise<Bet> {
  throw new Error("Not implemented");
}

/**
 * Computes estimated payout for a hypothetical bet given current pool sizes.
 * Formula: (amount / (pool_side + amount)) * (total_pool * (1 - fee_rate))
 * Pure calculation — does NOT write to database.
 */
export async function calculatePotentialPayout(
  market_id: string,
  side: BetSide,
  amount: bigint
): Promise<bigint> {
  throw new Error("Not implemented");
}

/**
 * Returns aggregated portfolio stats for a user.
 * Includes total staked, total winnings, unclaimed payouts, and ROI.
 */
export async function getPortfolioSummary(
  address: string
): Promise<PortfolioSummary> {
  throw new Error("Not implemented");
}
