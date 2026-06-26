import { markBetClaimed } from "./bet.service";

export interface SorobanEvent {
  type: string;
  contractId: string;
  ledger: number;
  ledgerClosedAt: string;
  body: Record<string, unknown>;
  txHash: string;
}

export interface LedgerData {
  sequence: number;
  closedAt: string;
  events: SorobanEvent[];
}

/**
 * Bootstraps the blockchain event listener.
 * Connects to Stellar Horizon/Soroban RPC from env config.
 * Registers all event handlers and polls from last indexed ledger.
 * Long-lived process — run as a background worker.
 */
export async function startIndexer(): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Reads the last successfully processed ledger from IndexerState table.
 * Returns 0 on a fresh start with no prior indexed state.
 */
export async function getLastIndexedLedger(): Promise<number> {
  throw new Error("Not implemented");
}

/**
 * Persists the latest processed ledger to IndexerState table.
 * Called after each successfully processed ledger batch.
 */
export async function saveLastIndexedLedger(ledger: number): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Processes all contract events in a single ledger.
 * Routes each event to the appropriate handler by event.type.
 * Must be atomic — either all handlers succeed or none persist.
 */
export async function processLedger(ledger: LedgerData): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Parses MarketCreated event and calls market.service.createMarketRecord().
 */
export async function handleMarketCreatedEvent(event: SorobanEvent): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Parses BetPlaced event, calls bet.service.recordBet()
 * and market.service.updateMarketPools() with updated totals.
 */
export async function handleBetPlacedEvent(event: SorobanEvent): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Parses MarketResolved event and calls market.service.updateMarketStatus()
 * with the final outcome decoded from the event body.
 */
export async function handleMarketResolvedEvent(event: SorobanEvent): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Parses WinningsClaimed or RefundClaimed event.
 * Calls bet.service.markBetClaimed() with the payout amount.
 */
export async function handleWinnersClaimedEvent(event: SorobanEvent): Promise<void> {
  const { bet_id, payout } = event.body as { bet_id: string; bettor: string; payout: string };
  await markBetClaimed(bet_id, BigInt(payout));
}

/**
 * Parses MarketLocked event and sets market status to Locked in DB.
 */
export async function handleMarketLockedEvent(event: SorobanEvent): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Parses DisputeRaised or DisputeResolved events and syncs dispute state to DB.
 */
export async function handleDisputeEvent(event: SorobanEvent): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * Replays a ledger range to catch events missed during downtime.
 * All handlers use upsert patterns so replays create no duplicates.
 */
export async function recoverMissedEvents(
  fromLedger: number,
  toLedger: number
): Promise<void> {
  const latest = await getLastIndexedLedger();
  if (fromLedger > latest) return;

  const rpcUrl = process.env.SOROBAN_RPC_URL;
  for (let seq = fromLedger; seq <= toLedger; seq++) {
    const res = await fetch(rpcUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: seq, method: "getLedgers", params: { startLedger: seq, limit: 1 } }),
    });
    const json = await res.json() as { result: { ledgers: LedgerData[] } };
    const ledger = json.result.ledgers[0];
    if (ledger) await processLedger(ledger);
    if ((seq - fromLedger + 1) % 100 === 0) {
      console.log(`recoverMissedEvents: processed ${seq - fromLedger + 1} ledgers (${seq}/${toLedger})`);
    }
  }
}
