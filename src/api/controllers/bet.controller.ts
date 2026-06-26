import { Request, Response, NextFunction } from "express";
import * as betService from "../../services/bet.service";

/**
 * GET /api/bets/:address
 * Returns all bets placed by a Stellar address.
 * Supports optional query params: status, marketId.
 */
export async function getBetsByAddressHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/bets/:address/portfolio (issue #907)
 * Returns portfolio summary (total staked, winnings, ROI) for an address.
 * Returns zero-value summary (never 404) for unknown addresses.
 */
export async function getPortfolioHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { address } = req.params;

    // Basic Stellar public key validation (G..., 56 chars, base32)
    if (typeof address !== "string" || !address.startsWith("G") || address.length !== 56) {
      res.status(400).json({ error: "Invalid Stellar address format", code: "VALIDATION_ERROR" });
      return;
    }

    const portfolio = await betService.getPortfolioSummary(address);
    res.status(200).json(portfolio);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bets/payout-estimate
 * Query params: market_id, side, amount
 * Returns estimated payout without placing a real bet.
 */
export async function getPayoutEstimateHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}
