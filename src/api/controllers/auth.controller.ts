import { Request, Response } from "express";
import { generateChallenge } from "../middleware/walletAuth.middleware";

const stellarAddressRegex = /^G[A-Z0-9]{55}$/;

/**
 * GET /api/auth/challenge?address=G...
 * Issues a short-lived challenge string the caller must sign with their
 * Stellar keypair to authenticate against walletAuthMiddleware-protected routes.
 */
export function getChallengeHandler(req: Request, res: Response): void {
  const address = String(req.query.address ?? "");

  if (!stellarAddressRegex.test(address)) {
    res.status(400).json({ error: "Invalid Stellar address", code: "INVALID_ADDRESS" });
    return;
  }

  const { challenge, expiresAt } = generateChallenge(address);
  res.status(200).json({ challenge, expiresAt });
}
