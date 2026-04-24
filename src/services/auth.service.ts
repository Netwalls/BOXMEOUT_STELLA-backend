import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { encrypt, decrypt } from './crypto.service';
import { generateSecret, generateQRCode, verifyToken } from './totp.service';
import { sendVerificationEmail, sendResendVerificationEmail } from './email.service';
import { redis } from './cache.service';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN ?? '7d';
const TEMP_TOKEN_EXPIRES_IN = '5m';
const EMAIL_VERIFICATION_EXPIRES_IN = 24 * 60 * 60; // 24 hours in seconds
const VERIFY_EMAIL_URL = process.env.VERIFY_EMAIL_URL ?? 'http://localhost:3000/auth/verify-email';

// ---------------------------------------------------------------------------
// In-memory user store — replace with DB queries in production
// ---------------------------------------------------------------------------
interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  emailVerificationToken?: string; // UUID stored in Redis
  twoFactorSecret?: string;   // AES-GCM encrypted base32 secret
  twoFactorEnabled: boolean;
}

const users = new Map<string, UserRecord>();

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
function signAccess(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN } as jwt.SignOptions);
}

function signTemp(userId: string): string {
  return jwt.sign({ sub: userId, type: 'temp_2fa' }, JWT_SECRET, { expiresIn: TEMP_TOKEN_EXPIRES_IN } as jwt.SignOptions);
}

function verifyJwt(token: string, expectedType: string): jwt.JwtPayload {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  if (payload.type !== expectedType) throw new AppError(401, 'Invalid token type');
  return payload;
}

// ---------------------------------------------------------------------------
// Auth service
// ---------------------------------------------------------------------------

/**
 * Registers a new user and sends verification email.
 * User cannot trade or withdraw until email is verified.
 */
export async function register(
  email: string,
  password: string,
): Promise<{ userId: string; message: string }> {
  // Check if user already exists
  const existing = [...users.values()].find((u) => u.email === email);
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  // Create user
  const userId = randomUUID();
  const user: UserRecord = {
    id: userId,
    email,
    passwordHash: password, // TODO: hash with bcrypt
    emailVerified: false,
    twoFactorEnabled: false,
  };
  users.set(userId, user);

  // Generate verification token
  const token = await generateEmailVerificationToken(userId);

  // Send verification email
  const sent = await sendVerificationEmail(email, token, VERIFY_EMAIL_URL);
  if (!sent) {
    // Clean up user if email send fails
    users.delete(userId);
    throw new AppError(500, 'Failed to send verification email');
  }

  logger.info({ message: 'User registered', userId, email });

  return {
    userId,
    message: 'Registration successful. Please check your email to verify your account.',
  };
}

/** Stub login — replace with real password check against DB */
export async function login(
  email: string,
  _password: string,
): Promise<{ accessToken: string; refreshToken: string } | { requires2FA: true; tempToken: string }> {
  const user = [...users.values()].find((u) => u.email === email);
  if (!user) throw new AppError(401, 'Invalid credentials');

  // TODO: verify bcrypt hash against _password

  if (user.twoFactorEnabled) {
    return { requires2FA: true, tempToken: signTemp(user.id) };
  }

  return { accessToken: signAccess(user.id), refreshToken: signRefresh(user.id) };
}

/** Step 1: generate secret + QR code; does NOT enable 2FA yet */
export async function setup2FA(
  userId: string,
): Promise<{ qrCode: string; secret: string }> {
  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.twoFactorEnabled) throw new AppError(400, '2FA already enabled');

  const { secret, otpauthUrl } = generateSecret(user.email);
  // Store encrypted pending secret (not yet enabled)
  user.twoFactorSecret = encrypt(secret);
  users.set(userId, user);

  const qrCode = await generateQRCode(otpauthUrl);
  return { qrCode, secret };
}

/** Step 2: confirm OTP to activate 2FA */
export async function enable2FA(userId: string, otp: string): Promise<void> {
  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.twoFactorEnabled) throw new AppError(400, '2FA already enabled');
  if (!user.twoFactorSecret) throw new AppError(400, 'Run /auth/2fa/setup first');

  const secret = decrypt(user.twoFactorSecret);
  if (!verifyToken(secret, otp)) throw new AppError(401, 'Invalid or expired OTP');

  user.twoFactorEnabled = true;
  users.set(userId, user);
}

/** Disable 2FA — requires current OTP */
export async function disable2FA(userId: string, otp: string): Promise<void> {
  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (!user.twoFactorEnabled) throw new AppError(400, '2FA is not enabled');

  const secret = decrypt(user.twoFactorSecret!);
  if (!verifyToken(secret, otp)) throw new AppError(401, 'Invalid or expired OTP');

  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  users.set(userId, user);
}

/** Second-step login: verify OTP from temp token, issue final JWT pair */
export async function verify2FA(
  tempToken: string,
  otp: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = verifyJwt(tempToken, 'temp_2fa');
  const userId = payload.sub as string;

  const user = users.get(userId);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new AppError(401, 'Invalid session');
  }

  const secret = decrypt(user.twoFactorSecret);
  if (!verifyToken(secret, otp)) throw new AppError(401, 'Invalid or expired OTP');

  return { accessToken: signAccess(userId), refreshToken: signRefresh(userId) };
}

/**
 * Generates a signed email verification token (UUID) with 24h expiry.
 * Stores token in Redis with user email as value.
 * Returns the token.
 */
export async function generateEmailVerificationToken(userId: string): Promise<string> {
  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');

  const token = randomUUID();
  const redisKey = `email_verification:${token}`;

  // Store token → userId mapping in Redis with 24h expiry
  await redis.setex(redisKey, EMAIL_VERIFICATION_EXPIRES_IN, userId);

  // Also store token reference on user (for tracking)
  user.emailVerificationToken = token;
  users.set(userId, user);

  return token;
}

/**
 * Verifies an email verification token and marks user as verified.
 * Deletes token from Redis on success.
 * Throws AppError if token invalid or expired.
 */
export async function verifyEmailToken(token: string): Promise<void> {
  const redisKey = `email_verification:${token}`;
  const userId = await redis.get(redisKey);

  if (!userId) {
    throw new AppError(400, 'Invalid or expired verification token');
  }

  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');

  // Mark as verified
  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  users.set(userId, user);

  // Delete token from Redis
  await redis.del(redisKey);

  logger.info({ message: 'Email verified', userId, email: user.email });
}

/**
 * Generates a new verification token and sends verification email.
 * Rate-limited to 1 request per minute per email.
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  const user = [...users.values()].find((u) => u.email === email);
  if (!user) {
    // Don't leak whether email exists
    logger.info({ message: 'Resend verification requested for non-existent email', email });
    return;
  }

  if (user.emailVerified) {
    throw new AppError(400, 'Email already verified');
  }

  // Generate new token
  const token = await generateEmailVerificationToken(user.id);

  // Send email
  const sent = await sendResendVerificationEmail(email, token, VERIFY_EMAIL_URL);
  if (!sent) {
    throw new AppError(500, 'Failed to send verification email');
  }
}

/**
 * Checks if user is email verified.
 * Used by middleware to protect routes.
 */
export function isEmailVerified(userId: string): boolean {
  const user = users.get(userId);
  return user?.emailVerified ?? false;
}

/** Expose users map for testing only */
export { users };
