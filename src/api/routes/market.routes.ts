import { Router, Request, Response, NextFunction } from "express";
import {
  searchMarketsHandler,
  getMarketsHandler,
  getMarketsByCreatorHandler,
  getMarketByIdHandler,
  getMarketStatsHandler,
  getMarketBetsHandler,
  createMarketOptimisticHandler,
  reconcileMarketHandler,
  resolveMarketHandler,
  resolveDisputeHandler,
  getPendingResolutionsHandler,
} from "../controllers/market.controller";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

const VALID_WEIGHT_CLASSES = [
  "strawweight",
  "minimumweight",
  "light_flyweight",
  "flyweight",
  "super_flyweight",
  "bantamweight",
  "super_bantamweight",
  "featherweight",
  "super_featherweight",
  "lightweight",
  "super_lightweight",
  "welterweight",
  "super_welterweight",
  "middleweight",
  "super_middleweight",
  "light_heavyweight",
  "cruiserweight",
  "heavyweight",
  "super_heavyweight",
];

function validateWeightClass(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { weight_class } = req.query;
  if (
    weight_class !== undefined &&
    !VALID_WEIGHT_CLASSES.includes(weight_class as string)
  ) {
    res.status(400).json({
      error: "Invalid weight_class",
      code: "INVALID_WEIGHT_CLASS",
      allowed: VALID_WEIGHT_CLASSES,
    });
    return;
  }
  next();
}

// ── Public routes ────────────────────────────────────────────────────────────

// Search must be before /:id to avoid route conflicts
router.get("/search", searchMarketsHandler);

// GET /api/markets — list all markets
router.get("/", validateWeightClass, getMarketsHandler);

// GET /api/markets/by-creator/:address — list markets by creator (paginated)
router.get("/by-creator/:address", getMarketsByCreatorHandler);

// POST /api/markets/optimistic — insert optimistic row after tx submission
router.post("/optimistic", createMarketOptimisticHandler);

// GET /api/markets/:id — single market lookup
router.get("/:id", getMarketByIdHandler);

// GET /api/markets/:id/stats
router.get("/:id/stats", getMarketStatsHandler);

// GET /api/markets/:id/bets
router.get("/:id/bets", getMarketBetsHandler);

// ── Admin-protected routes ───────────────────────────────────────────────────

// POST /api/admin/markets/:id/reconcile — force refresh from on-chain
router.post("/admin/markets/:id/reconcile", adminAuth, reconcileMarketHandler);

// POST /api/admin/markets/resolve
router.post("/admin/markets/resolve", adminAuth, resolveMarketHandler);

// POST /api/admin/markets/dispute/resolve
router.post(
  "/admin/markets/dispute/resolve",
  adminAuth,
  resolveDisputeHandler
);

// GET /api/admin/markets/pending
router.get("/admin/markets/pending", adminAuth, getPendingResolutionsHandler);

export default router;
