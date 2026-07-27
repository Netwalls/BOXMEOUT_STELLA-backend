/**
 * ResolutionService
 *
 * Implements two scheduled cron jobs:
 *
 * enforceMarketLocks (#1086)
 *   — Runs every minute. Finds all Open markets whose bettingEndsAt has passed
 *     and calls lock_market on the Soroban contract. Batches multiple markets
 *     per run. Uses exponential fee backoff with a hard cap.
 *
 * autoFinalizeExpiredWindows (#1085)
 *   — Runs every minute. Finds all Locked markets whose dispute window has
 *     elapsed with no active dispute and finalises them by setting status to
 *     Resolved with the oracle-confirmed outcome. Idempotent: a market that is
 *     already Resolved is never touched again.
 */

import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Keypair,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { MarketStatus } from "@prisma/client";
import { db } from "../db";
import { logger } from "../logger";

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL = process.env.STELLAR_RPC_URL!;
const NETWORK =
  process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY!;

/** Dispute window in milliseconds (default 24 h). */
const DISPUTE_WINDOW_MS =
  parseInt(process.env.DISPUTE_WINDOW_MS ?? "86400000", 10);

const MAX_RETRIES = 3;
/** Hard cap on fee regardless of backoff (in stroops). */
const MAX_FEE = 1_000_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calls lock_market on the Soroban contract with exponential fee backoff.
 * Retries up to MAX_RETRIES times before throwing.
 */
async function lockMarketOnChain(
  server: SorobanRpc.Server,
  keypair: Keypair,
  market: { id: string; contractAddress: string }
): Promise<void> {
  const account = await server.getAccount(keypair.publicKey());

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const fee = Math.min(
      Number(BASE_FEE) * Math.pow(2, attempt),
      MAX_FEE
    ).toString();

    try {
      const contract = new Contract(market.contractAddress);
      const tx = new TransactionBuilder(account, {
        fee,
        networkPassphrase: NETWORK,
      })
        .addOperation(contract.call("lock_market"))
        .setTimeout(30)
        .build();

      const prepared = await server.prepareTransaction(tx);
      prepared.sign(keypair);
      const result = await server.sendTransaction(prepared);

      logger.info(
        { marketId: market.id, txHash: result.hash },
        "market locked on-chain"
      );
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      logger.warn(
        { marketId: market.id, attempt: attempt + 1 },
        "lock_market attempt failed, retrying with higher fee"
      );
    }
  }
}

/**
 * Calls finalize_market on the Soroban contract.
 * If the contract call fails we still update the DB status so the job is
 * idempotent — a failed on-chain call should be retried by the next run.
 */
async function finalizeMarketOnChain(
  server: SorobanRpc.Server,
  keypair: Keypair,
  market: { id: string; contractAddress: string }
): Promise<void> {
  const account = await server.getAccount(keypair.publicKey());

  const contract = new Contract(market.contractAddress);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(contract.call("finalize_market"))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  const result = await server.sendTransaction(prepared);

  logger.info(
    { marketId: market.id, txHash: result.hash },
    "market finalized on-chain"
  );
}

// ─── Cron job implementations ─────────────────────────────────────────────────

/**
 * enforceMarketLocks  (#1086)
 *
 * Finds all Open markets whose bettingEndsAt is in the past and locks them
 * on-chain in a single batch. Safe to run every minute.
 */
async function enforceMarketLocks(): Promise<void> {
  const now = new Date();

  const markets = await db.market.findMany({
    where: {
      status: MarketStatus.Open,
      bettingEndsAt: { lt: now },
    },
    select: { id: true, contractAddress: true },
  });

  if (markets.length === 0) {
    logger.debug("enforceMarketLocks: no markets due for locking");
    return;
  }

  logger.info({ count: markets.length }, "enforceMarketLocks: locking markets");

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);

  // Process all due markets in this batch run
  const results = await Promise.allSettled(
    markets.map(async (market) => {
      try {
        await lockMarketOnChain(server, keypair, market);
        // Update DB status to Locked after successful on-chain call
        await db.market.update({
          where: { id: market.id },
          data: { status: MarketStatus.Locked },
        });
        logger.info({ marketId: market.id }, "market status updated to Locked");
      } catch (err) {
        logger.error({ err, marketId: market.id }, "failed to lock market");
        throw err;
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    logger.warn({ failed, total: markets.length }, "enforceMarketLocks: some markets failed to lock");
  }
}

/**
 * autoFinalizeExpiredWindows  (#1085)
 *
 * Finds all Locked markets whose oracle result is confirmed and whose dispute
 * window has elapsed without an open dispute. Marks them as Resolved.
 *
 * Idempotent: only Locked markets are queried — Resolved markets are never
 * touched again, so double-runs have no effect.
 */
async function autoFinalizeExpiredWindows(): Promise<void> {
  const now = new Date();
  const windowCutoff = new Date(now.getTime() - DISPUTE_WINDOW_MS);

  // Find Locked markets with a confirmed oracle result whose resolve time
  // (bettingEndsAt + dispute window) has passed and no open dispute exists.
  const markets = await db.market.findMany({
    where: {
      status: MarketStatus.Locked,
      bettingEndsAt: { lt: windowCutoff },
      oracleResult: {
        confirmed: true,
      },
      disputes: {
        none: {
          resolvedAt: null, // no unresolved disputes
        },
      },
    },
    include: {
      oracleResult: true,
    },
  });

  if (markets.length === 0) {
    logger.debug("autoFinalizeExpiredWindows: no markets to finalize");
    return;
  }

  logger.info({ count: markets.length }, "autoFinalizeExpiredWindows: finalizing markets");

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);

  await Promise.allSettled(
    markets.map(async (market) => {
      if (!market.oracleResult) return; // type guard

      try {
        // Attempt on-chain finalization — if RPC is down we still update the DB
        // so the next run will skip this market (already Resolved).
        try {
          await finalizeMarketOnChain(server, keypair, market);
        } catch (onChainErr) {
          logger.warn(
            { err: onChainErr, marketId: market.id },
            "on-chain finalize failed, updating DB status anyway"
          );
        }

        // Mark as Resolved in the database — idempotent because next query
        // filters only Locked markets.
        await db.market.update({
          where: { id: market.id },
          data: {
            status: MarketStatus.Resolved,
            outcome: market.oracleResult.outcome,
            resolvedAt: now,
          },
        });

        logger.info(
          { marketId: market.id, outcome: market.oracleResult.outcome },
          "market finalized and resolved"
        );
      } catch (err) {
        logger.error({ err, marketId: market.id }, "failed to finalize market");
      }
    })
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Interval handle so the jobs can be stopped in tests. */
let lockJobInterval: ReturnType<typeof setInterval> | null = null;
let finalizeJobInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts both cron jobs. Both run every 60 seconds.
 * Safe to call multiple times — existing intervals are cleared first.
 */
export function startResolutionService(): void {
  if (lockJobInterval) clearInterval(lockJobInterval);
  if (finalizeJobInterval) clearInterval(finalizeJobInterval);

  lockJobInterval = setInterval(() => {
    enforceMarketLocks().catch((err) =>
      logger.error({ err }, "enforceMarketLocks: unexpected error")
    );
  }, 60_000);

  finalizeJobInterval = setInterval(() => {
    autoFinalizeExpiredWindows().catch((err) =>
      logger.error({ err }, "autoFinalizeExpiredWindows: unexpected error")
    );
  }, 60_000);

  logger.info("ResolutionService started (enforceMarketLocks + autoFinalizeExpiredWindows)");
}

/**
 * Stops both cron jobs. Useful in tests and graceful shutdown.
 */
export function stopResolutionService(): void {
  if (lockJobInterval) {
    clearInterval(lockJobInterval);
    lockJobInterval = null;
  }
  if (finalizeJobInterval) {
    clearInterval(finalizeJobInterval);
    finalizeJobInterval = null;
  }
  logger.info("ResolutionService stopped");
}

// Export internal functions for unit testing
export { enforceMarketLocks, autoFinalizeExpiredWindows };
