import { Router } from "express";
import {
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
} from "../controllers/market.controller";

const router = Router();

router.get("/", getMarketsHandler);
router.get("/:id/stats", getMarketStatsHandler);
router.get("/:id/bets", getMarketBetsHandler);
router.get("/:id", getMarketByIdHandler);

export default router;
