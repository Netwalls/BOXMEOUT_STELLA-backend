import { Dispute, Market, OracleResult, Outcome } from "@prisma/client";

export interface ExternalFightResult {
  matchId: string;
  winner: "FighterA" | "FighterB" | "Draw" | "NoContest";
  method: string;   // e.g. "KO", "TKO", "Decision"
  round: number;
  source: string;
  reportedAt: Date;
}

/**
 * Records a fight result from an authorized oracle or admin.
 * Persists to OracleResult table with confirmed=false.
 * Does NOT trigger on-chain resolution — confirmFightResult() does that.
 */
export async function submitFightResult(
  market_id: string,
  outcome: Outcome,
  source: string,
  reporter: string
): Promise<OracleResult> {
  throw new Error("Not implemented");
}

/**
 * Admin approves an oracle result and triggers on-chain resolve_market().
 * Sets OracleResult.confirmed = true and syncs market status in DB.
 */
export async function confirmFightResult(
  oracle_result_id: string,
  admin: string
): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Queries an external boxing data API (BoxRec, ESPN) for fight outcome.
 * Returns normalized result or null if fight not yet reported.
 */
export async function fetchExternalResult(
  market_id: string
): Promise<ExternalFightResult | null> {
  throw new Error("Not implemented");
}

/**
 * Returns all markets in Locked status without a confirmed oracle result.
 * Used by admin dashboard to show fights awaiting resolution.
 */
export async function listPendingResolutions(): Promise<Market[]> {
  throw new Error("Not implemented");
}

/**
 * Records a dispute in DB and submits raise_dispute() on-chain.
 * Notifies admin via internal alert.
 */
export async function raiseDispute(
  market_id: string,
  bettor: string,
  reason: string
): Promise<Dispute> {
  throw new Error("Not implemented");
}

/**
 * Admin resolves a dispute with a final outcome (may override oracle).
 * Calls resolve_dispute() on-chain and updates DB dispute record.
 */
export async function resolveDispute(
  dispute_id: string,
  override_outcome: Outcome,
  admin: string
): Promise<void> {
  throw new Error("Not implemented");
}
