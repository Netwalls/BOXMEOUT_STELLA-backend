// ============================================================
// BOXMEOUT — Stellar Service
// Low-level Stellar SDK wrapper for contract interactions.
// Contributors: implement every function marked TODO.
// ============================================================

import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  Transaction,
  xdr,
  rpc,
} from '@stellar/stellar-sdk';

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS  = 30_000;
const MAX_RETRIES      = 3;
const BASE_FEE         = 100;
const FEE_BUMP_FACTOR  = 1.5;

export class StellarInvocationError extends Error {
  constructor(
    message: string,
    public readonly txHash?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'StellarInvocationError';
  }
}

function getRpcServer(): rpc.Server {
  const rpcUrl = process.env.STELLAR_RPC_URL;
  if (!rpcUrl) throw new Error('STELLAR_RPC_URL env var is required');
  return new rpc.Server(rpcUrl);
}

function getNetworkPassphrase(): string {
  return process.env.STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET;
}

/**
 * Polls rpc.getTransaction() until SUCCESS or FAILED, or until timeout.
 * Returns the final status response, or null on timeout.
 */
async function pollTransaction(
  server: rpc.Server,
  hash: string,
): Promise<rpc.Api.GetTransactionResponse | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await server.getTransaction(hash);
    if (result.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) return result;
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return null;
}

/**
 * Builds, simulates, signs, and submits a Soroban contract invocation.
 *
 * Steps:
 *   1. Build a TransactionBuilder with source_keypair's account
 *   2. Add InvokeContractHostFunction operation with method + args
 *   3. Simulate via RPC to get resource fee estimates
 *   4. Set transaction fee = base_fee + resource_fee
 *   5. Sign with source_keypair
 *   6. Submit via RPC sendTransaction
 *   7. Poll getTransaction until status is SUCCESS or FAILED (max 30s)
 *   8. On TIMEOUT: rebuild and resubmit with bumped fee (max 3 retries)
 *
 * Returns the transaction hash on SUCCESS.
 * Throws StellarInvocationError on FAILED or max retries exceeded.
 */
export async function invokeContract(
  contract_address: string,
  method: string,
  args: xdr.ScVal[],
  source_keypair: Keypair,
): Promise<string> {
  const server = getRpcServer();
  const networkPassphrase = getNetworkPassphrase();
  const contract = new Contract(contract_address);

  let fee = BASE_FEE;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 1. Load fresh account (fresh sequence number on each retry)
    const sourceAccount = await server.getAccount(source_keypair.publicKey());

    // 2. Build transaction with invokeHostFunction operation
    const builtTx = new TransactionBuilder(sourceAccount, { fee: String(fee), networkPassphrase })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    // 3. Simulate to get resource fees + footprint
    const simResult = await server.simulateTransaction(builtTx);
    if (rpc.Api.isSimulationError(simResult)) {
      throw new StellarInvocationError(`Simulation failed: ${simResult.error}`);
    }

    // 4. Assemble: applies resource footprint + sets fee = base_fee + resource_fee
    const resourceFee = parseInt((simResult as rpc.Api.SimulateTransactionSuccessResponse).minResourceFee, 10);
    fee = Math.ceil((fee + resourceFee) * (attempt > 0 ? FEE_BUMP_FACTOR : 1));

    const preparedTx = rpc.assembleTransaction(builtTx, simResult)
      .setNetworkPassphrase(networkPassphrase)
      .build() as Transaction;

    // 5. Sign
    preparedTx.sign(source_keypair);

    // 6. Submit
    const sendResult = await server.sendTransaction(preparedTx);
    if (sendResult.status === 'ERROR') {
      throw new StellarInvocationError(
        `sendTransaction rejected: ${sendResult.hash}`,
        sendResult.hash,
        sendResult.errorResult,
      );
    }

    const hash = sendResult.hash;

    // 7. Poll until SUCCESS / FAILED / timeout
    const txResult = await pollTransaction(server, hash);

    if (txResult === null) {
      // TIMEOUT — retry with bumped fee (fee already bumped above for next iteration)
      if (attempt === MAX_RETRIES) {
        throw new StellarInvocationError(
          `Transaction timed out after ${MAX_RETRIES} retries`,
          hash,
        );
      }
      continue;
    }

    if (txResult.status === rpc.Api.GetTransactionStatus.SUCCESS) return hash;

    // FAILED
    throw new StellarInvocationError(
      `Transaction failed on-chain`,
      hash,
      txResult,
    );
  }

  // Should be unreachable
  throw new StellarInvocationError('Max retries exceeded');
}

/**
 * Reads contract state using simulateTransaction (no fee, no state change).
 *
 * Steps:
 *   1. Build a read-only InvokeContractHostFunction transaction
 *   2. Call RPC simulateTransaction
 *   3. Extract returnValue from simulation result
 *   4. Call parseScVal(returnValue) and cast to type T
 *
 * Returns the typed result T.
 * Throws if simulation fails.
 */
export async function readContractState<T>(
  contract_address: string,
  method: string,
  args: xdr.ScVal[],
): Promise<T> {
  const server = getRpcServer();
  const networkPassphrase = getNetworkPassphrase();
  const contract = new Contract(contract_address);

  // Use a random ephemeral account — simulation doesn't need a real sequence number
  const ephemeral = Keypair.random();
  const sourceAccount = await server.getAccount(ephemeral.publicKey()).catch(() => {
    // Fallback: build a dummy account object for simulation
    const { Account } = require('@stellar/stellar-sdk');
    return new Account(ephemeral.publicKey(), '0');
  });

  const transaction = new TransactionBuilder(sourceAccount, { fee: String(BASE_FEE), networkPassphrase })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const response = await server.simulateTransaction(transaction);
  if (rpc.Api.isSimulationError(response)) {
    throw new Error(`Simulation error: ${response.error}`);
  }

  const successResponse = response as rpc.Api.SimulateTransactionSuccessResponse;
  if (!successResponse.result?.retval) {
    throw new Error('Simulation returned no retval');
  }

  return parseScVal(successResponse.result.retval) as T;
}

/**
 * Subscribes to the Horizon event stream for a specific contract address.
 * Uses Horizon's /contract_events endpoint with Server-Sent Events.
 *
 * Calls onEvent for every new event received.
 * Automatically reconnects on connection drop (exponential backoff).
 *
 * Returns an unsubscribe function that stops the stream.
 */
export function subscribeToContractEvents(
  contract_address: string,
  onEvent: (event: unknown) => void,
): () => void {
  // TODO: implement
  throw new Error('Not implemented');
}

/**
 * Converts a raw XDR ScVal into a JavaScript-native value.
 *
 * Handles the following ScVal variants:
 *   ScvBool    → boolean
 *   ScvU32     → number
 *   ScvI32     → number
 *   ScvU64     → bigint
 *   ScvI128    → bigint
 *   ScvString  → string
 *   ScvAddress → string (G... format)
 *   ScvVec     → unknown[]
 *   ScvMap     → Record<string, unknown>
 *   ScvSymbol  → string
 *
 * Throws ParseError for unsupported variants.
 */
export function parseScVal(scval: xdr.ScVal): unknown {
  const value: any = scval as any;
  const type = scval.switch();

  if (type === xdr.ScValType.scvBool()) return value.b?.();
  if (type === xdr.ScValType.scvU32()) return value.u32?.();
  if (type === xdr.ScValType.scvI32()) return value.i32?.();
  if (type === xdr.ScValType.scvU64()) {
    const u64 = value.u64?.();
    return typeof u64 === 'bigint' ? u64 : u64?.toString();
  }
  if (type === xdr.ScValType.scvI128()) {
    const i128 = value.i128?.();
    return typeof i128 === 'bigint' ? i128 : i128?.toString();
  }
  if (type === xdr.ScValType.scvString()) return value.str?.();
  if (type === xdr.ScValType.scvAddress()) return value.address?.();
  if (type === xdr.ScValType.scvSymbol()) return value.sym?.();
  if (type === xdr.ScValType.scvVec()) {
    return value.vec()?.map((item: xdr.ScVal) => parseScVal(item));
  }
  if (type === xdr.ScValType.scvMap()) {
    const mapEntries = value.map?.() ?? [];
    const output: Record<string, unknown> = {};
    for (const entry of mapEntries) {
      const key = parseScVal(entry.key());
      const mappedKey = typeof key === 'string' ? key : String(key);
      output[mappedKey] = parseScVal(entry.value());
    }
    return output;
  }

  throw new Error(`Unsupported ScVal type: ${type}`);
}

/**
 * Returns the current recommended base fee in stroops from the Stellar network.
 * Calls Horizon /fee_stats endpoint and returns the p70 fee.
 * Used to set appropriate transaction fees to avoid rejection.
 */
export async function getCurrentBaseFee(): Promise<number> {
  // TODO: implement
  throw new Error('Not implemented');
}
