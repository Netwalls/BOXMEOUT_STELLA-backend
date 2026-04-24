import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { AppError } from '../utils/AppError';
import { validateBody } from '../api/middleware/validate';

const router = Router();

// Stub auth middleware — replace with real JWT verification
function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or invalid Authorization header'));
  }
  // TODO: verify JWT and attach req.userId
  (req as any).userId = 'stub-user-id';
  next();
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const otpSchema = z.object({
  otp: z.string().min(1),
});

const verifySchema = z.object({
  tempToken: z.string().min(1),
  otp: z.string().min(1),
});

router.post('/login', validateBody(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/setup', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.setup2FA((req as any).userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/enable', requireAuth, validateBody(otpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.enable2FA((req as any).userId, req.body.otp);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/disable', requireAuth, validateBody(otpSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.disable2FA((req as any).userId, req.body.otp);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/verify', validateBody(verifySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.verify2FA(req.body.tempToken, req.body.otp);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
