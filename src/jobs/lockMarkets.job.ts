import { PrismaClient } from "@prisma/client";
import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Keypair,
  BASE_FEE,
} from "@stellar/stellar-sdk";

const prisma = new PrismaClient();

const RPC_URL = process.env.STELLAR_RPC_URL!;
const NETWORK = process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY!;

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
  const account = await server.getAccount(keypair.publicKey());

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

      console.log(`[lockMarkets] Locked market ${market.id} — tx: ${result.hash}`);
    } catch (err) {
      console.error(`[lockMarkets] Failed to lock market ${market.id}:`, err);
    }
  }
}

export function startLockMarketsJob(): void {
  setInterval(() => {
    lockMarkets().catch((err) =>
      console.error("[lockMarkets] Unexpected job error:", err)
    );
  }, 60_000);
}
