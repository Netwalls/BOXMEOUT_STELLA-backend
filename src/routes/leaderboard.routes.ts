// Leaderboard Routes
import { Router } from 'express';
import { leaderboardController } from '../controllers/leaderboard.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * /api/leaderboard:
 *   get:
 *     summary: Get global leaderboard (top 100)
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: metric
 *         schema:
 *           type: string
 *           enum: [profit, accuracy, wins]
 *           default: profit
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [all, weekly, monthly]
 *           default: all
 *     responses:
 *       200:
 *         description: Ranked leaderboard entries
 */
router.get('/', leaderboardController.getLeaderboard.bind(leaderboardController));

/**
 * @swagger
 * /api/leaderboard/me:
 *   get:
 *     summary: Get authenticated user's current rank and stats
 *     tags: [Leaderboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User rank data (null rank if no predictions yet)
 *       401:
 *         description: Unauthorized
 */
router.get('/me', requireAuth, leaderboardController.getMyRank.bind(leaderboardController));

/**
 * @swagger
 * /api/leaderboard/global:
 *   get:
 *     summary: Get global leaderboard (paginated)
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Global leaderboard data
 */
router.get('/global', leaderboardController.getGlobal.bind(leaderboardController));

/**
 * @swagger
 * /api/leaderboard/weekly:
 *   get:
 *     summary: Get weekly leaderboard
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Weekly leaderboard data
 */
router.get('/weekly', leaderboardController.getWeekly.bind(leaderboardController));

/**
 * @swagger
 * /api/leaderboard/category/{category}:
 *   get:
 *     summary: Get leaderboard by category
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Category leaderboard data
 */
router.get('/category/:category', leaderboardController.getByCategory.bind(leaderboardController));

export default router;
