import { Request, Response } from "express";
import { z } from "zod";
import { MarketStatus } from "@prisma/client";
import { db } from "../../db";
import * as marketService from "../../services/market.service";

const marketsQuerySchema = z.object({
  status: z.nativeEnum(MarketStatus).optional(),
  weightClass: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * GET /api/markets
 */
export async function getMarketsHandler(req: Request, res: Response): Promise<void> {
  const parsed = marketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { status, weightClass, page, limit } = parsed.data;
  const markets = await marketService.getAllMarkets(
    { status, weightClass },
    { page, limit }
  );
  res.status(200).json(markets);
}

/**
 * GET /api/markets/:id
 */
export async function getMarketByIdHandler(req: Request, res: Response): Promise<void> {
  const market = await marketService.getMarketById(req.params.id);
  if (!market) {
    res.status(404).json({ error: "Market not found", code: "NOT_FOUND" });
    return;
  }
  res.status(200).json(market);
}

/**
 * GET /api/markets/:id/stats
 */
export async function getMarketStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const stats = await marketService.getMarketStats(req.params.id);
    res.status(200).json(stats);
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === "NOT_FOUND") {
      res.status(404).json({ error: "Market not found", code: "NOT_FOUND" });
      return;
    }
    throw err;
  }
}

/**
 * GET /api/markets/:id/bets
 */
export async function getMarketBetsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * POST /api/admin/markets/resolve
 */
export async function resolveMarketHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * POST /api/admin/markets/dispute/resolve
 */
export async function resolveDisputeHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /api/admin/markets/pending
 */
export async function getPendingResolutionsHandler(req: Request, res: Response): Promise<void> {
  throw new Error("Not implemented");
}

/**
 * GET /health
 */
export async function healthCheckHandler(req: Request, res: Response): Promise<void> {
  try {
    await db.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
}
