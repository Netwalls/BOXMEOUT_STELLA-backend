// ============================================================
// BOXMEOUT — Email Service
// Handles email sending for verification, password reset, etc.
// ============================================================

import { logger } from '../utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends an email via configured provider (stub for now).
 * In production, integrate with SendGrid, AWS SES, or similar.
 *
 * Returns true on success, false on failure.
 * Never throws — logs errors instead.
 */
export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  try {
    // TODO: Integrate with actual email provider (SendGrid, AWS SES, etc.)
    // For now, just log the email
    logger.info({
      message: 'Email sent',
      to: opts.to,
      subject: opts.subject,
    });
    return true;
  } catch (err) {
    logger.error({
      message: 'Failed to send email',
      to: opts.to,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Sends a verification email with a token link.
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  verifyUrl: string,
): Promise<boolean> {
  const link = `${verifyUrl}?token=${token}`;
  const html = `
    <h2>Verify Your Email</h2>
    <p>Click the link below to verify your email address:</p>
    <a href="${link}">Verify Email</a>
    <p>This link expires in 24 hours.</p>
    <p>If you didn't create this account, ignore this email.</p>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify Your BOXMEOUT Email',
    html,
  });
}

/**
 * Sends a resend verification email.
 */
export async function sendResendVerificationEmail(
  email: string,
  token: string,
  verifyUrl: string,
): Promise<boolean> {
  const link = `${verifyUrl}?token=${token}`;
  const html = `
    <h2>Verify Your Email</h2>
    <p>Here's your new verification link:</p>
    <a href="${link}">Verify Email</a>
    <p>This link expires in 24 hours.</p>
  `;

  return sendEmail({
    to: email,
    subject: 'BOXMEOUT Email Verification - New Link',
    html,
  });
}
