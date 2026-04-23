// ============================================================
// BOXMEOUT — Admin Controller
// All routes protected by JWT middleware + admin role check.
// ============================================================

import type { Request, Response } from 'express';

/**
 * POST /api/admin/dispute/:market_id
 * Body: { reason: string }
 *
 * Flags a market as disputed.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate market exists and is in "resolved" status
 *   3. Call StellarService.invokeContract("dispute_market", [admin, reason])
 *   4. Respond 200 with { tx_hash }
 */
export async function flagDispute(
  req: Request,
  res: Response,
): Promise<void> {
  // TODO: implement
}

/**
 * POST /api/admin/resolve-dispute/:market_id
 * Body: { outcome: string, totp_code: string }
 *
 * Resolves a disputed market with the admin-verified outcome.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate TOTP code (2FA) before proceeding
 *   3. Call OracleService.adminOverrideResult(match_id, outcome, admin_signature)
 *   4. Respond 200 with { tx_hash }
 */
export async function resolveDispute(
  req: Request,
  res: Response,
): Promise<void> {
  // TODO: implement
}

/**
 * POST /api/admin/cancel/:market_id
 * Body: { reason: string }
 *
 * Cancels a market — used when a fight is postponed or called off.
 * Steps:
 *   1. Require admin JWT (middleware)
 *   2. Validate market exists and is in "open" or "locked" status
 *   3. Call StellarService.invokeContract("cancel_market", [admin, reason])
 *   4. Respond 200 with { tx_hash }
 */
export async function cancelMarket(
  req: Request,
  res: Response,
): Promise<void> {
  // TODO: implement
}
