import { randomBytes } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { Keypair } from "@stellar/stellar-sdk";

const CHALLENGE_TTL_MS = Number(process.env.WALLET_AUTH_CHALLENGE_TTL_MS ?? 5 * 60 * 1000);
const CHALLENGE_PREFIX = "BOXMEOUT-AUTH";

interface StoredChallenge {
  nonce: string;
  expiresAt: number;
}

// In-memory challenge store keyed by wallet address. Single-instance only —
// a multi-instance deployment would need this backed by Redis.
const challenges = new Map<string, StoredChallenge>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [address, entry] of challenges) {
    if (entry.expiresAt <= now) challenges.delete(address);
  }
}

/**
 * Issues a fresh challenge string for `address`, replacing any prior one.
 * The client must sign this exact string with their Stellar keypair and
 * present it back via the `x-wallet-signature` header within the TTL.
 */
export function generateChallenge(address: string): { challenge: string; expiresAt: number } {
  pruneExpired();

  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  challenges.set(address, { nonce, expiresAt });

  return { challenge: `${CHALLENGE_PREFIX}:${address}:${nonce}`, expiresAt };
}

function consumeChallenge(address: string): StoredChallenge | null {
  const entry = challenges.get(address);
  if (!entry) return null;

  // One-time use regardless of outcome — prevents replay of a used or stale challenge.
  challenges.delete(address);

  if (entry.expiresAt <= Date.now()) return null;
  return entry;
}

function isWhitelisted(address: string, whitelist: string[]): boolean {
  return whitelist.includes(address);
}

function parseWhitelist(envVar: string | undefined): string[] {
  if (!envVar) return [];
  return envVar
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);
}

export interface WalletAuthOptions {
  /** Whitelisted Stellar addresses. Defaults to ADMIN_WALLET_ADDRESSES env var. */
  whitelist?: string[];
}

/**
 * Challenge/response auth middleware for admin/oracle routes.
 *
 * Flow:
 *   1. Client calls GET /api/auth/challenge?address=G... to obtain a nonce.
 *   2. Client signs the returned challenge string with its Stellar secret key.
 *   3. Client calls the protected route with headers:
 *        x-wallet-address:   G...
 *        x-wallet-signature: <base64 signature>
 *
 * Rejects with 401 if the challenge is missing/expired/already used, and with
 * 403 if the address is not on the whitelist.
 */
export function walletAuthMiddleware(options: WalletAuthOptions = {}) {
  const whitelist = options.whitelist ?? parseWhitelist(process.env.ADMIN_WALLET_ADDRESSES);

  return (req: Request, res: Response, next: NextFunction): void => {
    const address = req.headers["x-wallet-address"];
    const signature = req.headers["x-wallet-signature"];

    if (typeof address !== "string" || typeof signature !== "string" || !address || !signature) {
      res.status(401).json({ error: "Wallet signature required", code: "WALLET_AUTH_REQUIRED" });
      return;
    }

    if (!isWhitelisted(address, whitelist)) {
      res.status(403).json({ error: "Address is not whitelisted", code: "WALLET_NOT_WHITELISTED" });
      return;
    }

    const entry = consumeChallenge(address);
    if (!entry) {
      res.status(401).json({ error: "Challenge expired or not found", code: "CHALLENGE_EXPIRED" });
      return;
    }

    const challengeString = `${CHALLENGE_PREFIX}:${address}:${entry.nonce}`;

    let verified: boolean;
    try {
      const keypair = Keypair.fromPublicKey(address);
      verified = keypair.verify(Buffer.from(challengeString), Buffer.from(signature, "base64"));
    } catch {
      verified = false;
    }

    if (!verified) {
      res.status(401).json({ error: "Invalid signature", code: "INVALID_SIGNATURE" });
      return;
    }

    (req as Request & { walletAddress?: string }).walletAddress = address;
    next();
  };
}
