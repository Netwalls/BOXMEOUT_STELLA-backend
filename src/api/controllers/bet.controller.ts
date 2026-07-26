import { Request, Response } from "express";
import * as betService from "../../services/bet.service";

/**
 * GET /api/bets/:address
 * Returns all bets placed by a Stellar address across all markets.
 * Supports optional query params: status, marketId.
 */
export async function getBetsByAddressHandler(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;
    const { marketId } = req.query;

    const bets = await betService.getBetsByAddress(address, {
      marketId: marketId as string | undefined,
    });

    res.status(200).json({ bets });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bets", code: "INTERNAL_ERROR" });
  }
}

/**
 * GET /api/bets/:address/portfolio
 * Returns portfolio summary (total staked, winnings, ROI) for an address.
 */
export async function getPortfolioHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/bets/payout-estimate
 * Query params: market_id, side, amount
 * Returns estimated payout without placing a real bet.
 */
export async function getPayoutEstimateHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}
