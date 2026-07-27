import { Router } from "express";
import {
  getUserBetsHandler,
  getUserPositionsHandler,
} from "../controllers/bet.controller";

const router = Router();

// GET /api/users/:address/bets        — paginated bet history for a user (#1088)
router.get("/:address/bets", getUserBetsHandler);

// GET /api/users/:address/positions   — paginated open positions for a user (#1088)
router.get("/:address/positions", getUserPositionsHandler);

export default router;
