import { Router } from "express";
import {
  searchMarketsHandler,
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
} from "../controllers/market.controller";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

// Public
router.get("/search", searchMarketsHandler);   // must be before /:id
router.get("/", getMarketsHandler);
router.get("/:id/stats", getMarketStatsHandler);
router.get("/:id/bets", getMarketBetsHandler);
router.get("/:id", getMarketByIdHandler);

// Admin — protected by Bearer ADMIN_API_KEY (issue #909/#910)
router.post("/admin/markets/resolve", adminAuth, resolveMarketHandler);
router.post("/admin/markets/dispute/resolve", adminAuth, resolveDisputeHandler);
router.get("/admin/markets/pending", adminAuth, getPendingResolutionsHandler);

export default router;
