// backend/src/controllers/submit-tx.controller.ts
// Handles POST /api/trading/submit-tx

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { stellarService } from '../services/stellar.service.js';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../utils/logger.js';

export class SubmitTxController {
  /**
   * POST /api/trading/submit-tx
   *
   * Body (validated by Zod before reaching here):
   *   { signedXdr: string }
   *
   * Responses:
   *   200 — { success: true, data: { transactionHash, status } }
   *   400 — malformed XDR or invalid signature
   *   502 — Stellar network / RPC unreachable
   */
  async submitTx(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const userId = req.user?.userId;
    const userPublicKey = req.user?.publicKey;

    if (!userId || !userPublicKey) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
      return;
    }

    const { signedXdr } = req.body as { signedXdr: string };

    try {
      const result = await stellarService.submitSignedTransaction(
        signedXdr,
        userPublicKey
      );

      res.status(200).json({
        success: true,
        data: {
          transactionHash: result.txHash,
          status: result.status,
        },
      });
    } catch (err: any) {
      const code: string = err.code ?? '';

      if (code === 'INVALID_XDR' || code === 'INVALID_SIGNATURE') {
        return next(new ApiError(400, code, err.message));
      }

      // Network / RPC failure
      logger.error('submit-tx: network error', { userId, error: err.message });
      return next(new ApiError(502, 'NETWORK_ERROR', err.message));
    }
  }
}

export const submitTxController = new SubmitTxController();
