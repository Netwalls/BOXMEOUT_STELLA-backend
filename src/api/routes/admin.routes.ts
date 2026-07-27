import { Router } from "express";
import {
  getPendingResolutionsHandler,
  resolveMarketHandler,
  resolveDisputeHandler,
} from "../controllers/market.controller";
import {
  getAllOraclesHandler,
  createOracleHandler,
  updateOracleHandler,
  deleteOracleHandler,
} from "../controllers/oracle.controller";
import { getAuditLogsHandler } from "../controllers/audit.controller";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";

const router = Router();

// Market resolution is high-stakes and infrequent — tight limit.
const marketResolutionLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: "admin:markets:write",
});

// Oracle CRUD is lower-stakes admin bookkeeping — looser limit.
const oracleWriteLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "admin:oracles:write",
});

// Market management
router.get("/markets/pending", getPendingResolutionsHandler);
router.post("/markets/resolve", marketResolutionLimiter, resolveMarketHandler);
router.post("/markets/dispute/resolve", marketResolutionLimiter, resolveDisputeHandler);

// Oracle address management (Issue #455)
router.get("/oracles", getAllOraclesHandler);
router.post("/oracles", oracleWriteLimiter, createOracleHandler);
router.patch("/oracles/:id", oracleWriteLimiter, updateOracleHandler);
router.delete("/oracles/:id", oracleWriteLimiter, deleteOracleHandler);

// Audit logging (Issue #456)
router.get("/audit-logs", getAuditLogsHandler);

export default router;
