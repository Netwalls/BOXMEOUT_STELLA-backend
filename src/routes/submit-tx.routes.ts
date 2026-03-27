// backend/src/routes/submit-tx.routes.ts
// POST /api/trading/submit-tx — user-signed transaction submission

import { Router } from 'express';
import { submitTxController } from '../controllers/submit-tx.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { tradeRateLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { submitTxBody } from '../schemas/validation.schemas.js';

const router: Router = Router();

/**
 * @swagger
 * /api/trading/submit-tx:
 *   post:
 *     summary: Submit a user-signed Stellar transaction
 *     description: >
 *       Accepts a base64-encoded signed XDR transaction, validates it is
 *       well-formed and signed by the authenticated user, then submits it
 *       to the Stellar network.
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signedXdr
 *             properties:
 *               signedXdr:
 *                 type: string
 *                 description: Base64-encoded signed Stellar transaction XDR
 *                 example: "AAAAAgAAAAA..."
 *     responses:
 *       200:
 *         description: Transaction submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionHash:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Malformed XDR or invalid signature
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       502:
 *         description: Stellar network error
 */
router.post(
  '/submit-tx',
  requireAuth,
  tradeRateLimiter,
  validate({ body: submitTxBody }),
  (req, res, next) => submitTxController.submitTx(req as any, res, next)
);

export default router;
