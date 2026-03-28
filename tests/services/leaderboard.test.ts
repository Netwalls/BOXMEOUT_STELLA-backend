import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardService } from '../../src/services/leaderboard.service.js';
import { MarketCategory } from '@prisma/client';

vi.mock('../../src/config/redis.js', () => ({
  getRedisClient: () => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  }),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('Leaderboard Service Logic', () => {
  let leaderboardService: LeaderboardService;
  let mockLeaderboardRepository: any;

  beforeEach(() => {
    mockLeaderboardRepository = {
      updateUserStats: vi.fn(),
      updateCategoryStats: vi.fn(),
      updateAllRanks: vi.fn(),
      resetWeeklyStats: vi.fn(),
      getRanked: vi.fn(),
      getUserRank: vi.fn(),
      getGlobal: vi.fn(),
      getWeekly: vi.fn(),
      getByCategory: vi.fn(),
    };

    leaderboardService = new LeaderboardService(mockLeaderboardRepository);
  });

  describe('handleSettlement', () => {
    it('should call repository methods with correct data', async () => {
      const userId = 'user-1';
      const marketId = 'market-1';
      const category = MarketCategory.MMA;
      const pnl = 100.5;
      const isWin = true;

      await leaderboardService.handleSettlement(userId, marketId, category, pnl, isWin);

      expect(mockLeaderboardRepository.updateUserStats).toHaveBeenCalledWith(userId, pnl, isWin);
      expect(mockLeaderboardRepository.updateCategoryStats).toHaveBeenCalledWith(userId, category, pnl, isWin);
    });

    it('should handle errors gracefully', async () => {
      mockLeaderboardRepository.updateUserStats.mockRejectedValue(new Error('DB Error'));

      const result = await leaderboardService.handleSettlement('user-1', 'm1', MarketCategory.BOXING, 10, true);

      expect(result).toBe(false);
    });
  });

  describe('calculateRanks', () => {
    it('should call repository.updateAllRanks', async () => {
      await leaderboardService.calculateRanks();
      expect(mockLeaderboardRepository.updateAllRanks).toHaveBeenCalled();
    });
  });

  describe('resetWeeklyRankings', () => {
    it('should reset stats and then recalculate ranks', async () => {
      await leaderboardService.resetWeeklyRankings();
      expect(mockLeaderboardRepository.resetWeeklyStats).toHaveBeenCalled();
      expect(mockLeaderboardRepository.updateAllRanks).toHaveBeenCalled();
    });
  });

  describe('getRankedLeaderboard (issue #33)', () => {
    it('fetches from repository and caches result', async () => {
      const mockEntries = [
        { rank: 1, username: 'alice', avatarUrl: null, totalProfit: 500, accuracy: 75, winCount: 15, totalPredictions: 20 },
      ];
      mockLeaderboardRepository.getRanked.mockResolvedValue(mockEntries);

      const result = await leaderboardService.getRankedLeaderboard({ metric: 'profit', period: 'all' });

      expect(mockLeaderboardRepository.getRanked).toHaveBeenCalledWith({ metric: 'profit', period: 'all', limit: 100 });
      expect(result).toEqual(mockEntries);
    });
  });

  describe('getUserRank (issue #34)', () => {
    it('returns user rank data', async () => {
      const mockRank = { rank: 3, totalProfit: 200, accuracy: 65, winCount: 13, percentile: 90 };
      mockLeaderboardRepository.getUserRank.mockResolvedValue(mockRank);

      const result = await leaderboardService.getUserRank('user-1');

      expect(mockLeaderboardRepository.getUserRank).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockRank);
    });

    it('returns null if user has no leaderboard entry', async () => {
      mockLeaderboardRepository.getUserRank.mockResolvedValue(null);

      const result = await leaderboardService.getUserRank('new-user');

      expect(result).toBeNull();
    });
  });
});
