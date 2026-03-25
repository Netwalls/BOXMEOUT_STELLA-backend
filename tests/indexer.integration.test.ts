// backend/tests/indexer.integration.test.ts
// Integration tests for indexer API endpoints

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

const {
  mockVerifyAccessToken,
  mockGetStatistics,
  mockStartIndexer,
  mockStopIndexer,
  mockReprocessFromLedger,
} = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
  mockGetStatistics: vi.fn(),
  mockStartIndexer: vi.fn(),
  mockStopIndexer: vi.fn(),
  mockReprocessFromLedger: vi.fn(),
}));

vi.mock('../src/utils/jwt.js', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

vi.mock('../src/services/blockchain/indexer.js', () => ({
  indexerService: {
    getStatistics: mockGetStatistics,
    start: mockStartIndexer,
    stop: mockStopIndexer,
    reprocessFromLedger: mockReprocessFromLedger,
  },
}));

const { default: app } = await import('../src/index.js');

describe('Indexer API Integration Tests', () => {
  let authToken: string;
  const adminPublicKey =
    process.env.ADMIN_WALLET_ADDRESSES?.split(',')[0] || 'GADMIN';

  beforeEach(() => {
    authToken = 'mock_admin_jwt_token';

    mockVerifyAccessToken.mockReset();
    mockGetStatistics.mockReset();
    mockStartIndexer.mockReset();
    mockStopIndexer.mockReset();
    mockReprocessFromLedger.mockReset();

    mockVerifyAccessToken.mockReturnValue({
      userId: 'admin-user-id',
      publicKey: adminPublicKey,
      tier: 'LEGENDARY',
    });

    mockGetStatistics.mockResolvedValue({
      state: {
        lastProcessedLedger: 1234,
        isRunning: true,
        eventsProcessed: 56,
      },
      latestLedger: 1240,
      ledgersBehind: 6,
    });
    mockStartIndexer.mockResolvedValue(undefined);
    mockStopIndexer.mockResolvedValue(undefined);
    mockReprocessFromLedger.mockResolvedValue(undefined);
  });

  describe('GET /api/indexer/status', () => {
    it('should return indexer status for admin', async () => {
      const response = await request(app)
        .get('/api/indexer/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('state');
      expect(response.body.data).toHaveProperty('latestLedger');
      expect(response.body.data).toHaveProperty('ledgersBehind');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/indexer/status');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should require admin access', async () => {
      mockVerifyAccessToken.mockReturnValueOnce({
        userId: 'regular-user-id',
        publicKey: 'GREGULAR',
        tier: 'BEGINNER',
      });

      const response = await request(app)
        .get('/api/indexer/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/indexer/start', () => {
    it('should start indexer for admin', async () => {
      const response = await request(app)
        .post('/api/indexer/start')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/indexer/start');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/indexer/stop', () => {
    it('should stop indexer for admin', async () => {
      const response = await request(app)
        .post('/api/indexer/stop')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/indexer/stop');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/indexer/reprocess', () => {
    it('should reprocess from specified ledger for admin', async () => {
      const response = await request(app)
        .post('/api/indexer/reprocess')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startLedger: 1000 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('1000');
    });

    it('should validate startLedger parameter', async () => {
      const response = await request(app)
        .post('/api/indexer/reprocess')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startLedger: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require startLedger parameter', async () => {
      const response = await request(app)
        .post('/api/indexer/reprocess')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/indexer/reprocess')
        .send({ startLedger: 1000 });

      expect(response.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle internal errors gracefully', async () => {
      mockGetStatistics.mockRejectedValueOnce(new Error('boom'));

      const response = await request(app)
        .get('/api/indexer/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });
});
