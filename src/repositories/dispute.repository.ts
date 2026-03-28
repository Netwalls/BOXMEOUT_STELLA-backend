// Dispute repository - data access layer for disputes
import { Dispute, DisputeStatus } from '@prisma/client';
import { BaseRepository, toRepositoryError } from './base.repository.js';

export interface DisputeListOptions {
  status?: DisputeStatus;
  marketId?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedDisputes {
  disputes: Dispute[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class DisputeRepository extends BaseRepository<Dispute> {
  getModelName(): string {
    return 'dispute';
  }

  async findByMarketId(marketId: string): Promise<Dispute[]> {
    try {
      return await this.prisma.dispute.findMany({
        where: { marketId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async findByStatus(status: DisputeStatus): Promise<Dispute[]> {
    try {
      return await this.prisma.dispute.findMany({
        where: { status },
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async listDisputes(options: DisputeListOptions = {}): Promise<PaginatedDisputes> {
    try {
      const {
        status,
        marketId,
        page = 1,
        limit = 20
      } = options;

      // Build where clause
      const where: any = {};
      if (status) {
        where.status = status;
      }
      if (marketId) {
        where.marketId = marketId;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get total count for pagination info
      const total = await this.prisma.dispute.count({ where });

      // Get disputes with pagination
      const disputes = await this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          market: {
            select: {
              id: true,
              title: true,
              category: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
            },
          },
        },
      });

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        disputes,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }

  async updateStatus(
    id: string,
    status: DisputeStatus,
    updateData?: { resolution?: string; adminNotes?: string; resolvedAt?: Date }
  ): Promise<Dispute> {
    try {
      return await this.prisma.dispute.update({
        where: { id },
        data: { status, ...updateData },
      });
    } catch (err) {
      throw toRepositoryError(this.getModelName(), err);
    }
  }
}
