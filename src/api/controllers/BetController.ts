// ============================================================
// BOXMEOUT — Bet Controller
// Claim endpoints for winning bettors.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StrKey } from '@stellar/stellar-sdk';
import * as BetService from '../../services/BetService';

const claimBodySchema = z.object({
  market_id: z.string().min(1, 'market_id is required'),
  bettor_address: z
    .string()
    .refine((v) => StrKey.isValidEd25519PublicKey(v), {
      message: 'Invalid Stellar address format for bettor_address',
    }),
  token_address: z
    .string()
    .refine((v) => StrKey.isValidEd25519PublicKey(v), {
      message: 'Invalid Stellar address format for token_address',
    }),
});

/**
 * POST /api/claims
 * Body: { market_id, bettor_address, token_address }
 *
 * Submits a claim_winnings transaction for a winning bettor.
 * Returns the transaction hash. The DB is updated asynchronously
 * by the indexer when it picks up the WinningsClaimed event.
 */
export async function claimWinnings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = claimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ errors });
      return;
    }

    const { market_id, bettor_address, token_address } = parsed.data;
    const tx_hash = await BetService.claimWinnings(market_id, bettor_address, token_address);
    res.status(200).json({ tx_hash });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/claims/refund
 * Body: { market_id, bettor_address, token_address }
 *
 * Submits a claim_refund transaction for a cancelled market.
 * Returns the transaction hash.
 */
export async function claimRefund(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = claimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ errors });
      return;
    }

    const { market_id, bettor_address, token_address } = parsed.data;
    const tx_hash = await BetService.claimRefund(market_id, bettor_address, token_address);
    res.status(200).json({ tx_hash });
  } catch (err) {
    next(err);
  }
}
