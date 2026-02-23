// backend/src/routes/trading.ts
// Routes for trading operations with user-signed transactions

import { Router } from 'express';
import { tradingController } from '../controllers/trading.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Build unsigned transactions
router.post('/markets/:marketId/build-tx/buy', requireAuth, (req, res) =>
  tradingController.buildBuySharesTx(req, res)
);

router.post('/markets/:marketId/build-tx/sell', requireAuth, (req, res) =>
  tradingController.buildSellSharesTx(req, res)
);

// Submit signed transaction
router.post('/submit-signed-tx', requireAuth, (req, res) =>
  tradingController.submitSignedTx(req, res)
);

export default router;
