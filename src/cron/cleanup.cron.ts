import cron from 'node-cron';
import { logger } from '../utils/logger';
import {
  deleteExpiredSessions,
  deleteExpiredResetTokens,
  softDeleteOldNotifications,
  archiveFailedDistributions,
} from '../services/cron.service';

let isSessionsRunning = false;
let isResetTokensRunning = false;
let isNotificationsRunning = false;
let isDistributionsRunning = false;

export function startCleanupCron(): void {
  if (process.env.CLEANUP_CRON_DISABLED === 'true') {
    logger.info('Cleanup cron jobs disabled via CLEANUP_CRON_DISABLED');
    return;
  }

  // Hourly — expired sessions
  cron.schedule('0 * * * *', async () => {
    if (isSessionsRunning) {
      logger.warn('cleanupSessions: previous run still in progress, skipping');
      return;
    }
    isSessionsRunning = true;
    try {
      const count = await deleteExpiredSessions();
      logger.info({ count }, 'cleanupSessions: completed');
    } catch (err) {
      logger.error({ err }, 'cleanupSessions: failed');
    } finally {
      isSessionsRunning = false;
    }
  });

  // Hourly — expired password-reset tokens
  cron.schedule('0 * * * *', async () => {
    if (isResetTokensRunning) {
      logger.warn('cleanupResetTokens: previous run still in progress, skipping');
      return;
    }
    isResetTokensRunning = true;
    try {
      const count = await deleteExpiredResetTokens();
      logger.info({ count }, 'cleanupResetTokens: completed');
    } catch (err) {
      logger.error({ err }, 'cleanupResetTokens: failed');
    } finally {
      isResetTokensRunning = false;
    }
  });

  // Daily at 02:00 — soft-delete old notifications
  cron.schedule('0 2 * * *', async () => {
    if (isNotificationsRunning) {
      logger.warn('cleanupNotifications: previous run still in progress, skipping');
      return;
    }
    isNotificationsRunning = true;
    try {
      const count = await softDeleteOldNotifications();
      logger.info({ count }, 'cleanupNotifications: completed');
    } catch (err) {
      logger.error({ err }, 'cleanupNotifications: failed');
    } finally {
      isNotificationsRunning = false;
    }
  });

  // Weekly on Sunday at 03:00 — archive failed distributions
  cron.schedule('0 3 * * 0', async () => {
    if (isDistributionsRunning) {
      logger.warn('cleanupDistributions: previous run still in progress, skipping');
      return;
    }
    isDistributionsRunning = true;
    try {
      const count = await archiveFailedDistributions();
      logger.info({ count }, 'cleanupDistributions: completed');
    } catch (err) {
      logger.error({ err }, 'cleanupDistributions: failed');
    } finally {
      isDistributionsRunning = false;
    }
  });

  logger.info('Cleanup cron jobs scheduled (sessions/tokens: hourly, notifications: daily, distributions: weekly)');
}
