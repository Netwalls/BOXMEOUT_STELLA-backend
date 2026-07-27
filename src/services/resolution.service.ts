import { Market, MarketStatus, Outcome, Dispute } from "@prisma/client";
import { db } from "../db";
import * as oracleService from "./oracle.service";
import { logger } from "../logger";

export interface ResolveFightOptions {
  marketId: string;
  outcome: Outcome;
  source?: string;
  reporter?: string;
}

export interface HandleDisputeOptions {
  disputeId: string;
  outcome: Outcome;
  admin: string;
  notes: string;
}

// Optimistic cache storage for active market resolution updates
const optimisticMarketCache = new Map<string, Partial<Market>>();

export class ResolutionService {
  /**
   * B-25: Admin action wiring OracleService.submitResolution + optimistic cache update.
   * Acceptance Criteria: Only callable through an authenticated admin route.
   */
  static async resolveFight(options: ResolveFightOptions) {
    const { marketId, outcome, source = "admin", reporter = "admin" } = options;

    if (!marketId) {
      throw new Error("Market ID is required");
    }
    if (!outcome) {
      throw new Error("Outcome is required");
    }

    const market = await db.market.findUnique({ where: { id: marketId } });
    if (!market) {
      throw new Error(`Market not found: ${marketId}`);
    }

    // Apply optimistic cache update
    optimisticMarketCache.set(marketId, {
      ...market,
      status: MarketStatus.Resolved,
      outcome,
      resolvedAt: new Date(),
    });

    try {
      // Wire OracleService.submitResolution
      const oracleResult = await oracleService.submitResolution(marketId, outcome, source, reporter);

      // Persist status update in DB
      const updatedMarket = await db.market.update({
        where: { id: marketId },
        data: {
          status: MarketStatus.Resolved,
          outcome,
          resolvedAt: new Date(),
        },
      });

      // Clear optimistic cache entry once DB update succeeds
      optimisticMarketCache.delete(marketId);

      return {
        success: true,
        market: updatedMarket,
        oracleResult,
      };
    } catch (err) {
      optimisticMarketCache.delete(marketId);
      logger.error({ err, marketId }, "ResolutionService.resolveFight failed");
      throw err;
    }
  }

  /**
   * B-26: Admin review action calling Market.finalize_resolution with a determined outcome.
   * Acceptance Criteria: Requires notes explaining the decision, stored for audit.
   */
  static async handleDispute(options: HandleDisputeOptions) {
    const { disputeId, outcome, admin, notes } = options;

    if (!disputeId) {
      throw new Error("Dispute ID is required");
    }
    if (!outcome) {
      throw new Error("Outcome is required");
    }
    if (!notes || !notes.trim()) {
      throw new Error("Notes explaining the decision are required for audit");
    }

    const dispute = await db.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    const market = await db.market.findUnique({ where: { id: dispute.marketId } });
    if (!market) {
      throw new Error(`Market not found for dispute: ${disputeId}`);
    }

    // Perform dispute resolution with override
    await oracleService.resolveDispute(disputeId, outcome, admin);

    const now = new Date();

    // Store audit logs & finalize dispute resolution notes
    const [updatedDispute, updatedMarket] = await db.$transaction([
      db.dispute.update({
        where: { id: disputeId },
        data: {
          resolvedAt: now,
          resolution: `${outcome}: ${notes.trim()}`,
        },
      }),
      db.market.update({
        where: { id: dispute.marketId },
        data: {
          status: MarketStatus.Resolved,
          outcome,
          resolvedAt: now,
        },
      }),
      db.adminLog.create({
        data: {
          action: "handleDispute",
          actor: admin,
          target: dispute.marketId,
          metadata: {
            disputeId,
            outcome,
            notes: notes.trim(),
            decisionNotes: notes.trim(),
          },
        },
      }),
      db.auditLog.create({
        data: {
          userId: admin,
          ipAddress: "127.0.0.1",
          method: "POST",
          path: "/api/admin/markets/dispute/resolve",
          requestBody: { disputeId, outcome, notes: notes.trim() },
          statusCode: 200,
        },
      }),
    ]);

    return {
      success: true,
      dispute: updatedDispute,
      market: updatedMarket,
      notes: notes.trim(),
    };
  }

  static getOptimisticMarket(marketId: string): Partial<Market> | undefined {
    return optimisticMarketCache.get(marketId);
  }

  static clearOptimisticCache(): void {
    optimisticMarketCache.clear();
  }
}

export const resolveFight = ResolutionService.resolveFight;
export const handleDispute = ResolutionService.handleDispute;
