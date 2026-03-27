// backend/tests/services/stellar.submit-tx.test.ts
// Unit tests for StellarService.submitSignedTransaction
// and the POST /api/trading/submit-tx endpoint.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../../src/middleware/error.middleware.js';
import { validate } from '../../src/middleware/validation.middleware.js';

// ---------------------------------------------------------------------------
// Hoist mocks — must be declared before any import that touches these modules
// ---------------------------------------------------------------------------
const { mockDecodeSignedXdr, mockValidateAndSubmit, mockIsValidPublicKey } =
  vi.hoisted(() => ({
    mockDecodeSignedXdr: vi.fn(),
    mockValidateAndSubmit: vi.fn(),
    mockIsValidPublicKey: vi.fn().mockReturnValue(true),
  }));

// Mock the Soroban RPC service so no network connections are made
vi.mock('../../src/services/blockchain/user-tx.service.js', () => ({
  userSignedTxService: {
    decodeSignedXdr: mockDecodeSignedXdr,
    validateAndSubmit: mockValidateAndSubmit,
  },
}));

// Mock Prisma so the test setup's cleanDatabase() doesn't hang
vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    trade: { deleteMany: vi.fn() },
    prediction: { deleteMany: vi.fn() },
    share: { deleteMany: vi.fn() },
    dispute: { deleteMany: vi.fn() },
    market: { deleteMany: vi.fn() },
    achievement: { deleteMany: vi.fn() },
    leaderboard: { deleteMany: vi.fn() },
    referral: { deleteMany: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
    transaction: { deleteMany: vi.fn() },
    distribution: { deleteMany: vi.fn() },
    auditLog: { deleteMany: vi.fn() },
    user: { deleteMany: vi.fn() },
    $disconnect: vi.fn(),
  },
}));

// Mock the Stellar SDK to avoid Horizon.Server construction on import
vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<any>('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      Server: vi.fn().mockImplementation(() => ({})),
    },
    rpc: {
      Server: vi.fn().mockImplementation(() => ({})),
    },
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { StellarService } from '../../src/services/stellar.service.js';
import { submitTxController } from '../../src/controllers/submit-tx.controller.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Valid base64 string — content is irrelevant; XDR decode is mocked
const VALID_B64 =
  'AAAAAgAAAABiZmFrZXhkcmJhc2U2NGVuY29kZWRzdHJpbmcAAAAAAAAAAAAAAAA=';

const AUTHED_USER = {
  userId: 'user-1',
  publicKey: 'GAMCVGJFOWWCF6N7YSS66DEZQSCGWZU2SCOWIA2NTMCKTODDTPUOOYDY',
};

// Inline submitTxBody schema so we don't import validation.schemas (which
// imports stellarService singleton and triggers Stellar SDK at module load).
import { z } from 'zod';
const submitTxBody = z.object({
  signedXdr: z
    .string()
    .min(1, 'signedXdr is required')
    .regex(/^[A-Za-z0-9+/]+=*$/, 'signedXdr must be a valid base64 string'),
});

/**
 * Minimal Express app — wires controller + validation without importing
 * rateLimit.middleware (which pulls in Redis and hangs unit tests).
 */
function buildApp() {
  const app = express();
  app.use(express.json());

  // Simulate requireAuth
  app.use((req: any, _res: any, next: any) => {
    req.user = AUTHED_USER;
    next();
  });

  app.post(
    '/api/trading/submit-tx',
    validate({ body: submitTxBody }),
    (req: any, res: any, next: any) =>
      submitTxController.submitTx(req, res, next)
  );

  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// StellarService unit tests
// ---------------------------------------------------------------------------
describe('StellarService.submitSignedTransaction', () => {
  let service: StellarService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StellarService();
  });

  it('returns txHash and status on success', async () => {
    mockDecodeSignedXdr.mockReturnValue({});
    mockValidateAndSubmit.mockResolvedValue({
      txHash: 'abc123',
      status: 'SUCCESS',
    });

    const result = await service.submitSignedTransaction(
      VALID_B64,
      AUTHED_USER.publicKey
    );

    expect(result.txHash).toBe('abc123');
    expect(result.status).toBe('SUCCESS');
    expect(mockValidateAndSubmit).toHaveBeenCalledWith(
      VALID_B64,
      AUTHED_USER.publicKey,
      'submit-tx'
    );
  });

  it('throws INVALID_XDR for malformed XDR — network is never called', async () => {
    mockDecodeSignedXdr.mockImplementation(() => {
      throw new Error('Invalid XDR transaction: malformed');
    });

    await expect(
      service.submitSignedTransaction('bad!!!', AUTHED_USER.publicKey)
    ).rejects.toMatchObject({ code: 'INVALID_XDR' });

    expect(mockValidateAndSubmit).not.toHaveBeenCalled();
  });

  it('throws INVALID_SIGNATURE when signature does not match', async () => {
    mockDecodeSignedXdr.mockReturnValue({});
    mockValidateAndSubmit.mockRejectedValue(
      new Error(
        'INVALID_SIGNATURE: Transaction not signed by expected public key'
      )
    );

    await expect(
      service.submitSignedTransaction(VALID_B64, AUTHED_USER.publicKey)
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  it('throws NETWORK_ERROR when Stellar RPC is unreachable', async () => {
    mockDecodeSignedXdr.mockReturnValue({});
    mockValidateAndSubmit.mockRejectedValue(
      new Error('fetch failed: ECONNREFUSED')
    );

    await expect(
      service.submitSignedTransaction(VALID_B64, AUTHED_USER.publicKey)
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// HTTP endpoint tests — POST /api/trading/submit-tx
// ---------------------------------------------------------------------------
describe('POST /api/trading/submit-tx', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('200 — valid XDR returns transactionHash and status', async () => {
    mockDecodeSignedXdr.mockReturnValue({});
    mockValidateAndSubmit.mockResolvedValue({
      txHash: 'deadbeef',
      status: 'SUCCESS',
    });

    const res = await request(app)
      .post('/api/trading/submit-tx')
      .send({ signedXdr: VALID_B64 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transactionHash).toBe('deadbeef');
    expect(res.body.data.status).toBe('SUCCESS');
  });

  it('400 — missing signedXdr field', async () => {
    const res = await request(app).post('/api/trading/submit-tx').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — non-base64 signedXdr rejected by Zod', async () => {
    const res = await request(app)
      .post('/api/trading/submit-tx')
      .send({ signedXdr: 'not base64!!!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — malformed XDR (passes base64 check but fails decode)', async () => {
    mockDecodeSignedXdr.mockImplementation(() => {
      throw new Error('Invalid XDR transaction: malformed');
    });

    const res = await request(app)
      .post('/api/trading/submit-tx')
      .send({ signedXdr: VALID_B64 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_XDR');
  });

  it('502 — Stellar network error', async () => {
    mockDecodeSignedXdr.mockReturnValue({});
    mockValidateAndSubmit.mockRejectedValue(
      new Error('fetch failed: ECONNREFUSED')
    );

    const res = await request(app)
      .post('/api/trading/submit-tx')
      .send({ signedXdr: VALID_B64 });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NETWORK_ERROR');
  });
});
