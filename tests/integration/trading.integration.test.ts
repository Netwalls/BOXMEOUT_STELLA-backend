// backend/tests/integration/trading.integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { prisma } from '../../src/database/prisma.js';
import { ammService } from '../../src/services/blockchain/amm.js';
import { MarketStatus } from '@prisma/client';

// Mock JWT verification
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn().mockReturnValue({
    userId: 'test-user-id',
    publicKey: 'GUSER123',
    tier: 'BEGINNER',
  }),
}));

// Mock AMM service
vi.mock('../../src/services/blockchain/amm.js', () => ({
  ammService: {
    buildBuySharesTx: vi.fn(),
    buildSellSharesTx: vi.fn(),
    submitSignedTx: vi.fn(),
  },
}));

// Mock Database
vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    market: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Trading API (User-Signed Transactions)', () => {
  const authToken = 'valid-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/markets/:marketId/build-tx/buy', () => {
    it('should return unsigned XDR for a valid market', async () => {
      // Mock market
      vi.mocked(prisma.market.findUnique).mockResolvedValue({
        id: 'market-1',
        status: MarketStatus.OPEN,
      } as any);

      // Mock AMM response
      vi.mocked(ammService.buildBuySharesTx).mockResolvedValue('AAAA-UNSIGNED-XDR');

      const response = await request(app)
        .post('/api/markets/market-1/build-tx/buy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          outcome: 1,
          amount: '1000',
          minShares: '900',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.xdr).toBe('AAAA-UNSIGNED-XDR');

      // Verify it called AMM with the user's public key from the JWT
      expect(ammService.buildBuySharesTx).toHaveBeenCalledWith('GUSER123', {
        marketId: 'market-1',
        outcome: 1,
        amountUsdc: BigInt(1000),
        minShares: BigInt(900),
      });
    });

    it('should fail if market is not OPEN', async () => {
      vi.mocked(prisma.market.findUnique).mockResolvedValue({
        id: 'market-1',
        status: MarketStatus.CLOSED,
      } as any);

      const response = await request(app)
        .post('/api/markets/market-1/build-tx/buy')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          outcome: 1,
          amount: '1000',
        });

      expect(response.status).toBe(500); // Controller catches the error and returns 500
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('CLOSED');
    });
  });

  describe('POST /api/submit-signed-tx', () => {
    it('should submit a signed XDR and return result', async () => {
      vi.mocked(ammService.submitSignedTx).mockResolvedValue({
        txHash: 'tx-123',
        status: 'SUCCESS',
      });

      const response = await request(app)
        .post('/api/submit-signed-tx')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          signedXdr: 'AAAA-SIGNED-XDR',
          action: 'BUY',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.txHash).toBe('tx-123');

      // Verify it passes the user's public key from the JWT for validation
      expect(ammService.submitSignedTx).toHaveBeenCalledWith(
        'AAAA-SIGNED-XDR',
        'GUSER123',
        'BUY'
      );
    });

    it('should reject if signedXdr is missing', async () => {
      const response = await request(app)
        .post('/api/submit-signed-tx')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'BUY' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
