// ============================================================
// BOXMEOUT — Market Controller
// Handles HTTP requests for market-related endpoints.
// Contributors: implement every function marked TODO.
// ============================================================

import type { Request, Response } from 'express';

/**
 * GET /api/markets
 * Query params: status, weight_class, page (default 1), limit (default 20)
 *
 * Returns paginated market list.
 * Validates query params with Zod before passing to MarketService.
 * Responds 400 on invalid params, 200 with { markets, total, page, limit }.
 */
export async function listMarkets(req: Request, res: Response): Promise<void> {
  // TODO: implement
}

/**
 * GET /api/markets/:market_id
 *
 * Returns full market detail including current odds.
 * Responds 404 if market_id not found, 200 with Market object.
 */
export async function getMarket(req: Request, res: Response): Promise<void> {
  // TODO: implement
}

/**
 * GET /api/markets/:market_id/bets
 * Query params: address (optional — filter to one bettor)
 *
 * Returns all bets for a market.
 * Responds 404 if market not found, 200 with Bet[].
 */
export async function getMarketBets(req: Request, res: Response): Promise<void> {
  // TODO: implement
}

/**
 * GET /api/markets/:market_id/stats
 *
 * Returns aggregate market statistics.
 * Responds 404 if market not found, 200 with MarketStats.
 */
export async function getMarketStats(req: Request, res: Response): Promise<void> {
  // TODO: implement
}
