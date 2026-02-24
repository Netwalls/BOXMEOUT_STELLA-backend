// backend/src/routes/trading.ts
// Trading routes - handles both direct trading and user-signed transaction flows

import { Router } from 'express';
import { tradingController } from '../controllers/trading.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router: Router = Router();

// ─── Direct Trading / Admin-signed Routes ────────────────────────────────────
// These are typically mounted at /api/markets

/**
 * POST /api/markets/:marketId/buy - Buy Outcome Shares
 * Requires authentication
 */
router.post('/:marketId/buy', requireAuth, (req, res) =>
  tradingController.buyShares(req, res)
);

/**
 * POST /api/markets/:marketId/sell - Sell Outcome Shares
 * Requires authentication
 */
router.post('/:marketId/sell', requireAuth, (req, res) =>
  tradingController.sellShares(req, res)
);

/**
 * GET /api/markets/:marketId/odds - Get Current Market Odds
 */
router.get('/:marketId/odds', (req, res) =>
  tradingController.getOdds(req, res)
);

/**
 * POST /api/markets/:marketId/liquidity/add - Add USDC Liquidity to Pool
 */
router.post('/:marketId/liquidity/add', requireAuth, (req, res) =>
  tradingController.addLiquidity(req, res)
);

/**
 * POST /api/markets/:marketId/liquidity/remove - Remove Liquidity from Pool
 */
router.post('/:marketId/liquidity/remove', requireAuth, (req, res) =>
  tradingController.removeLiquidity(req, res)
);

// ─── User-signed Transaction Routes ──────────────────────────────────────────
// These are typically mounted at /api

/**
 * POST /api/markets/:marketId/build-tx/buy
 * Build an unsigned transaction for buying shares
 */
router.post('/markets/:marketId/build-tx/buy', requireAuth, (req, res) =>
  tradingController.buildBuySharesTx(req, res)
);

/**
 * POST /api/markets/:marketId/build-tx/sell
 * Build an unsigned transaction for selling shares
 */
router.post('/markets/:marketId/build-tx/sell', requireAuth, (req, res) =>
  tradingController.buildSellSharesTx(req, res)
);

/**
 * POST /api/submit-signed-tx
 * Submit a pre-signed transaction
 */
router.post('/submit-signed-tx', requireAuth, (req, res) =>
  tradingController.submitSignedTx(req, res)
);

export default router;
