import { Request, Response } from "express";
import * as oracleService from "../../services/oracle.service";

/**
 * POST /api/oracle/submit
 * Body: { market_id, outcome, source }
 * Authorized oracle nodes submit fight results here.
 * Validates Authorization header before processing.
 */
export async function submitOracleResultHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/oracle/results
 * Admin-protected. Lists all submitted oracle results with confirmed status.
 */
export async function listOracleResultsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}
