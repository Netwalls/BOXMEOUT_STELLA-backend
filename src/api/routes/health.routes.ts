import { Router } from "express";
import { healthCheckHandler } from "../controllers/market.controller";

const router = Router();

router.get("/health", healthCheckHandler);

export default router;
