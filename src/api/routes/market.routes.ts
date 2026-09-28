import { Router } from "express";
import {
  searchMarketsHandler,
  getMarketsHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
  createMarketHandler,
  createMarketSchema,
} from "../controllers/market.controller";
import { walletAuthMiddleware } from "../middleware/walletAuth.middleware";
import { validate } from "../middleware/validate";

const router = Router();

// GET /api/markets/search?q=...  — must come before /:id
router.get("/search", searchMarketsHandler);

// GET  /api/markets
router.get("/", getMarketsHandler);

// POST /api/markets
// Creator must prove wallet ownership via challenge/response (#1225 B-47).
// Body is validated with zod before the handler runs.
router.post(
  "/",
  walletAuthMiddleware(),
  validate({ body: createMarketSchema }),
  createMarketHandler,
);

// GET /api/markets/:id
router.get("/:id", getMarketByIdHandler);

// GET /api/markets/:id/stats
router.get("/:id/stats", getMarketStatsHandler);

// GET /api/markets/:id/bets
router.get("/:id/bets", getMarketBetsHandler);

export default router;
