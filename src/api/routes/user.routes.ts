import { Router } from "express";
import { getUserHandler, updateUserHandler } from "../controllers/user.controller";
import { requireWalletAuth } from "../middleware/auth";

const router = Router();

router.get("/:address", getUserHandler);
router.put("/:address", requireWalletAuth, updateUserHandler);

export default router;
