import { PrismaClient } from "@prisma/client";
import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Keypair,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { logger } from "../logger";

const prisma = new PrismaClient();

const RPC_URL = process.env.STELLAR_RPC_URL!;
const NETWORK = process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY!;

const MAX_RETRIES = 3;
const MAX_FEE = 1_000_000; // stroops — hard cap regardless of backoff

async function lockMarketWithRetry(
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

      console.log(`[lockMarkets] Locked market ${market.id} — tx: ${result.hash}`);
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`[lockMarkets] Attempt ${attempt + 1} failed for ${market.id}, retrying with higher fee...`);
    }
  }
}

async function lockMarkets(): Promise<void> {
  const now = new Date();

  const markets = await prisma.market.findMany({
    where: {
      status: "Open",
      bettingEndsAt: { lt: now },
    },
    select: { id: true, contractAddress: true },
  });

  if (markets.length === 0) return;

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);

  for (const market of markets) {
    try {
      const contract = new Contract(market.contractAddress);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK,
      })
        .addOperation(contract.call("lock_market"))
        .setTimeout(30)
        .build();

      const prepared = await server.prepareTransaction(tx);
      prepared.sign(keypair);
      const result = await server.sendTransaction(prepared);

      logger.info({ marketId: market.id, txHash: result.hash }, "market locked");
      await lockMarketWithRetry(server, keypair, market);
    } catch (err) {
      logger.error({ err, marketId: market.id }, "failed to lock market");
    }
  }
}

export function startLockMarketsJob(): void {
  setInterval(() => {
    lockMarkets().catch((err) =>
      logger.error({ err }, "unexpected lockMarkets job error")
    );
  }, 60_000);
}
