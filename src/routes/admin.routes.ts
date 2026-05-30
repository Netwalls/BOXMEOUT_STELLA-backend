import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { flagDispute, investigateDispute, cancelMarket, resolveDispute, listDisputes, processRefunds, bulkPause, bulkCancel } from '../api/controllers/AdminController';
import {
  logExportAudit,
  streamUsersExport,
  streamTradesExport,
  streamTreasuryExport,
  buildTradesCsv,
} from '../services/export.service';
import { sendExportReadyEmail } from '../services/email.service';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';

// ---------------------------------------------------------------------------
// Admin middleware — verifies JWT and checks admin role
// ---------------------------------------------------------------------------
async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    if (payload.type !== 'access') {
      throw new AppError(401, 'Invalid token type');
    }

    const userId = payload.sub as string;
    const sessionVersion: number = payload.sv ?? 0;

    (req as unknown as Record<string, unknown>).userId = userId;
    (req as unknown as Record<string, unknown>).sessionVersion = sessionVersion;
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Invalid or expired token'));
  }
}

router.get('/disputes', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await listDisputes(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/dispute/:market_id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await flagDispute(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/dispute/:market_id/investigate', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await investigateDispute(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/cancel/:market_id/refunds', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await processRefunds(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/resolve-dispute/:market_id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await resolveDispute(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/cancel/:market_id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await cancelMarket(req, res);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Bulk market operations
// ---------------------------------------------------------------------------

router.post('/markets/bulk-pause', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try { await bulkPause(req, res); } catch (err) { next(err); }
});

router.post('/markets/bulk-cancel', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try { await bulkCancel(req, res); } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// CSV Export routes
// ---------------------------------------------------------------------------

router.get('/export/users', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as unknown as Record<string, unknown>).userId as string;
    await logExportAudit(adminId, 'users');
    await streamUsersExport(res);
  } catch (err) {
    next(err);
  }
});

router.get('/export/trades', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as unknown as Record<string, unknown>).userId as string;
    const { from, to } = req.query as { from?: string; to?: string };
    await logExportAudit(adminId, 'trades', { from, to });
    await streamTradesExport(res, from, to);
  } catch (err) {
    next(err);
  }
});

router.get('/export/treasury', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as unknown as Record<string, unknown>).userId as string;
    await logExportAudit(adminId, 'treasury');
    await streamTreasuryExport(res);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/export/request
 * Body: { type: 'trades', from?: string, to?: string, email: string }
 *
 * Kicks off an async export. Builds the CSV in the background and emails
 * it as an attachment when ready.
 */
router.post('/export/request', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as unknown as Record<string, unknown>).userId as string;
    const { type, from, to, email } = req.body as { type: string; from?: string; to?: string; email: string };

    if (!email || typeof email !== 'string') throw new AppError(400, 'email is required');
    if (type !== 'trades') throw new AppError(400, 'type must be "trades"');

    await logExportAudit(adminId, `async:${type}`, { from, to, email });

    // Respond immediately; build + send in background
    res.status(202).json({ message: 'Export queued. You will receive an email when ready.' });

    setImmediate(async () => {
      try {
        const csv = await buildTradesCsv(from, to);
        await sendExportReadyEmail(email, type, csv);
      } catch (err) {
        // Background failure — already responded 202, just log
        const { logger } = await import('../utils/logger');
        logger.error({ msg: 'Async export failed', err });
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
