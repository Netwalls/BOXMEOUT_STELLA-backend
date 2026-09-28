import { Router } from "express";
import {
  submitOracleResultHandler,
  listOracleResultsHandler,
} from "../controllers/oracle.controller";
import { oracleAuth } from "../middleware/oracleAuth";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

// POST /api/oracle/submit — X-Oracle-Key header required (issue #908)
router.post("/submit", oracleAuth, submitOracleResultHandler);

// GET /api/oracle/results — admin view, X-Admin-Key header required
router.get("/results", adminAuth, listOracleResultsHandler);

export default router;
