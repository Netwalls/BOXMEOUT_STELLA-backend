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

export async function markBetClaimed(
  bet_id: string,
  payout: bigint
): Promise<Bet> {
  return db.bet.update({
    where: { id: bet_id },
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
 * Computes a portfolio summary for a given Stellar address.
 *
 * Parity with the contract's calculate_payout formula (claim_winnings):
 *
 *   winning_pool = pool_a  (if outcome === FighterA)
 *                  pool_b  (if outcome === FighterB)
 *   fee_amount   = total_pool * protocol_fee_bp / 10_000   (fee_bp = 200 = 2%)
 *   net_pool     = total_pool - fee_amount
 *   payout       = bet.amount * net_pool / winning_pool
 *
 * This is deliberately different from calculatePotentialPayout(), which adds
 * the bet amount to the denominator (pre-bet estimate). Here we use the final
 * locked pool sizes from the DB, matching what the contract will pay out.
 *
 * Returns a zero-value summary (never 404) for unknown addresses.
 */
export async function getPortfolioSummary(
  address: string
): Promise<PortfolioSummary> {
  const bets = await db.bet.findMany({
    where: { bettor: address },
    include: { market: true },
  });

  // Zero-value baseline — returned as-is for unknown addresses.
  let totalStaked = 0n;
  let totalWinnings = 0n;
  let pendingClaims = 0n;
  let activeBets = 0;
  let completedBets = 0;

  const FEE_BP = 200n; // 2% — must stay in sync with contract's protocol_fee_bp default

  for (const bet of bets) {
    const { market } = bet;

    totalStaked += bet.amount;

    // Count bucket based on terminal vs. in-flight market state.
    if (
      market.status === "Open" ||
      market.status === "Locked" ||
      market.status === "Disputed"
    ) {
      activeBets++;
    } else {
      // Resolved, Cancelled
      completedBets++;
    }

    // Accumulate already-claimed winnings (stored by markBetClaimed).
    if (bet.claimed && bet.payout !== null) {
      totalWinnings += bet.payout;
    }

    // Compute pending claimable payout: market Resolved, bet on winning side, not yet claimed.
    if (
      !bet.claimed &&
      market.status === "Resolved" &&
      market.outcome !== null &&
      // Only FighterA / FighterB outcomes produce winnings; Draw / NoContest → Cancelled (refund)
      (market.outcome === "FighterA" || market.outcome === "FighterB") &&
      (bet.side as string) === (market.outcome as string)
    ) {
      const winningPool =
        market.outcome === "FighterA" ? market.poolA : market.poolB;

      if (winningPool > 0n) {
        // Mirror the contract's claim_winnings formula exactly:
        //   payout = bet.amount * net_pool / winning_pool
        const feeAmount = (market.totalPool * FEE_BP) / 10000n;
        const netPool = market.totalPool - feeAmount;
        const estimatedPayout = (bet.amount * netPool) / winningPool;
        pendingClaims += estimatedPayout;
      }
    }
  }

  // ROI = (net profit / total staked) * 100
  // Expressed as a plain JS number (percentage); 0 when nothing has been staked.
  const roi =
    totalStaked > 0n
      ? Number(((totalWinnings - totalStaked) * 10000n) / totalStaked) / 100
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
