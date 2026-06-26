import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getBetsByAddressHandler,
  getPortfolioHandler,
  getPayoutEstimateHandler,
} from "../controllers/bet.controller";

const payoutEstimateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const retryAfter = Math.ceil(60);
    res.status(429).json({
      error: "Too many requests",
      code: "RATE_LIMITED",
      retryAfter,
    });
  },
});

const router = Router();

router.get("/payout-estimate", payoutEstimateLimiter, getPayoutEstimateHandler);
router.get("/:address/portfolio", getPortfolioHandler);
router.get("/:address", getBetsByAddressHandler);

export default router;
