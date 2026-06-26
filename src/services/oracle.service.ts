import { Dispute, Market, OracleResult, Outcome } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import {
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  Keypair,
  BASE_FEE,
  nativeToScVal,
} from "@stellar/stellar-sdk";

const prisma = new PrismaClient();
const RPC_URL = process.env.STELLAR_RPC_URL!;
const NETWORK = process.env.STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY!;
const DISPUTE_CONTRACT_ID = process.env.DISPUTE_CONTRACT_ID!;

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
  return prisma.market.findMany({
    where: {
      status: "Locked",
      OR: [
        { oracleResult: null },
        { oracleResult: { confirmed: false } },
      ],
    },
    orderBy: { scheduledAt: "asc" },
  });
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
  const market = await prisma.market.findUnique({ where: { id: market_id } });
  if (!market || market.status !== "Resolved") {
    throw new Error("Market must be in Resolved status to raise a dispute");
  }

  const dispute = await prisma.dispute.create({
    data: { marketId: market_id, raisedBy: bettor, reason },
  });

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);
  const account = await server.getAccount(keypair.publicKey());
  const contract = new Contract(market.contractAddress);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call("raise_dispute", nativeToScVal(dispute.id, { type: "string" })))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  await server.sendTransaction(prepared);

  await prisma.$transaction([
    prisma.market.update({ where: { id: market_id }, data: { status: "Disputed" } }),
    prisma.adminLog.create({
      data: { action: "raiseDispute", actor: bettor, target: market_id, metadata: { disputeId: dispute.id, reason } },
    }),
  ]);

  return dispute;
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
  const dispute = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute_id } });
  const market = await prisma.market.findUniqueOrThrow({ where: { id: dispute.marketId } });

  const server = new SorobanRpc.Server(RPC_URL);
  const keypair = Keypair.fromSecret(ADMIN_SECRET);
  const account = await server.getAccount(keypair.publicKey());
  const contract = new Contract(market.contractAddress);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call(
      "resolve_dispute",
      nativeToScVal(dispute_id, { type: "string" }),
      nativeToScVal(override_outcome, { type: "symbol" }),
    ))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);
  await server.sendTransaction(prepared);

  await prisma.$transaction([
    prisma.dispute.update({
      where: { id: dispute_id },
      data: { resolvedAt: new Date(), resolution: override_outcome },
    }),
    prisma.market.update({
      where: { id: dispute.marketId },
      data: { status: "Resolved", outcome: override_outcome },
    }),
    prisma.adminLog.create({
      data: { action: "resolveDispute", actor: admin, target: dispute.marketId, metadata: { disputeId: dispute_id, override_outcome } },
    }),
  ]);
}
