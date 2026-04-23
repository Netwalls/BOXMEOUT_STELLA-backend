// ============================================================
// BOXMEOUT — Oracle Service
// Responsible for fetching fight results from external sources
// and submitting them to Market contracts on Stellar.
// Contributors: implement every function marked TODO.
// ============================================================

import type { OracleReport } from '../models/OracleReport';

export type FightOutcome = 'fighter_a' | 'fighter_b' | 'draw' | 'no_contest';

/**
 * Polls external boxing data sources for confirmed fight results.
 *
 * Called on a cron schedule — every 5 minutes after a fight's scheduled_at.
 *
 * Steps:
 *   1. Query DB for markets with status = "locked" and scheduled_at < now
 *   2. For each, call fetchPrimaryResult(match_id)
 *   3. If result found and confirmed, call submitFightResult(match_id, outcome)
 *   4. Log failures but do not throw — continue to next market
 */
export async function pollFightResults(): Promise<void> {
  // TODO: implement
}

/**
 * Constructs and submits a resolve_market transaction to Stellar.
 *
 * Steps:
 *   1. Build OracleReport: { match_id, outcome, reported_at: now }
 *   2. Sign the report with the oracle's Ed25519 keypair
 *      (keypair loaded from ORACLE_PRIVATE_KEY env var)
 *   3. Retrieve market contract address from DB by match_id
 *   4. Call StellarService.invokeContract("resolve_market", [oracle_address, report])
 *   5. Save OracleReport to DB with accepted = true
 *   6. Return the saved OracleReport
 */
export async function submitFightResult(
  match_id: string,
  outcome: FightOutcome,
): Promise<OracleReport> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Verifies the authenticity of an OracleReport.
 *
 * Steps:
 *   1. Reconstruct the signed message: Buffer.concat([match_id, outcome, reported_at])
 *   2. Verify report.signature using Ed25519 against oracle_address public key
 *   3. Check oracle_address is in current oracle whitelist (DB cache or factory read)
 *
 * Returns true if valid, false otherwise. Never throws.
 */
export async function verifyOracleReport(report: OracleReport): Promise<boolean> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Returns the oracle's Stellar G... public address derived from ORACLE_PRIVATE_KEY.
 * Used by the frontend to identify which oracle resolved a market.
 */
export function getOraclePublicKey(): string {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Queries a secondary boxing data source (fallback oracle) for a fight result.
 * Used when the primary source is unavailable or returns conflicting data.
 * Returns the outcome string if found, null if the result is not yet available.
 */
export async function fetchFallbackResult(
  match_id: string,
): Promise<FightOutcome | null> {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Admin manual override for fight result resolution.
 * Used during dispute resolution when automated oracles are wrong.
 *
 * Steps:
 *   1. Verify admin_signature is from a known admin address
 *   2. Build OracleReport with oracle_used = "admin"
 *   3. Call StellarService.invokeContract("resolve_dispute", [admin, final_outcome])
 *   4. Save OracleReport to DB
 *
 * Requires ADMIN_PRIVATE_KEY to be set in environment.
 */
export async function adminOverrideResult(
  match_id: string,
  outcome: FightOutcome,
  admin_signature: string,
): Promise<void> {
  // TODO: implement
}
