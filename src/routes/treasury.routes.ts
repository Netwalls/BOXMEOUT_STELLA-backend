import { Router } from 'express';
import { treasuryController } from '../controllers/treasury.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';

const router: Router = Router();

/**
 * @swagger
 * /api/treasury/balances:
 *   get:
 *     summary: Get treasury balances
 *     description: Get current balances of all treasury accounts
 *     tags: [Treasury]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balances retrieved successfully
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
 *                     platform:
 *                       type: number
 *                       description: Platform treasury balance in USDC
 *                     leaderboard:
 *                       type: number
 *                       description: Leaderboard pool balance in USDC
 *                     creator:
 *                       type: number
 *                       description: Creator rewards balance in USDC
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/balances', requireAuth, (req, res) =>
  treasuryController.getBalances(req, res)
);

/**
 * @swagger
 * /api/treasury/distribute-leaderboard:
 *   post:
 *     summary: Distribute leaderboard rewards
 *     description: Distribute rewards to top leaderboard performers (admin only)
 *     tags: [Treasury]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - period
 *             properties:
 *               period:
 *                 type: string
 *                 enum: [weekly, monthly]
 *     responses:
 *       200:
 *         description: Rewards distributed successfully
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
 *                     totalDistributed:
 *                       type: number
 *                     recipientCount:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/distribute-leaderboard', requireAuth, requireAdmin, (req, res) =>
  treasuryController.distributeLeaderboard(req, res)
);

/**
 * @swagger
 * /api/treasury/distribute-creator:
 *   post:
 *     summary: Distribute creator rewards
 *     description: Distribute rewards to market creators (admin only)
 *     tags: [Treasury]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - marketId
 *             properties:
 *               marketId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Creator rewards distributed successfully
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
 *                     amount:
 *                       type: number
 *                     creatorId:
 *                       type: string
 *                       format: uuid
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/distribute-creator', requireAuth, requireAdmin, (req, res) =>
  treasuryController.distributeCreator(req, res)
);

export default router;
