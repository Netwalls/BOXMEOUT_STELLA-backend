import { Request, Response } from "express";
import { z } from "zod";
import * as betService from "../../services/bet.service";

// Stellar public keys start with G and are 56 characters long
const stellarAddressRegex = /^G[A-Z0-9]{55}$/;

const betsByAddressQuerySchema = z.object({
  status: z.enum(["pending", "won", "lost", "claimed"]).optional(),
  marketId: z.string().optional(),
});

/**
 * GET /api/bets/:address
 */
export async function getBetsByAddressHandler(req: Request, res: Response): Promise<void> {
  const { address } = req.params;

  if (!stellarAddressRegex.test(address)) {
    res.status(400).json({ error: "Invalid Stellar address", code: "INVALID_ADDRESS" });
    return;
  }

  const parsed = betsByAddressQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
    return;
  }

  const bets = await betService.getBetsByAddress(address, parsed.data);
  res.status(200).json(bets);
}

/**
 * GET /api/bets/:address/portfolio
 */
export async function getPortfolioHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/bets/payout-estimate
 */
export async function getPayoutEstimateHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}
