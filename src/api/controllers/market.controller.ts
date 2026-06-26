import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import * as marketService from "../../services/market.service";
import * as oracleService from "../../services/oracle.service";

const prisma = new PrismaClient();

/**
 * GET /api/markets
 * Query params: status, weightClass, page, limit
 * Returns paginated list of boxing markets.
 */
export async function getMarketsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/markets/:id
 * Returns full market detail. Responds 404 if not found.
 */
export async function getMarketByIdHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/markets/:id/stats
 * Returns aggregate stats: bet count, volume, current odds.
 */
export async function getMarketStatsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/markets/:id/bets
 * Returns all bets for a specific market. Supports pagination.
 */
export async function getMarketBetsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * POST /api/admin/markets/resolve (issue #909)
 * Body: { oracle_result_id: number }
 * Admin-protected (adminAuth middleware). Confirms an oracle result and
 * triggers on-chain market resolution. Returns 200 { status: 'ok' }.
 */
export async function resolveMarketHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { oracle_result_id } = req.body;

    if (oracle_result_id === undefined || oracle_result_id === null) {
      res.status(400).json({ error: "oracle_result_id is required", code: "VALIDATION_ERROR" });
      return;
    }

    const id = Number(oracle_result_id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "oracle_result_id must be a positive integer", code: "VALIDATION_ERROR" });
      return;
    }

    await oracleService.confirmFightResult(String(id), "admin");
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/markets/dispute/resolve
 * Body: { dispute_id, override_outcome }
 * Admin-protected. Resolves a disputed market with an override outcome.
 */
export async function resolveDisputeHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/admin/markets/pending
 * Admin-protected. Returns markets in Locked status awaiting resolution.
 */
export async function getPendingResolutionsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /health
 * Returns { status: "ok", db: "connected" } if service is healthy.
 * Used by load balancers and uptime monitors.
 */
export async function healthCheckHandler(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
}
