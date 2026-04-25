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

import { pool } from '../config/db';
import { rpc } from '@stellar/stellar-sdk';

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

const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const FACTORY_CONTRACT = process.env.FACTORY_CONTRACT_ADDRESS || '';
const TREASURY_CONTRACT = process.env.TREASURY_CONTRACT_ADDRESS || '';

const server = new rpc.Server(RPC_URL);

export async function startIndexer(): Promise<void> {
  // TODO: implement
}

export async function processLedger(ledger_sequence: number): Promise<void> {
  try {
    const request: rpc.Api.GetEventsRequest = {
      startLedger: ledger_sequence,
      filters: [
        {
          type: 'contract',
          contractIds: [FACTORY_CONTRACT, TREASURY_CONTRACT],
          topics: [['*']]
        }
      ],
      limit: 100
    };

    const response = await server.getEvents(request);
    
    if (!response.events || response.events.length === 0) {
      return;
    }

    for (const event of response.events) {
      const contractId = typeof event.contractId === 'string' ? event.contractId : event.contractId?.toString() || '';
      
      const rawEvent: RawStellarEvent = {
        contract_address: contractId,
        event_type: event.topic[0]?.toString() || 'unknown',
        topics: event.topic.map(t => t.toString()),
        data: JSON.stringify(event.value),
        ledger_sequence: event.ledger,
        ledger_close_time: event.ledgerClosedAt,
        tx_hash: event.txHash
      };

      // Persist raw event to blockchain_events table
      await pool.query(
        `INSERT INTO blockchain_events
           (contract_address, event_type, payload, ledger_sequence, ledger_close_time, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_hash) DO NOTHING`,
        [
          rawEvent.contract_address,
          rawEvent.event_type,
          rawEvent.data,
          rawEvent.ledger_sequence,
          rawEvent.ledger_close_time,
          rawEvent.tx_hash
        ]
      );

      // Process the event
      await processEvent(rawEvent);
    }
  } catch (err) {
    console.error(`Error processing ledger ${ledger_sequence}:`, err);
  }
}

export async function processEvent(event: RawStellarEvent): Promise<void> {
  try {
    const eventType = event.event_type;

    if (eventType === 'MarketCreated') {
      await handleMarketCreated(event);
    } else if (eventType === 'BetPlaced') {
      await handleBetPlaced(event);
    } else if (eventType === 'MarketLocked') {
      await handleMarketLocked(event);
    } else if (eventType === 'MarketResolved') {
      await handleMarketResolved(event);
    } else if (eventType === 'MarketCancelled') {
      await handleMarketCancelled(event);
    } else if (eventType === 'WinningsClaimed') {
      await handleWinningsClaimed(event);
    }
  } catch (err) {
    console.error(`Error processing event ${event.tx_hash}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePayload(data: string): Record<string, unknown> {
  try { return JSON.parse(data); } catch { return {}; }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleMarketCreated(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `INSERT INTO markets
       (market_id, contract_address, match_id, fighter_a, fighter_b,
        weight_class, title_fight, venue, scheduled_at, fee_bps, status, ledger_sequence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (market_id) DO NOTHING`,
    [
      p.market_id,
      event.contract_address,
      p.match_id ?? '',
      p.fighter_a ?? '',
      p.fighter_b ?? '',
      p.weight_class ?? '',
      p.title_fight ?? false,
      p.venue ?? '',
      p.scheduled_at ?? new Date(),
      p.fee_bps ?? 200,
      'open',
      event.ledger_sequence,
    ],
  );
}

export async function handleBetPlaced(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO bets
         (market_id, bettor_address, side, amount, amount_xlm, placed_at, tx_hash, ledger_sequence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [
        p.market_id,
        p.bettor_address,
        p.side,
        p.amount,
        Number(p.amount) / 10_000_000,
        p.placed_at ?? new Date(),
        event.tx_hash,
        event.ledger_sequence,
      ],
    );
    const col = p.side === 'fighter_a' ? 'pool_a' : p.side === 'fighter_b' ? 'pool_b' : 'pool_draw';
    await client.query(
      `UPDATE markets
          SET ${col}      = ${col} + $1,
              total_pool  = total_pool + $1,
              updated_at  = NOW()
        WHERE market_id   = $2`,
      [p.amount, p.market_id],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function handleMarketLocked(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `UPDATE markets SET status = 'locked', updated_at = NOW() WHERE market_id = $1`,
    [p.market_id],
  );
}

export async function handleMarketResolved(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update market status and outcome
    await client.query(
      `UPDATE markets
          SET status = 'resolved', outcome = $1, resolved_at = $2, oracle_used = $3, updated_at = NOW()
        WHERE market_id = $4`,
      [p.outcome, event.ledger_close_time, p.oracle_address ?? null, p.market_id],
    );

    // Get all unique bettors for this market
    const { rows: bettors } = await client.query(
      `SELECT DISTINCT bettor_address FROM bets WHERE market_id = $1`,
      [p.market_id]
    );

    // Enqueue notification job for each bettor
    for (const bettor of bettors) {
      await client.query(
        `INSERT INTO notification_jobs (bettor_address, market_id, job_type, status, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [bettor.bettor_address, p.market_id, 'market_resolved', 'pending']
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function handleMarketCancelled(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `UPDATE markets SET status = 'cancelled', updated_at = NOW() WHERE market_id = $1`,
    [p.market_id],
  );
}

export async function handleWinningsClaimed(event: RawStellarEvent): Promise<void> {
  const p = parsePayload(event.data);
  await pool.query(
    `UPDATE bets
        SET claimed = TRUE, claimed_at = NOW(), payout = $1
      WHERE market_id = $2 AND bettor_address = $3`,
    [p.payout ?? null, p.market_id, p.bettor_address],
  );
}

export async function getLastProcessedLedger(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT last_processed_ledger FROM indexer_checkpoints ORDER BY id DESC LIMIT 1`,
  );
  return rows[0]?.last_processed_ledger ?? Number(process.env.GENESIS_LEDGER ?? 0);
}

export async function saveCheckpoint(ledger_sequence: number): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_checkpoints (id, last_processed_ledger)
     VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE
       SET last_processed_ledger = EXCLUDED.last_processed_ledger,
           updated_at = NOW()`,
    [ledger_sequence],
  );
}

export async function backfillLedgerRange(
  from_ledger: number,
  to_ledger: number,
  batch_size: number,
): Promise<void> {
  for (let l = from_ledger; l <= to_ledger; l += batch_size) {
    const end = Math.min(l + batch_size - 1, to_ledger);
    for (let seq = l; seq <= end; seq++) {
      await processLedger(seq);
    }
  }
}
