// User repository - data access layer for users
import { User, UserTier, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

export class UserRepository extends BaseRepository<User> {
  getModelName(): string {
    return 'user';
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.timedQuery('findByEmail', () =>
      this.prisma.user.findUnique({ where: { email } })
    );
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.timedQuery('findByUsername', () =>
      this.prisma.user.findUnique({ where: { username } })
    );
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.timedQuery('findByWalletAddress', () =>
      this.prisma.user.findUnique({ where: { walletAddress } })
    );
  }

  async createUser(data: {
    email: string;
    username: string;
    passwordHash: string;
    displayName?: string;
    walletAddress?: string;
  }): Promise<User> {
    return this.timedQuery('createUser', () =>
      this.prisma.user.create({ data })
    );
  }

  async updateBalance(
    userId: string,
    usdcBalance?: number,
    xlmBalance?: number
  ): Promise<User> {
    return this.timedQuery('updateBalance', () => {
      const updateData: any = {};
      if (usdcBalance !== undefined) updateData.usdcBalance = usdcBalance;
      if (xlmBalance !== undefined) updateData.xlmBalance = xlmBalance;
      return this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    });
  }

  async updateWalletAddress(
    userId: string,
    walletAddress: string
  ): Promise<User> {
    return this.timedQuery('updateWalletAddress', () =>
      this.prisma.user.update({
        where: { id: userId },
        data: { walletAddress },
      })
    );
  }

  async updateTier(userId: string, tier: UserTier): Promise<User> {
    return this.timedQuery('updateTier', () =>
      this.prisma.user.update({ where: { id: userId }, data: { tier } })
    );
  }

  async updateLastLogin(userId: string): Promise<User> {
    return this.timedQuery('updateLastLogin', () =>
      this.prisma.user.update({
        where: { id: userId },
        data: { lastLogin: new Date() },
      })
    );
  }

  async searchUsers(
    query: string,
    limit: number = 10
  ): Promise<Partial<User>[]> {
    return this.timedQuery('searchUsers', () =>
      this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
          isActive: true,
        },
        take: limit,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          tier: true,
          reputationScore: true,
          createdAt: true,
        },
      })
    );
  }

  async getUserStats(userId: string) {
    return this.timedQuery('getUserStats', async () => {
      const [user, predictionCount, winCount, totalPnl] = await Promise.all([
        this.findById(userId),
        this.prisma.prediction.count({ where: { userId, status: 'SETTLED' } }),
        this.prisma.prediction.count({
          where: { userId, status: 'SETTLED', isWinner: true },
        }),
        this.prisma.prediction.aggregate({
          where: { userId, status: 'SETTLED' },
          _sum: { pnlUsd: true },
        }),
      ]);
      return {
        user,
        predictionCount,
        winCount,
        lossCount: predictionCount - winCount,
        winRate: predictionCount > 0 ? (winCount / predictionCount) * 100 : 0,
        totalPnl: totalPnl._sum.pnlUsd || 0,
      };
    });
  }

  /**
   * Returns public profile fields for any user (issue #35)
   */
  async getPublicProfile(userId: string) {
    return this.timedQuery('getPublicProfile', async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      if (!user) return null;

      const [predictionCount, winCount] = await Promise.all([
        this.prisma.prediction.count({ where: { userId, status: 'SETTLED' } }),
        this.prisma.prediction.count({
          where: { userId, status: 'SETTLED', isWinner: true },
        }),
      ]);

      return {
        ...user,
        totalPredictions: predictionCount,
        winRate: predictionCount > 0 ? (winCount / predictionCount) * 100 : 0,
      };
    });
  }

  /**
   * Returns full profile for the authenticated user (issue #35)
   */
  async getFullProfile(userId: string) {
    return this.timedQuery('getFullProfile', async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          avatarUrl: true,
          walletAddress: true,
          tier: true,
          createdAt: true,
          referralsGiven: {
            take: 1,
            select: { referralCode: true },
          },
        },
      });

      if (!user) return null;

      const [predictionCount, winCount] = await Promise.all([
        this.prisma.prediction.count({ where: { userId, status: 'SETTLED' } }),
        this.prisma.prediction.count({
          where: { userId, status: 'SETTLED', isWinner: true },
        }),
      ]);

      const { referralsGiven, ...rest } = user;
      return {
        ...rest,
        referralCode: referralsGiven[0]?.referralCode ?? null,
        totalPredictions: predictionCount,
        winRate: predictionCount > 0 ? (winCount / predictionCount) * 100 : 0,
      };
    });
  }

  /**
   * Paginated user list for admin (issue #37)
   */
  async listUsers(params: {
    page: number;
    limit: number;
    role?: UserTier;
    status?: 'active' | 'suspended';
    search?: string;
  }) {
    return this.timedQuery('listUsers', async () => {
      const { page, limit, role, status, search } = params;
      const skip = (page - 1) * limit;

      const where: Prisma.UserWhereInput = {};
      if (role) where.tier = role;
      if (status === 'active') where.isActive = true;
      if (status === 'suspended') where.isActive = false;
      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          skip,
          take: limit,
          select: {
            id: true,
            username: true,
            email: true,
            tier: true,
            isActive: true,
            createdAt: true,
            lastLogin: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.user.count({ where }),
      ]);

      return { users, total, page, limit };
    });
  }

  /**
   * Suspend a user account (issue #37)
   */
  async suspendUser(userId: string): Promise<User> {
    return this.timedQuery('suspendUser', () =>
      this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      })
    );
  }

  /**
   * Update user role/tier (issue #37)
   */
  async updateRole(userId: string, role: UserTier): Promise<User> {
    return this.timedQuery('updateRole', () =>
      this.prisma.user.update({
        where: { id: userId },
        data: { tier: role },
      })
    );
  }
}
