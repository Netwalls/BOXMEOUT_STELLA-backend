import { Router } from "express";
import {
  searchMarketsHandler,
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
} from "../controllers/market.controller";

const router = Router();

// Public
router.get("/search", searchMarketsHandler);   // must be before /:id
router.get("/", getMarketsHandler);
router.get("/:id/stats", getMarketStatsHandler);
router.get("/:id/bets", getMarketBetsHandler);
router.get("/:id", getMarketByIdHandler);

export default router;
