// backend/tests/services/cron.service.test.ts
// Unit tests for CronService scheduled jobs.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronService } from '../../src/services/cron.service.js';
import { PredictionStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/services/blockchain/oracle.js', () => ({
  oracleService: { checkConsensus: vi.fn() },
}));

vi.mock('../../src/services/blockchain/market.js', () => ({
  marketBlockchainService: { resolveMarket: vi.fn() },
}));

import { oracleService } from '../../src/services/blockchain/oracle.js';
import { marketBlockchainService } from '../../src/services/blockchain/market.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const openMarket = (id: string, closingAt = new Date(Date.now() - 1000)) => ({
  id,
  status: 'OPEN',
  closingAt,
  contractAddress: `contract-${id}`,
  winningOutcome: null,
});

const closedMarket = (id: string) => ({
  id,
  status: 'CLOSED',
  closedAt: new Date(),
  contractAddress: `contract-${id}`,
  winningOutcome: null,
});

const disputedMarket = (id: string, winningOutcome = 1) => ({
  id,
  status: 'DISPUTED',
  resolvedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 h ago
  contractAddress: `contract-${id}`,
  winningOutcome,
});

const resolvedMarket = (id: string, winningOutcome = 1) => ({
  id,
  status: 'RESOLVED',
  resolvedAt: new Date(),
  contractAddress: `contract-${id}`,
  winningOutcome,
});

const revealedPrediction = (id: string, outcome: number, amount = 100) => ({
  id,
  userId: `user-${id}`,
  marketId: 'market-1',
  predictedOutcome: outcome,
  amountUsdc: amount,
  status: PredictionStatus.REVEALED,
});

// ---------------------------------------------------------------------------
// Factory — builds a CronService with fully-mocked dependencies
// ---------------------------------------------------------------------------

function makeCronService() {
  const marketRepository: any = {
    findExpiredOpenMarkets: vi.fn(),
    findDisputedMarketsReadyToFinalize: vi.fn(),
    findResolvedMarketsWithUnsettledPredictions: vi.fn(),
    getClosedMarketsAwaitingResolution: vi.fn(),
  };

  const marketService: any = {
    closeMarket: vi.fn(),
    resolveMarket: vi.fn(),
  };

  const notificationRepository: any = {
    deleteExpiredNotifications: vi.fn(),
  };

  const predictionRepository: any = {
    findMarketPredictions: vi.fn(),
    settlePrediction: vi.fn(),
  };

  const service = new CronService(
    marketRepository,
    marketService,
    notificationRepository,
    predictionRepository
  );

  return {
    service,
    marketRepository,
    marketService,
    notificationRepository,
    predictionRepository,
  };
}

// ===========================================================================
// closeBetting
// ===========================================================================

describe('CronService.closeBetting()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when no expired open markets exist', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.findExpiredOpenMarkets.mockResolvedValue([]);

    await service.closeBetting();

    expect(marketService.closeMarket).not.toHaveBeenCalled();
  });

  it('closes every expired open market', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.findExpiredOpenMarkets.mockResolvedValue([
      openMarket('m1'),
      openMarket('m2'),
    ]);
    marketService.closeMarket.mockResolvedValue({});

    await service.closeBetting();

    expect(marketService.closeMarket).toHaveBeenCalledTimes(2);
    expect(marketService.closeMarket).toHaveBeenCalledWith('m1');
    expect(marketService.closeMarket).toHaveBeenCalledWith('m2');
  });

  it('continues closing remaining markets when one fails', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.findExpiredOpenMarkets.mockResolvedValue([
      openMarket('m-bad'),
      openMarket('m-good'),
    ]);
    marketService.closeMarket
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({});

    await service.closeBetting();

    expect(marketService.closeMarket).toHaveBeenCalledTimes(2);
  });

  it('returns early when fetching markets fails', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.findExpiredOpenMarkets.mockRejectedValue(
      new Error('DB down')
    );

    await service.closeBetting(); // must not throw

    expect(marketService.closeMarket).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// finalizeResolution
// ===========================================================================

describe('CronService.finalizeResolution()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when no disputed markets are ready', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.findDisputedMarketsReadyToFinalize.mockResolvedValue([]);

    await service.finalizeResolution();

    expect(marketBlockchainService.resolveMarket).not.toHaveBeenCalled();
    expect(marketService.resolveMarket).not.toHaveBeenCalled();
  });

  it('calls on-chain resolveMarket then DB resolveMarket for each market', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    const market = disputedMarket('m1', 1);
    marketRepository.findDisputedMarketsReadyToFinalize.mockResolvedValue([
      market,
    ]);
    vi.mocked(marketBlockchainService.resolveMarket).mockResolvedValue({
      txHash: 'tx-abc',
    });
    marketService.resolveMarket.mockResolvedValue({ id: 'm1' });

    await service.finalizeResolution();

    expect(marketBlockchainService.resolveMarket).toHaveBeenCalledWith(
      market.contractAddress
    );
    expect(marketService.resolveMarket).toHaveBeenCalledWith(
      'm1',
      1,
      'finalize-resolution'
    );
  });

  it('defaults winningOutcome to 0 when null', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    const market = { ...disputedMarket('m1'), winningOutcome: null };
    marketRepository.findDisputedMarketsReadyToFinalize.mockResolvedValue([
      market,
    ]);
    vi.mocked(marketBlockchainService.resolveMarket).mockResolvedValue({
      txHash: 'tx-abc',
    });
    marketService.resolveMarket.mockResolvedValue({ id: 'm1' });

    await service.finalizeResolution();

    expect(marketService.resolveMarket).toHaveBeenCalledWith(
      'm1',
      0,
      'finalize-resolution'
    );
  });

  it('continues when one market fails on-chain', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.findDisputedMarketsReadyToFinalize.mockResolvedValue([
      disputedMarket('m-bad'),
      disputedMarket('m-good'),
    ]);
    vi.mocked(marketBlockchainService.resolveMarket)
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce({ txHash: 'tx-ok' });
    marketService.resolveMarket.mockResolvedValue({});

    await service.finalizeResolution();

    expect(marketBlockchainService.resolveMarket).toHaveBeenCalledTimes(2);
    expect(marketService.resolveMarket).toHaveBeenCalledTimes(1);
    expect(marketService.resolveMarket).toHaveBeenCalledWith(
      'm-good',
      1,
      'finalize-resolution'
    );
  });

  it('returns early when fetching markets fails', async () => {
    const { service, marketRepository } = makeCronService();
    marketRepository.findDisputedMarketsReadyToFinalize.mockRejectedValue(
      new Error('DB down')
    );

    await service.finalizeResolution(); // must not throw

    expect(marketBlockchainService.resolveMarket).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// settlePredictions
// ===========================================================================

describe('CronService.settlePredictions()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when no resolved markets have unsettled predictions', async () => {
    const { service, marketRepository, predictionRepository } =
      makeCronService();
    marketRepository.findResolvedMarketsWithUnsettledPredictions.mockResolvedValue(
      []
    );

    await service.settlePredictions();

    expect(predictionRepository.findMarketPredictions).not.toHaveBeenCalled();
  });

  it('settles winning and losing predictions with correct PnL', async () => {
    const { service, marketRepository, predictionRepository } =
      makeCronService();
    const market = resolvedMarket('m1', 1);
    marketRepository.findResolvedMarketsWithUnsettledPredictions.mockResolvedValue(
      [market]
    );
    predictionRepository.findMarketPredictions.mockResolvedValue([
      revealedPrediction('p1', 1, 100), // winner
      revealedPrediction('p2', 0, 50), // loser
    ]);
    predictionRepository.settlePrediction.mockResolvedValue({});

    await service.settlePredictions();

    expect(predictionRepository.settlePrediction).toHaveBeenCalledTimes(2);
    expect(predictionRepository.settlePrediction).toHaveBeenCalledWith(
      'p1',
      true,
      90 // 100 * 0.9
    );
    expect(predictionRepository.settlePrediction).toHaveBeenCalledWith(
      'p2',
      false,
      -50
    );
  });

  it('skips predictions that are already SETTLED', async () => {
    const { service, marketRepository, predictionRepository } =
      makeCronService();
    marketRepository.findResolvedMarketsWithUnsettledPredictions.mockResolvedValue(
      [resolvedMarket('m1', 1)]
    );
    predictionRepository.findMarketPredictions.mockResolvedValue([
      { ...revealedPrediction('p1', 1), status: PredictionStatus.SETTLED },
    ]);

    await service.settlePredictions();

    expect(predictionRepository.settlePrediction).not.toHaveBeenCalled();
  });

  it('skips markets with no winningOutcome', async () => {
    const { service, marketRepository, predictionRepository } =
      makeCronService();
    marketRepository.findResolvedMarketsWithUnsettledPredictions.mockResolvedValue(
      [{ ...resolvedMarket('m1'), winningOutcome: null }]
    );

    await service.settlePredictions();

    expect(predictionRepository.findMarketPredictions).not.toHaveBeenCalled();
  });

  it('continues when one market fails', async () => {
    const { service, marketRepository, predictionRepository } =
      makeCronService();
    marketRepository.findResolvedMarketsWithUnsettledPredictions.mockResolvedValue(
      [resolvedMarket('m-bad', 1), resolvedMarket('m-good', 0)]
    );
    predictionRepository.findMarketPredictions
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce([revealedPrediction('p1', 0, 100)]);
    predictionRepository.settlePrediction.mockResolvedValue({});

    await service.settlePredictions();

    expect(predictionRepository.settlePrediction).toHaveBeenCalledTimes(1);
  });

  it('returns early when fetching markets fails', async () => {
    const { service, marketRepository, predictionRepository } =
      makeCronService();
    marketRepository.findResolvedMarketsWithUnsettledPredictions.mockRejectedValue(
      new Error('DB down')
    );

    await service.settlePredictions(); // must not throw

    expect(predictionRepository.findMarketPredictions).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// expireNotifications
// ===========================================================================

describe('CronService.expireNotifications()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes notifications older than 90 days and logs the count', async () => {
    const { service, notificationRepository } = makeCronService();
    notificationRepository.deleteExpiredNotifications.mockResolvedValue(42);

    await service.expireNotifications();

    expect(
      notificationRepository.deleteExpiredNotifications
    ).toHaveBeenCalledWith(90);
  });

  it('does not throw when deletion fails', async () => {
    const { service, notificationRepository } = makeCronService();
    notificationRepository.deleteExpiredNotifications.mockRejectedValue(
      new Error('DB error')
    );

    await expect(service.expireNotifications()).resolves.not.toThrow();
  });
});

// ===========================================================================
// pollOracleConsensus (existing tests — preserved)
// ===========================================================================

describe('CronService.pollOracleConsensus()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when no CLOSED markets exist', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([]);

    await service.pollOracleConsensus();

    expect(oracleService.checkConsensus).not.toHaveBeenCalled();
    expect(marketService.resolveMarket).not.toHaveBeenCalled();
  });

  it('skips markets where oracle returns null (no consensus)', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-abc'),
    ]);
    vi.mocked(oracleService.checkConsensus).mockResolvedValue(null);

    await service.pollOracleConsensus();

    expect(oracleService.checkConsensus).toHaveBeenCalledWith('market-abc');
    expect(marketService.resolveMarket).not.toHaveBeenCalled();
  });

  it('resolves a market when oracle returns a winning outcome', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-abc'),
    ]);
    vi.mocked(oracleService.checkConsensus).mockResolvedValue(1);
    marketService.resolveMarket.mockResolvedValue({
      id: 'market-abc',
      resolvedAt: new Date(),
    });

    await service.pollOracleConsensus();

    expect(marketService.resolveMarket).toHaveBeenCalledWith(
      'market-abc',
      1,
      'oracle-consensus'
    );
  });

  it('resolves outcome 0 correctly (falsy but valid)', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-xyz'),
    ]);
    vi.mocked(oracleService.checkConsensus).mockResolvedValue(0);
    marketService.resolveMarket.mockResolvedValue({
      id: 'market-xyz',
      resolvedAt: new Date(),
    });

    await service.pollOracleConsensus();

    expect(marketService.resolveMarket).toHaveBeenCalledWith(
      'market-xyz',
      0,
      'oracle-consensus'
    );
  });

  it('processes all markets and skips those without consensus', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-1'),
      closedMarket('market-2'),
      closedMarket('market-3'),
    ]);
    vi.mocked(oracleService.checkConsensus)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    marketService.resolveMarket.mockResolvedValue({ resolvedAt: new Date() });

    await service.pollOracleConsensus();

    expect(oracleService.checkConsensus).toHaveBeenCalledTimes(3);
    expect(marketService.resolveMarket).toHaveBeenCalledTimes(2);
  });

  it('continues processing remaining markets when one fails', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-bad'),
      closedMarket('market-good'),
    ]);
    vi.mocked(oracleService.checkConsensus)
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce(1);
    marketService.resolveMarket.mockResolvedValue({ resolvedAt: new Date() });

    await service.pollOracleConsensus();

    expect(marketService.resolveMarket).toHaveBeenCalledTimes(1);
    expect(marketService.resolveMarket).toHaveBeenCalledWith(
      'market-good',
      1,
      'oracle-consensus'
    );
  });

  it('returns early when fetching markets fails', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.getClosedMarketsAwaitingResolution.mockRejectedValue(
      new Error('DB connection lost')
    );

    await service.pollOracleConsensus();

    expect(oracleService.checkConsensus).not.toHaveBeenCalled();
    expect(marketService.resolveMarket).not.toHaveBeenCalled();
  });

  it('continues when resolveMarket throws for one market', async () => {
    const { service, marketRepository, marketService } = makeCronService();
    marketRepository.getClosedMarketsAwaitingResolution.mockResolvedValue([
      closedMarket('market-fail'),
      closedMarket('market-ok'),
    ]);
    vi.mocked(oracleService.checkConsensus).mockResolvedValue(1);
    marketService.resolveMarket
      .mockRejectedValueOnce(new Error('Settlement failed'))
      .mockResolvedValueOnce({ resolvedAt: new Date() });

    await service.pollOracleConsensus();

    expect(marketService.resolveMarket).toHaveBeenCalledTimes(2);
  });
});
