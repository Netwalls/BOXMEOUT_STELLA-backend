import { Router, Request, Response, NextFunction } from "express";
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

const VALID_WEIGHT_CLASSES = [
  "strawweight", "minimumweight", "light_flyweight", "flyweight",
  "super_flyweight", "bantamweight", "super_bantamweight", "featherweight",
  "super_featherweight", "lightweight", "super_lightweight", "welterweight",
  "super_welterweight", "middleweight", "super_middleweight", "light_heavyweight",
  "cruiserweight", "heavyweight", "super_heavyweight",
];

function validateWeightClass(req: Request, res: Response, next: NextFunction): void {
  const { weight_class } = req.query;
  if (weight_class !== undefined && !VALID_WEIGHT_CLASSES.includes(weight_class as string)) {
    res.status(400).json({
      error: "Invalid weight_class",
      code: "INVALID_WEIGHT_CLASS",
      allowed: VALID_WEIGHT_CLASSES,
    });
    return;
  }
  next();
}

// Public
router.get("/", validateWeightClass, getMarketsHandler);
router.get("/:id", getMarketByIdHandler);
router.get("/:id/stats", getMarketStatsHandler);
router.get("/:id/bets", getMarketBetsHandler);

// Admin
router.post("/admin/markets/resolve", requireAdmin, resolveMarketHandler);
router.post("/admin/markets/dispute/resolve", requireAdmin, resolveDisputeHandler);
router.get("/admin/markets/pending", requireAdmin, getPendingResolutionsHandler);

export default router;
