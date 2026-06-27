import { Request, Response } from "express";
import { BetSide } from "@prisma/client";
import { logger } from "../../logger";
import { Request, Response, NextFunction } from "express";
import * as betService from "../../services/bet.service";

export async function getBetsByAddressHandler(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;
    const { status, marketId } = req.query as {
      status?: betService.BetFilters["status"];
      marketId?: string;
    };
    const bets = await betService.getBetsByAddress(address, { status, marketId });
    res.json({ data: bets });
  } catch (err) {
    logger.error({ err }, "getBetsByAddressHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getPortfolioHandler(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;
    const portfolio = await betService.getPortfolioSummary(address);
    res.json({ data: portfolio });
  } catch (err) {
    logger.error({ err }, "getPortfolioHandler failed");
    res.status(500).json({ error: "Internal server error" });
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

export async function getPayoutEstimateHandler(req: Request, res: Response): Promise<void> {
  const { market_id, side, amount } = req.query as Record<string, string>;

  if (!market_id || !side || !amount) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { required: ["market_id", "side", "amount"] },
    });
    return;
  }

  if (!["FighterA", "FighterB"].includes(side)) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { side: "must be FighterA or FighterB" },
    });
    return;
  }

  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { amount: "must be a positive integer" },
    });
    return;
  }

  try {
    const estimatedPayout = await betService.calculatePotentialPayout(
      market_id,
      side as BetSide,
      BigInt(parsedAmount)
    );
    res.json({ data: { estimatedPayout: estimatedPayout.toString() } });
  } catch (err) {
    logger.error({ err }, "getPayoutEstimateHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}
