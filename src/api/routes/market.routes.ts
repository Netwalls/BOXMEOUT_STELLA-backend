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
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

// Public
router.get("/", getMarketsHandler);
router.get("/:id", getMarketByIdHandler);
router.get("/:id/stats", getMarketStatsHandler);
router.get("/:id/bets", getMarketBetsHandler);

// Admin — protected by Bearer ADMIN_API_KEY (issue #909/#910)
router.post("/admin/markets/resolve", adminAuth, resolveMarketHandler);
router.post("/admin/markets/dispute/resolve", adminAuth, resolveDisputeHandler);
router.get("/admin/markets/pending", adminAuth, getPendingResolutionsHandler);

export default router;
