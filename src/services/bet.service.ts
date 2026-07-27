import { Bet, BetSide } from "@prisma/client";
import { db } from "../db";

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
  roi: number;
}

export async function getBetsByAddress(
  address: string,
  filters?: BetFilters
): Promise<Bet[]> {
  const where: Record<string, unknown> = { bettor: address };

  if (filters?.marketId) {
    where.marketId = filters.marketId;
  }

  if (filters?.status === "claimed") {
    where.claimed = true;
  } else if (filters?.status === "pending") {
    where.claimed = false;
  } else if (filters?.status === "won" || filters?.status === "lost") {
    const bets = await db.bet.findMany({
      where,
      include: { market: true },
      orderBy: { placedAt: "desc" },
    });
    return bets.filter((bet) => {
      if (!bet.market.outcome) return false;
      const won = bet.market.outcome === bet.side;
      return filters.status === "won" ? won : !won;
    });
  }

  return db.bet.findMany({
    where,
    orderBy: { placedAt: "desc" },
  });
}

export async function getBetsByMarket(market_id: string): Promise<Bet[]> {
  return db.bet.findMany({ where: { marketId: market_id } });
}

export async function recordBet(betData: CreateBetDTO): Promise<Bet> {
  const market = await db.market.findUnique({ where: { id: betData.marketId } });
  if (!market) throw new Error(`Market not found: ${betData.marketId}`);

  return db.bet.upsert({
    where: { id: betData.id },
    update: {},
    create: {
      id: betData.id,
      marketId: betData.marketId,
      bettor: betData.bettor,
      side: betData.side,
      amount: betData.amount,
      placedAt: betData.placedAt,
      txHash: betData.txHash,
    },
  });
}

export async function markBetClaimed(bet_id: string, payout: bigint): Promise<Bet> {
  return db.bet.update({
    where: { id: bet_id },
    data: { claimed: true, claimedAt: new Date(), payout },
  });
}

/**
 * Marks a bet as claimed by matching on (marketId, bettor).
 * Used for winnings_claimed / refund_claimed events which identify
 * the bet by market and bettor. Uses updateMany for atomicity.
 */
export async function markBetClaimedByMarketAndBettor(
  marketId: string,
  bettor: string,
  payout: bigint
): Promise<void> {
  await db.bet.updateMany({
    where: { marketId, bettor, claimed: false },
    data: { claimed: true, claimedAt: new Date(), payout },
  });
}

export async function calculatePotentialPayout(
  market_id: string,
  side: BetSide,
  amount: bigint
): Promise<bigint> {
  const market = await db.market.findUnique({ where: { id: market_id } });
  if (!market) throw new Error(`Market not found: ${market_id}`);

  const poolSide = side === "FighterA" ? market.poolA : market.poolB;
  if (poolSide === 0n) return 0n;

  const totalPool = market.totalPool;
  const FEE_BP = 200n; // 2% = 200 basis points
  const fee = (totalPool * FEE_BP) / 10000n;
  const netPool = totalPool - fee;

  const payout = (amount * netPool) / (poolSide + amount);
  return payout;
}

/**
 * Returns a portfolio summary for a Stellar address.
 * - totalStaked: sum of all bet amounts
 * - totalWinnings: sum of payouts from claimed winning bets
 * - pendingClaims: sum of amounts on winning bets not yet claimed
 * - activeBets: bets on markets still Open or Locked (not resolved)
 * - completedBets: bets on Resolved or Cancelled markets
 * - roi: (totalWinnings - totalStaked) / totalStaked * 100, or 0 if no staked amount
 *
 * Always returns a value — never throws 404 for unknown addresses.
 */
export async function getPortfolioSummary(address: string): Promise<PortfolioSummary> {
  const bets = await db.bet.findMany({
    where: { bettor: address },
    include: { market: true },
  });

  if (bets.length === 0) {
    return {
      totalStaked: 0n,
      totalWinnings: 0n,
      pendingClaims: 0n,
      activeBets: 0,
      completedBets: 0,
      roi: 0,
    };
  }

  let totalStaked = 0n;
  let totalWinnings = 0n;
  let pendingClaims = 0n;
  let activeBets = 0;
  let completedBets = 0;

  for (const bet of bets) {
    totalStaked += bet.amount;

    const isResolved =
      bet.market.status === "Resolved" || bet.market.status === "Cancelled";

    if (isResolved) {
      completedBets += 1;

      // Check if this bet won
      const won =
        bet.market.outcome !== null && bet.market.outcome === bet.side;

      if (won) {
        if (bet.claimed && bet.payout !== null) {
          // Already claimed — count actual payout
          totalWinnings += bet.payout;
        } else if (!bet.claimed) {
          // Won but not yet claimed — count as pending
          pendingClaims += bet.amount;
        }
      }
    } else {
      // Market still active (Open, Locked, Disputed)
      activeBets += 1;
    }
  }

  const roi =
    totalStaked > 0n
      ? (Number(totalWinnings - totalStaked) / Number(totalStaked)) * 100
      : 0;

  return {
    totalStaked,
    totalWinnings,
    pendingClaims,
    activeBets,
    completedBets,
    roi,
  };
}
