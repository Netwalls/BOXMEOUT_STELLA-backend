import {
  setDbAdapter,
  deleteExpiredSessions,
  deleteExpiredResetTokens,
  softDeleteOldNotifications,
  archiveFailedDistributions,
  type CronDbAdapter,
} from '../../src/services/cron.service';

// ── Mock metrics so tests never register real Prometheus counters ─────────────
jest.mock('../../src/services/metrics.service', () => ({
  cronSessionsDeleted: { inc: jest.fn() },
  cronResetTokensDeleted: { inc: jest.fn() },
  cronNotificationsSoftDeleted: { inc: jest.fn() },
  cronDistributionsArchived: { inc: jest.fn() },
}));

import {
  cronSessionsDeleted,
  cronResetTokensDeleted,
  cronNotificationsSoftDeleted,
  cronDistributionsArchived,
} from '../../src/services/metrics.service';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeAdapter(overrides: Partial<CronDbAdapter> = {}): CronDbAdapter {
  return {
    deleteExpiredSessions: jest.fn().mockResolvedValue(0),
    deleteExpiredResetTokens: jest.fn().mockResolvedValue(0),
    softDeleteOldNotifications: jest.fn().mockResolvedValue(0),
    archiveFailedDistributions: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('cron.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1 ─────────────────────────────────────────────────────────────────────────
  describe('deleteExpiredSessions', () => {
    it('calls adapter.deleteExpiredSessions and returns row count', async () => {
      const adapter = makeAdapter({
        deleteExpiredSessions: jest.fn().mockResolvedValue(7),
      });
      setDbAdapter(adapter);

      const result = await deleteExpiredSessions();

      expect(adapter.deleteExpiredSessions).toHaveBeenCalledTimes(1);
      expect(result).toBe(7);
    });

    it('increments Prometheus counter by the number of deleted rows', async () => {
      setDbAdapter(makeAdapter({ deleteExpiredSessions: jest.fn().mockResolvedValue(3) }));

      await deleteExpiredSessions();

      expect((cronSessionsDeleted.inc as jest.Mock)).toHaveBeenCalledWith(3);
    });

    it('increments counter with 0 when no rows are deleted', async () => {
      setDbAdapter(makeAdapter({ deleteExpiredSessions: jest.fn().mockResolvedValue(0) }));

      await deleteExpiredSessions();

      expect((cronSessionsDeleted.inc as jest.Mock)).toHaveBeenCalledWith(0);
    });
  });

  // 2 ─────────────────────────────────────────────────────────────────────────
  describe('deleteExpiredResetTokens', () => {
    it('calls adapter.deleteExpiredResetTokens and returns row count', async () => {
      const adapter = makeAdapter({
        deleteExpiredResetTokens: jest.fn().mockResolvedValue(4),
      });
      setDbAdapter(adapter);

      const result = await deleteExpiredResetTokens();

      expect(adapter.deleteExpiredResetTokens).toHaveBeenCalledTimes(1);
      expect(result).toBe(4);
    });

    it('increments Prometheus counter by the number of deleted rows', async () => {
      setDbAdapter(makeAdapter({ deleteExpiredResetTokens: jest.fn().mockResolvedValue(2) }));

      await deleteExpiredResetTokens();

      expect((cronResetTokensDeleted.inc as jest.Mock)).toHaveBeenCalledWith(2);
    });
  });

  // 3 ─────────────────────────────────────────────────────────────────────────
  describe('softDeleteOldNotifications', () => {
    it('calls adapter.softDeleteOldNotifications and returns row count', async () => {
      const adapter = makeAdapter({
        softDeleteOldNotifications: jest.fn().mockResolvedValue(15),
      });
      setDbAdapter(adapter);

      const result = await softDeleteOldNotifications();

      expect(adapter.softDeleteOldNotifications).toHaveBeenCalledTimes(1);
      expect(result).toBe(15);
    });

    it('increments Prometheus counter by the number of soft-deleted rows', async () => {
      setDbAdapter(makeAdapter({ softDeleteOldNotifications: jest.fn().mockResolvedValue(10) }));

      await softDeleteOldNotifications();

      expect((cronNotificationsSoftDeleted.inc as jest.Mock)).toHaveBeenCalledWith(10);
    });

    it('does not call other adapters', async () => {
      const adapter = makeAdapter({
        softDeleteOldNotifications: jest.fn().mockResolvedValue(5),
      });
      setDbAdapter(adapter);

      await softDeleteOldNotifications();

      expect(adapter.deleteExpiredSessions).not.toHaveBeenCalled();
      expect(adapter.deleteExpiredResetTokens).not.toHaveBeenCalled();
      expect(adapter.archiveFailedDistributions).not.toHaveBeenCalled();
    });
  });

  // 4 ─────────────────────────────────────────────────────────────────────────
  describe('archiveFailedDistributions', () => {
    it('calls adapter.archiveFailedDistributions and returns row count', async () => {
      const adapter = makeAdapter({
        archiveFailedDistributions: jest.fn().mockResolvedValue(9),
      });
      setDbAdapter(adapter);

      const result = await archiveFailedDistributions();

      expect(adapter.archiveFailedDistributions).toHaveBeenCalledTimes(1);
      expect(result).toBe(9);
    });

    it('increments Prometheus counter by the number of archived rows', async () => {
      setDbAdapter(makeAdapter({ archiveFailedDistributions: jest.fn().mockResolvedValue(6) }));

      await archiveFailedDistributions();

      expect((cronDistributionsArchived.inc as jest.Mock)).toHaveBeenCalledWith(6);
    });
  });

  // 5 — cross-cutting: jobs are independent ───────────────────────────────────
  describe('job isolation', () => {
    it('each job calls only its own adapter method', async () => {
      const adapter = makeAdapter({
        deleteExpiredSessions: jest.fn().mockResolvedValue(1),
        deleteExpiredResetTokens: jest.fn().mockResolvedValue(1),
        softDeleteOldNotifications: jest.fn().mockResolvedValue(1),
        archiveFailedDistributions: jest.fn().mockResolvedValue(1),
      });
      setDbAdapter(adapter);

      await deleteExpiredSessions();
      expect(adapter.deleteExpiredSessions).toHaveBeenCalledTimes(1);
      expect(adapter.deleteExpiredResetTokens).not.toHaveBeenCalled();
      expect(adapter.softDeleteOldNotifications).not.toHaveBeenCalled();
      expect(adapter.archiveFailedDistributions).not.toHaveBeenCalled();
    });
  });
});
