// backend/src/controllers/trading.controller.ts
// Controller for trading operations using user-signed transactions

import { Request, Response } from 'express';
import { tradingService } from '../services/trading.service.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import logger from '../utils/logger.js';

export class TradingController {
  /**
   * POST /api/markets/:marketId/build-tx/buy
   * Build an unsigned transaction for buying shares
   */
  async buildBuySharesTx(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      const userPublicKey = authReq.user?.publicKey;

      if (!userId || !userPublicKey) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const marketId = req.params.marketId as string;
      const { outcome, amount, minShares } = req.body;

      // Validation
      if (outcome === undefined || !amount) {
        res.status(400).json({ success: false, error: 'Missing outcome or amount' });
        return;
      }

      const xdr = await tradingService.buildBuySharesTx(
        userId,
        userPublicKey,
        marketId,
        Number(outcome),
        BigInt(amount),
        BigInt(minShares || 0)
      );

      res.status(200).json({
        success: true,
        data: { xdr },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/markets/:marketId/build-tx/sell
   * Build an unsigned transaction for selling shares
   */
  async buildSellSharesTx(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      const userPublicKey = authReq.user?.publicKey;

      if (!userId || !userPublicKey) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const marketId = req.params.marketId as string;
      const { outcome, shares, minPayout } = req.body;

      if (outcome === undefined || !shares) {
        res.status(400).json({ success: false, error: 'Missing outcome or shares' });
        return;
      }

      const xdr = await tradingService.buildSellSharesTx(
        userId,
        userPublicKey,
        marketId,
        Number(outcome),
        BigInt(shares),
        BigInt(minPayout || 0)
      );

      res.status(200).json({
        success: true,
        data: { xdr },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/submit-signed-tx
   * Submit a pre-signed transaction
   */
  async submitSignedTx(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.userId;
      const userPublicKey = authReq.user?.publicKey;

      if (!userId || !userPublicKey) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { signedXdr, action } = req.body;

      if (!signedXdr || !action) {
        res.status(400).json({ success: false, error: 'Missing signedXdr or action' });
        return;
      }

      const result = await tradingService.submitSignedTx(
        userId,
        userPublicKey,
        signedXdr,
        action
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export const tradingController = new TradingController();
