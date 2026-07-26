import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import * as marketService from "../../services/market.service";
import * as betService from "../../services/bet.service";

const prisma = new PrismaClient();

const VALID_OUTCOMES = ["FighterA", "FighterB", "Draw", "NoContest"];

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
 * Returns all bets for a specific market. Supports ?outcome=yes|no filter.
 */
export async function getMarketBetsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const outcome = req.query.outcome as "yes" | "no" | undefined;

    if (outcome && outcome !== "yes" && outcome !== "no") {
      res.status(400).json({
        error: "Invalid outcome filter. Use 'yes' or 'no'.",
        code: "INVALID_OUTCOME_FILTER",
      });
      return;
    }

    const bets = await betService.getBetsByMarket(id, outcome);
    res.status(200).json({ bets });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch market bets", code: "INTERNAL_ERROR" });
  }
}

/**
 * POST /api/admin/markets/resolve
 * Body: { market_id, outcome, source }
 * Admin-protected. Submits oracle result and triggers on-chain resolution.
 */
export async function resolveMarketHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
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
 * POST /api/admin/markets/:marketId/resolve
 * Body: { outcome, source }
 * Admin-protected. Resolves a market by ID and writes an audit log entry.
 */
export async function resolveMarketByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const { marketId } = req.params;
    const { outcome, source } = req.body;

    if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
      res.status(400).json({
        error: "Invalid or missing outcome",
        code: "INVALID_OUTCOME",
        allowed: VALID_OUTCOMES,
      });
      return;
    }

    if (!source) {
      res.status(400).json({ error: "Missing source", code: "MISSING_SOURCE" });
      return;
    }

    const market = await marketService.resolveMarket(marketId, outcome, source, "admin");
    res.status(200).json({ market, message: "Market resolved successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve market", code: "INTERNAL_ERROR" });
  }
}

/**
 * POST /api/admin/markets/:marketId/cancel
 * Body: { reason? }
 * Admin-protected. Cancels a market and writes an audit log entry.
 */
export async function cancelMarketHandler(req: Request, res: Response): Promise<void> {
  try {
    const { marketId } = req.params;
    const { reason } = req.body;

    const market = await marketService.cancelMarket(marketId, "admin", reason);
    res.status(200).json({ market, message: "Market cancelled" });
  } catch (error) {
    res.status(500).json({ error: "Failed to cancel market", code: "INTERNAL_ERROR" });
  }
}

/**
 * POST /api/admin/markets/:marketId/dispute-resolve
 * Body: { overrideOutcome, resolution? }
 * Admin-protected. Resolves a disputed market with an override and writes an audit log entry.
 */
export async function resolveDisputeByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const { marketId } = req.params;
    const { overrideOutcome, resolution } = req.body;

    if (!overrideOutcome || !VALID_OUTCOMES.includes(overrideOutcome)) {
      res.status(400).json({
        error: "Invalid or missing overrideOutcome",
        code: "INVALID_OUTCOME",
        allowed: VALID_OUTCOMES,
      });
      return;
    }

    const market = await marketService.resolveMarketDispute(marketId, overrideOutcome, "admin", resolution);
    res.status(200).json({ market, message: "Dispute resolved" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve dispute", code: "INTERNAL_ERROR" });
  }
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
