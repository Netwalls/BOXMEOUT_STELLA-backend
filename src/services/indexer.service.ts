import { PrismaClient } from "@prisma/client";
import { SorobanRpc } from "@stellar/stellar-sdk";

const prisma = new PrismaClient();

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
  const rpcUrl = process.env.STELLAR_RPC_URL!;
  const contractId = process.env.MARKET_FACTORY_CONTRACT_ID!;
  const server = new SorobanRpc.Server(rpcUrl);

  let backoff = 1000; // ms
  const MAX_BACKOFF = 30_000;

  let fromLedger = await getLastIndexedLedger();
  console.log(`[indexer] Starting from ledger ${fromLedger}`);

  while (true) {
    try {
      const eventsResponse = await server.getEvents({
        startLedger: fromLedger + 1,
        filters: [{ contractIds: [contractId] }],
        limit: 100,
      });

      const byLedger = new Map<number, SorobanEvent[]>();
      for (const raw of eventsResponse.events) {
        const ledger = raw.ledger;
        if (!byLedger.has(ledger)) byLedger.set(ledger, []);
        byLedger.get(ledger)!.push({
          type: raw.type,
          contractId: raw.contractId,
          ledger: raw.ledger,
          ledgerClosedAt: raw.ledgerClosedAt,
          body: raw.value as Record<string, unknown>,
          txHash: raw.txHash,
        });
      }

      for (const [ledgerSeq, events] of [...byLedger.entries()].sort((a, b) => a[0] - b[0])) {
        await processLedger({ sequence: ledgerSeq, closedAt: events[0].ledgerClosedAt, events });
        await saveLastIndexedLedger(ledgerSeq);
        fromLedger = ledgerSeq;
      }

      backoff = 1000;
      await sleep(5_000);
    } catch (err) {
      console.error(`[indexer] Connection error (retrying in ${backoff}ms):`, err);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads the last successfully processed ledger from IndexerState table.
 * Returns 0 on a fresh start with no prior indexed state.
 */
export async function getLastIndexedLedger(): Promise<number> {
  const state = await prisma.indexerState.findUnique({ where: { id: 1 } });
  return state?.lastLedger ?? 0;
}

/**
 * Persists the latest processed ledger to IndexerState table.
 * Called after each successfully processed ledger batch.
 */
export async function saveLastIndexedLedger(ledger: number): Promise<void> {
  await prisma.indexerState.upsert({
    where: { id: 1 },
    update: { lastLedger: ledger },
    create: { id: 1, lastLedger: ledger },
  });
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
  throw new Error("Not implemented");
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
  throw new Error("Not implemented");
}
