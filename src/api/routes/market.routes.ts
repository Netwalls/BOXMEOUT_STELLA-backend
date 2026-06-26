import { Router } from "express";
import {
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
  resolveMarketHandler,
  resolveDisputeHandler,
  getPendingResolutionsHandler,
} from "../controllers/market.controller";
import { requireAdmin } from "../middleware/auth";

const router = Router();

// Public
router.get("/", getMarketsHandler);
router.get("/:id", getMarketByIdHandler);
router.get("/:id/stats", getMarketStatsHandler);
router.get("/:id/bets", getMarketBetsHandler);

// Admin
router.post("/admin/markets/resolve", requireAdmin, resolveMarketHandler);
router.post("/admin/markets/dispute/resolve", requireAdmin, resolveDisputeHandler);
router.get("/admin/markets/pending", requireAdmin, getPendingResolutionsHandler);

export default router;
