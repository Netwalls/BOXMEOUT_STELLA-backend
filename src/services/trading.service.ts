// backend/src/services/trading.service.ts
// Service for handling trading logic, including unsigned transaction building and submission

import { ammService } from './blockchain/amm.js';
import { prisma } from '../database/prisma.js';
import { MarketStatus } from '@prisma/client';

export class TradingService {
  /**
   * Build unsigned transaction for buying shares
   */
  async buildBuySharesTx(
    userId: string,
    userPublicKey: string,
    marketId: string,
    outcome: number,
    amountUsdc: bigint,
    minShares: bigint
  ) {
    // Validate market
    const market = await prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      throw new Error('Market not found');
    }

    if (market.status !== MarketStatus.OPEN) {
      throw new Error(`Market is ${market.status}, trading not allowed`);
    }

    return await ammService.buildBuySharesTx(userPublicKey, {
      marketId,
      outcome,
      amountUsdc,
      minShares,
    });
  }

  /**
   * Build unsigned transaction for selling shares
   */
  async buildSellSharesTx(
    userId: string,
    userPublicKey: string,
    marketId: string,
    outcome: number,
    shares: bigint,
    minPayout: bigint
  ) {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      throw new Error('Market not found');
    }

    return await ammService.buildSellSharesTx(userPublicKey, {
      marketId,
      outcome,
      shares,
      minPayout,
    });
  }

  /**
   * Submit a user-signed transaction
   */
  async submitSignedTx(
    userId: string,
    userPublicKey: string,
    signedXdr: string,
    action: 'BUY' | 'SELL' | 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY'
  ) {
    const result = await ammService.submitSignedTx(
      signedXdr,
      userPublicKey,
      action
    );

    // After success, we would normally sync with DB (e.g. record trade, update balances)
    // For this P0 challenge, we focus on the signing flow.
    // In a real scenario, we'd add prisma calls here to record the trade based on the result.

    return result;
  }
}

export const tradingService = new TradingService();
