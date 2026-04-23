// ============================================================
// BOXMEOUT — Market Service
// Business logic layer between controllers and the DB/chain.
// Contributors: implement every function marked TODO.
// ============================================================

import type { Market, MarketStats } from '../models/Market';
import type { Bet } from '../models/Bet';

export interface MarketFilters {
  status?: string;
  weight_class?: string;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface MarketListResult {
  markets: Market[];
  total: number;
}

export interface MarketOdds {
  odds_a: number;   // Implied probability in basis points
  odds_b: number;
  odds_draw: number;
}

export interface Portfolio {
  address: string;
  active_bets: Bet[];
  past_bets: Bet[];
  total_staked_xlm: number;
  total_won_xlm: number;
  total_lost_xlm: number;
  pending_claims: Bet[];
}

/**
 * Returns paginated markets from the database.
 *
 * Steps:
 *   1. Build WHERE clause from filters (status, weight_class)
 *   2. Apply pagination (LIMIT / OFFSET)
 *   3. Check Redis cache — return cached result if fresh (TTL 30s)
 *   4. Query DB if cache miss; store result in cache before returning
 *   5. Sort by scheduled_at ASC by default
 */
export async function getMarkets(
  filters?: MarketFilters,
  pagination?: Pagination,
): Promise<MarketListResult> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Returns a single market by its on-chain market_id string.
 * Throws NotFoundError (HTTP 404) if market_id does not exist in DB.
 */
export async function getMarketById(market_id: string): Promise<Market> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Returns live odds for a market.
 *
 * Formula: odds_x = floor(pool_x * 10_000 / total_pool)
 * Falls back to querying the Market contract via StellarService.readContractState()
 * if DB pool sizes are stale (updated_at older than 30 seconds).
 */
export async function getMarketOdds(market_id: string): Promise<MarketOdds> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Returns all bets for a given market.
 * If bettor_address is provided, filters to only that bettor's bets.
 */
export async function getBetsByMarket(
  market_id: string,
  bettor_address?: string,
): Promise<Bet[]> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Returns aggregate statistics for a market.
 * Values are computed from the bets table, not from on-chain.
 * Results cached in Redis for 60 seconds.
 */
export async function getMarketStats(market_id: string): Promise<MarketStats> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Returns a portfolio summary for a Stellar address.
 *
 * active_bets:    bets in Open/Locked markets
 * past_bets:      bets in Resolved/Cancelled markets
 * pending_claims: unclaimed winning bets in Resolved markets
 * Totals are computed in XLM (divide stroops by 10_000_000).
 */
export async function getPortfolioByAddress(
  bettor_address: string,
): Promise<Portfolio> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Returns all markets in which a given address has at least one bet.
 * Used as a helper by getPortfolioByAddress.
 */
export async function getMarketsByBettor(
  bettor_address: string,
): Promise<Market[]> {
  // TODO: implement
  throw new Error('Not implemented');
}
