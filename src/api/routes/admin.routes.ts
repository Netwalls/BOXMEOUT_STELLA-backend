import { Router } from "express";
import {
  getPendingResolutionsHandler,
  resolveMarketHandler,
  resolveDisputeHandler,
} from "../controllers/market.controller";

const router = Router();

router.get("/markets/pending", getPendingResolutionsHandler);
router.post("/markets/resolve", resolveMarketHandler);
router.post("/markets/dispute/resolve", resolveDisputeHandler);

export default router;
