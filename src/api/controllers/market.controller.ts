import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { logger } from "../../logger";
import * as marketService from "../../services/market.service";
import { searchMarkets } from "../../repositories/market.repository";

const prisma = new PrismaClient();

/**
 * GET /api/markets/search?q=&page=&limit=
 * Full-text search across question + description. Returns paginated { data, total }.
 */
export async function searchMarketsHandler(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? "").trim();
  if (!q) { res.status(400).json({ error: "q is required" }); return; }
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const result = await searchMarkets(q, page, limit);
  res.json(result);
}

/**
 * GET /api/markets
 * Query params: status, weightClass, page, limit
 * Returns paginated list of boxing markets.
 */
export async function getMarketsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { status, weightClass, page = "1", limit = "20" } = req.query as Record<string, string>;
    const markets = await marketService.getAllMarkets(
      { status: status as marketService.MarketFilters["status"], weightClass },
      { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    );
    res.json({ data: markets, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    logger.error({ err }, "getMarketsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getMarketByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const market = await marketService.getMarketById(req.params.id);
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    res.json({ data: market });
  } catch (err) {
    logger.error({ err }, "getMarketByIdHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getMarketStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const stats = await marketService.getMarketStats(req.params.id);
    res.json({ data: stats });
  } catch (err) {
    logger.error({ err }, "getMarketStatsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getMarketBetsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { page = "1", limit = "20" } = req.query as Record<string, string>;
    const bets = await marketService.getMarketLeaderboard(req.params.id);
    res.json({ data: bets, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    logger.error({ err }, "getMarketBetsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function resolveMarketHandler(req: Request, res: Response): Promise<void> {
  try {
    const { market_id, status, outcome } = req.body as {
      market_id: string;
      status: marketService.MarketFilters["status"];
      outcome?: Parameters<typeof marketService.updateMarketStatus>[2];
    };
    const market = await marketService.updateMarketStatus(market_id, status as Parameters<typeof marketService.updateMarketStatus>[1], outcome);
    res.json({ data: market });
  } catch (err) {
    logger.error({ err }, "resolveMarketHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function resolveDisputeHandler(req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "resolveDisputeHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getPendingResolutionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const markets = await marketService.getAllMarkets({ status: "Locked" });
    res.json({ data: markets });
  } catch (err) {
    logger.error({ err }, "getPendingResolutionsHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function healthCheckHandler(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
}
