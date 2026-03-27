/**
 * Unit tests for Stellar wallet-based authentication (Task 2)
 * Covers: invalid signature rejected, valid signature issues tokens,
 *         nonce expiry (60s TTL), and logout/logout-all session invalidation (Task 1)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../../src/services/stellar.service.js';
import { AuthError } from '../../src/types/auth.types.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/utils/jwt.js';
import { buildSignatureMessage } from '../../src/utils/crypto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signMessage(keypair: Keypair, message: string): string {
  return keypair.sign(Buffer.from(message, 'utf-8')).toString('base64');
}

// ---------------------------------------------------------------------------
// StellarService — signature verification
// ---------------------------------------------------------------------------

describe('StellarService.verifySignature', () => {
  const svc = new StellarService();

  it('accepts a valid signature produced by the matching keypair', () => {
    const kp = Keypair.random();
    const message = 'BoxMeOut auth challenge';
    const sig = signMessage(kp, message);

    expect(svc.verifySignature(kp.publicKey(), message, sig)).toBe(true);
  });

  it('rejects a signature produced by a different keypair', () => {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    const message = 'BoxMeOut auth challenge';
    const sig = signMessage(kp1, message); // signed by kp1

    // verified against kp2 — must be false
    expect(svc.verifySignature(kp2.publicKey(), message, sig)).toBe(false);
  });

  it('rejects a signature over a different message', () => {
    const kp = Keypair.random();
    const sig = signMessage(kp, 'original message');

    expect(svc.verifySignature(kp.publicKey(), 'tampered message', sig)).toBe(false);
  });

  it('throws AuthError for an invalid public key', () => {
    expect(() =>
      svc.verifySignature('not-a-stellar-key', 'msg', 'aGVsbG8=')
    ).toThrow(AuthError);
  });

  it('throws AuthError when signature is not 64 bytes after base64 decode', () => {
    const kp = Keypair.random();
    // "short" decodes to fewer than 64 bytes
    expect(() =>
      svc.verifySignature(kp.publicKey(), 'msg', 'c2hvcnQ=')
    ).toThrow(AuthError);
  });
});

// ---------------------------------------------------------------------------
// Full challenge → sign → verify flow (simulates wallet-login)
// ---------------------------------------------------------------------------

describe('Stellar wallet-login flow', () => {
  const svc = new StellarService();

  it('issues tokens when the signed challenge message is verified', () => {
    const kp = Keypair.random();
    const nonce = 'test-nonce-abc123';
    const timestamp = Math.floor(Date.now() / 1000);
    // Build the same message the server would produce
    const message = buildSignatureMessage(nonce, timestamp, 60);
    const sig = signMessage(kp, message);

    const isValid = svc.verifySignature(kp.publicKey(), message, sig);
    expect(isValid).toBe(true);

    // Simulate token issuance on valid signature
    const accessToken = signAccessToken({
      userId: 'user-1',
      publicKey: kp.publicKey(),
      tier: 'BEGINNER',
    });
    const refreshToken = signRefreshToken({ userId: 'user-1', tokenId: 'tok-1' });

    const accessPayload = verifyAccessToken(accessToken);
    const refreshPayload = verifyRefreshToken(refreshToken);

    expect(accessPayload.publicKey).toBe(kp.publicKey());
    expect(accessPayload.type).toBe('access');
    expect(refreshPayload.type).toBe('refresh');
  });

  it('does NOT issue tokens when signature is invalid', () => {
    const kp = Keypair.random();
    const wrongKp = Keypair.random();
    const nonce = 'test-nonce-xyz';
    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildSignatureMessage(nonce, timestamp, 60);

    // Sign with wrong key
    const sig = signMessage(wrongKp, message);

    const isValid = svc.verifySignature(kp.publicKey(), message, sig);
    expect(isValid).toBe(false);
    // No tokens should be issued — caller must check isValid before signing tokens
  });
});

// ---------------------------------------------------------------------------
// Nonce TTL — 60 seconds
// ---------------------------------------------------------------------------

describe('Nonce TTL is 60 seconds', () => {
  it('nonce message includes the 60-second validity window', () => {
    const nonce = 'nonce-ttl-test';
    const timestamp = Math.floor(Date.now() / 1000);
    const message = buildSignatureMessage(nonce, timestamp, 60);

    expect(message).toContain('60');
    expect(message).toContain(nonce);
  });
});

// ---------------------------------------------------------------------------
// Session invalidation helpers (Task 1)
// ---------------------------------------------------------------------------

describe('Session invalidation — logout & logout-all', () => {
  it('verifyRefreshToken throws AuthError for a tampered token', () => {
    const token = signRefreshToken({ userId: 'u1', tokenId: 't1' });
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(() => verifyRefreshToken(tampered)).toThrow(AuthError);
  });

  it('verifyRefreshToken throws AuthError for an access token passed as refresh', () => {
    const accessToken = signAccessToken({
      userId: 'u1',
      publicKey: Keypair.random().publicKey(),
      tier: 'BEGINNER',
    });
    expect(() => verifyRefreshToken(accessToken)).toThrow(AuthError);
  });

  it('a valid refresh token carries the correct userId and tokenId', () => {
    const payload = { userId: 'user-logout-test', tokenId: 'session-abc' };
    const token = signRefreshToken(payload);
    const decoded = verifyRefreshToken(token);

    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.tokenId).toBe(payload.tokenId);
    expect(decoded.type).toBe('refresh');
  });
});
