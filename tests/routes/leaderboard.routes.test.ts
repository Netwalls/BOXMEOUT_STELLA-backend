import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import leaderboardRoutes from '../../src/routes/leaderboard.routes.js';
import { leaderboardService } from '../../src/services/leaderboard.service.js';

vi.mock('../../src/services/leaderboard.service.js', () => ({
  leaderboardService: {
    getRankedLeaderboard: vi.fn(),
    getUserRank: vi.fn(),
    getGlobalLeaderboard: vi.fn(),
    getWeeklyLeaderboard: vi.fn(),
    getCategoryLeaderboard: vi.fn(),
  },
}));

vi.mock('../../src/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-123', publicKey: 'pk-123', tier: 'BEGINNER' };
    next();
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('Leaderboard Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/leaderboard', leaderboardRoutes);
  });

  describe('GET /api/leaderboard (issue #33)', () => {
    it('returns top 100 with default metric=profit period=all', async () => {
      const mockData = [
        { rank: 1, username: 'alice', avatarUrl: null, totalProfit: 500, accuracy: 75, winCount: 15, totalPredictions: 20 },
      ];
      vi.mocked(leaderboardService.getRankedLeaderboard).mockResolvedValue(mockData);

      const res = await request(app).get('/api/leaderboard');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockData);
      expect(leaderboardService.getRankedLeaderboard).toHaveBeenCalledWith({
        metric: 'profit',
        period: 'all',
        limit: 100,
      });
    });

    it('accepts metric and period query params', async () => {
      vi.mocked(leaderboardService.getRankedLeaderboard).mockResolvedValue([]);

      const res = await request(app).get('/api/leaderboard?metric=accuracy&period=weekly');

      expect(res.status).toBe(200);
      expect(leaderboardService.getRankedLeaderboard).toHaveBeenCalledWith({
        metric: 'accuracy',
        period: 'weekly',
        limit: 100,
      });
    });

    it('returns 400 for invalid metric', async () => {
      const res = await request(app).get('/api/leaderboard?metric=invalid');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid period', async () => {
      const res = await request(app).get('/api/leaderboard?period=yearly');
      expect(res.status).toBe(400);
    });

    it('each entry has required fields', async () => {
      const entry = {
        rank: 1,
        username: 'bob',
        avatarUrl: 'https://example.com/avatar.png',
        totalProfit: 200,
        accuracy: 60,
        winCount: 6,
        totalPredictions: 10,
      };
      vi.mocked(leaderboardService.getRankedLeaderboard).mockResolvedValue([entry]);

      const res = await request(app).get('/api/leaderboard');

      expect(res.status).toBe(200);
      const item = res.body.data[0];
      expect(item).toHaveProperty('rank');
      expect(item).toHaveProperty('username');
      expect(item).toHaveProperty('avatarUrl');
      expect(item).toHaveProperty('totalProfit');
      expect(item).toHaveProperty('accuracy');
      expect(item).toHaveProperty('winCount');
      expect(item).toHaveProperty('totalPredictions');
    });
  });

  describe('GET /api/leaderboard/me (issue #34)', () => {
    it('returns user rank and stats', async () => {
      const mockRank = { rank: 5, totalProfit: 300, accuracy: 70, winCount: 7, percentile: 95 };
      vi.mocked(leaderboardService.getUserRank).mockResolvedValue(mockRank);

      const res = await request(app).get('/api/leaderboard/me');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockRank);
      expect(leaderboardService.getUserRank).toHaveBeenCalledWith('user-123');
    });

    it('returns null rank if user has no predictions', async () => {
      vi.mocked(leaderboardService.getUserRank).mockResolvedValue(null);

      const res = await request(app).get('/api/leaderboard/me');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });
});
