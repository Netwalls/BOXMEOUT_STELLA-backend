import { Request, Response, NextFunction } from "express";
import { Keypair } from "@stellar/stellar-sdk";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-admin-api-key"];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    res.status(403).json({ error: "Forbidden", code: "INVALID_ADMIN_KEY" });
    return;
  }
  next();
}

/**
 * Middleware that verifies a Stellar wallet signature to prove ownership
 * of the address in req.params.address.
 *
 * Expects headers:
 *   x-wallet-signature: base64-encoded signature
 *   x-wallet-message: the message that was signed (must contain a recent 13-digit epoch timestamp)
 */
export function requireWalletAuth(req: Request, res: Response, next: NextFunction): void {
  const address = req.params.address;
  const signature = req.headers["x-wallet-signature"] as string | undefined;
  const message = req.headers["x-wallet-message"] as string | undefined;

  if (!address || !signature || !message) {
    res.status(401).json({
      error: "Missing wallet authentication headers",
      code: "UNAUTHORIZED",
    });
    return;
  }

  // Replay protection: message must contain a 13-digit epoch timestamp
  const timestampMatch = message.match(/\d{13}/);
  if (!timestampMatch) {
    res.status(400).json({
      error: "Message must contain a 13-digit epoch timestamp",
      code: "INVALID_MESSAGE",
    });
    return;
  }

  const timestamp = parseInt(timestampMatch[0], 10);
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - timestamp > fiveMinutes) {
    res.status(401).json({
      error: "Signature expired",
      code: "SIGNATURE_EXPIRED",
    });
    return;
  }

  try {
    const keypair = Keypair.fromPublicKey(address);
    const isValid = keypair.verify(
      Buffer.from(message),
      Buffer.from(signature, "base64")
    );

    if (!isValid) {
      res.status(403).json({ error: "Invalid signature", code: "FORBIDDEN" });
      return;
    }

    next();
  } catch {
    res.status(400).json({
      error: "Invalid wallet address or signature format",
      code: "INVALID_WALLET_ADDRESS",
    });
  }
}
