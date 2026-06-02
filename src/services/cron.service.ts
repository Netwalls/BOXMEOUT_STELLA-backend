import { pool } from '../config/db';
import {
  cronSessionsDeleted,
  cronResetTokensDeleted,
  cronNotificationsSoftDeleted,
  cronDistributionsArchived,
} from './metrics.service';

// ---------------------------------------------------------------------------
// DbAdapter interface — injected in tests, backed by pool in production
// ---------------------------------------------------------------------------

export interface CronDbAdapter {
  deleteExpiredSessions(): Promise<number>;
  deleteExpiredResetTokens(): Promise<number>;
  softDeleteOldNotifications(): Promise<number>;
  archiveFailedDistributions(): Promise<number>;
}

const defaultAdapter: CronDbAdapter = {
  async deleteExpiredSessions() {
    const result = await pool.query(
      `DELETE FROM user_sessions WHERE expires_at < NOW()`,
    );
    return result.rowCount ?? 0;
  },

  async deleteExpiredResetTokens() {
    const result = await pool.query(
      `DELETE FROM password_reset_tokens WHERE expires_at < NOW()`,
    );
    return result.rowCount ?? 0;
  },

  async softDeleteOldNotifications() {
    const result = await pool.query(
      `UPDATE notification_jobs
          SET deleted_at = NOW()
        WHERE deleted_at IS NULL
          AND created_at < NOW() - INTERVAL '90 days'`,
    );
    return result.rowCount ?? 0;
  },

  async archiveFailedDistributions() {
    const result = await pool.query(
      `UPDATE distributions
          SET archived_at = NOW()
        WHERE status = 'failed'
          AND archived_at IS NULL
          AND created_at < NOW() - INTERVAL '30 days'`,
    );
    return result.rowCount ?? 0;
  },
};

let adapter: CronDbAdapter = defaultAdapter;

export function setDbAdapter(a: CronDbAdapter): void {
  adapter = a;
}

export function getCronAdapter(): CronDbAdapter {
  return adapter;
}

// ---------------------------------------------------------------------------
// Job functions — called by the cron schedule
// ---------------------------------------------------------------------------

export async function deleteExpiredSessions(): Promise<number> {
  const count = await adapter.deleteExpiredSessions();
  cronSessionsDeleted.inc(count);
  return count;
}

export async function deleteExpiredResetTokens(): Promise<number> {
  const count = await adapter.deleteExpiredResetTokens();
  cronResetTokensDeleted.inc(count);
  return count;
}

export async function softDeleteOldNotifications(): Promise<number> {
  const count = await adapter.softDeleteOldNotifications();
  cronNotificationsSoftDeleted.inc(count);
  return count;
}

export async function archiveFailedDistributions(): Promise<number> {
  const count = await adapter.archiveFailedDistributions();
  cronDistributionsArchived.inc(count);
  return count;
}
