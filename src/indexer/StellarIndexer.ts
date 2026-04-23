// ============================================================
// BOXMEOUT — Stellar Blockchain Indexer
//
// Listens to the Stellar network for contract events emitted
// by MarketFactory, Market, and Treasury contracts.
// Persists all relevant state changes to the PostgreSQL DB.
//
// Contributors: implement every function marked TODO.
// DO NOT change function signatures.
// ============================================================

import type { BlockchainEvent } from '../models/BlockchainEvent';

// Raw event shape returned by Stellar RPC / Horizon
export interface RawStellarEvent {
  contract_address: string;
  event_type: string;
  topics: string[];
  data: string; // XDR-encoded event data
  ledger_sequence: number;
  ledger_close_time: string;
  tx_hash: string;
}

/**
 * Entry point for the indexer process.
 *
 * Steps:
 *   1. Load last processed ledger via getLastProcessedLedger()
 *   2. Enter infinite loop:
 *      a. Fetch next ledger(s) from Stellar RPC
 *      b. Call processLedger() for each new ledger
 *      c. Call saveCheckpoint() after each successful ledger
 *      d. Sleep for POLL_INTERVAL_MS if no new ledgers
 *   3. On unrecoverable error: log and exit (let process manager restart)
 *
 * Should be called once at process startup.
 */
export async function startIndexer(): Promise<void> {
  // TODO: implement
}

/**
 * Fetches all contract events emitted in a single Stellar ledger.
 * Filters to only known contract addresses (factory, all markets, treasury).
 * Calls processEvent() for each event.
 * Events must be processed in ledger order.
 */
export async function processLedger(ledger_sequence: number): Promise<void> {
  // TODO: implement
}

/**
 * Routes a raw blockchain event to the correct domain handler.
 *
 * Routing table:
 *   "MarketCreated"    → handleMarketCreated()
 *   "BetPlaced"        → handleBetPlaced()
 *   "MarketLocked"     → handleMarketLocked()
 *   "MarketResolved"   → handleMarketResolved()
 *   "MarketCancelled"  → handleMarketCancelled()
 *   "WinningsClaimed"  → handleWinningsClaimed()
 *   unknown type       → log warning, skip
 *
 * Persists the raw event to BlockchainEvent table regardless of handler outcome.
 * Marks event.processed = true only after handler succeeds without throwing.
 */
export async function processEvent(event: RawStellarEvent): Promise<void> {
  // TODO: implement
}

/**
 * Handles a MarketCreated event from the MarketFactory contract.
 *
 * Parses event payload to extract: market_id, contract_address, match_id,
 * fighter_a, fighter_b, weight_class, scheduled_at, fee_bps, etc.
 * Inserts a new Market row with status = "open".
 */
export async function handleMarketCreated(event: RawStellarEvent): Promise<void> {
  // TODO: implement
}

/**
 * Handles a BetPlaced event from a Market contract.
 *
 * Parses: bettor_address, market_id, side, amount, placed_at, tx_hash.
 * Inserts a Bet row.
 * Updates Market.pool_a / pool_b / pool_draw / total_pool in DB.
 */
export async function handleBetPlaced(event: RawStellarEvent): Promise<void> {
  // TODO: implement
}

/**
 * Handles a MarketLocked event.
 * Updates Market.status = "locked" for the given market_id.
 */
export async function handleMarketLocked(event: RawStellarEvent): Promise<void> {
  // TODO: implement
}

/**
 * Handles a MarketResolved event.
 *
 * Updates Market.status = "resolved", Market.outcome, Market.resolved_at,
 * and Market.oracle_used from the event payload.
 * Enqueues a push notification job for all bettors in this market.
 */
export async function handleMarketResolved(event: RawStellarEvent): Promise<void> {
  // TODO: implement
}

/**
 * Handles a MarketCancelled event.
 * Updates Market.status = "cancelled".
 * Enqueues refund-available notifications for all bettors.
 */
export async function handleMarketCancelled(event: RawStellarEvent): Promise<void> {
  // TODO: implement
}

/**
 * Handles a WinningsClaimed event.
 *
 * Marks all Bet rows for this (bettor_address, market_id) pair as claimed.
 * Stores the actual payout amount from the event payload.
 */
export async function handleWinningsClaimed(event: RawStellarEvent): Promise<void> {
  // TODO: implement
}

/**
 * Returns the ledger sequence of the last successfully processed ledger.
 * Reads from the indexer_checkpoints table.
 * Returns GENESIS_LEDGER constant if no checkpoint exists yet.
 */
export async function getLastProcessedLedger(): Promise<number> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Persists the latest successfully processed ledger sequence to DB.
 * Called after every successful processLedger() to allow safe restart.
 */
export async function saveCheckpoint(ledger_sequence: number): Promise<void> {
  // TODO: implement
}

/**
 * Reprocesses a historical range of ledgers.
 * Used for reindexing after a DB reset or missed event window.
 *
 * Processes ledgers in ascending order, in batches of batch_size.
 * Existing DB rows for those ledgers should be upserted (not duplicated).
 */
export async function backfillLedgerRange(
  from_ledger: number,
  to_ledger: number,
  batch_size: number,
): Promise<void> {
  // TODO: implement
}
