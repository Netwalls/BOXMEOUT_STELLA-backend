import { timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import * as oracleService from "../../services/oracle.service";

// ---------------------------------------------------------------------------
// Timing-safe Bearer token check for ORACLE_API_KEY
// ---------------------------------------------------------------------------
function checkOracleAuth(req: Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);
  const expected = process.env.ORACLE_API_KEY ?? "";
  if (!expected) return false;

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    const len = Math.max(a.length, b.length);
    const bufA = Buffer.alloc(len);
    const bufB = Buffer.alloc(len);
    a.copy(bufA);
    b.copy(bufB);
    return timingSafeEqual(bufA, bufB) && a.length === b.length;
  } catch {
    return false;
  }
}

/**
 * POST /api/oracle/submit (issue #908)
 * Header: Authorization: Bearer <ORACLE_API_KEY>
 * Body: { market_id, outcome, source }
 *
 * Returns 401 if auth fails, 400 if body invalid, 201 with OracleResult on success.
 */
export async function submitOracleResultHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!checkOracleAuth(req)) {
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }

    const { market_id, outcome, source } = req.body as {
      market_id: string;
      outcome: string;
      source: string;
    };

    const result = await oracleService.submitFightResult(
      market_id,
      outcome as Parameters<typeof oracleService.submitFightResult>[1],
      source,
      "oracle",
    );

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/oracle/results
 * Admin-protected. Lists all submitted oracle results with confirmed status.
 */
export async function listOracleResultsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}
