import { Router } from "express";
import {
  searchMarketsHandler,
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
  createMarketHandler,
} from "../controllers/market.controller";

const router = Router();

// GET /api/markets/search?q=...  — must come before /:id
router.get("/search", searchMarketsHandler);

// GET  /api/markets
// POST /api/markets
router.get("/", getMarketsHandler);
router.post("/", createMarketHandler);

// GET /api/markets/:id
router.get("/:id", getMarketByIdHandler);

// GET /api/markets/:id/stats
router.get("/:id/stats", getMarketStatsHandler);

// GET /api/markets/:id/bets
router.get("/:id/bets", getMarketBetsHandler);

export default router;
