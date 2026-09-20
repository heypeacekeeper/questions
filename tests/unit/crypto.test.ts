import { describe, expect, it } from 'vitest';
import { hmacSha256Hex } from '@/lib/crypto';

describe('HMAC-SHA-256 helper', () => {
  it('matches the published HMAC-SHA-256 test vector', async () => {
    await expect(hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')).resolves.toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  it('is deterministic and changes when the secret changes', async () => {
    const input = 'rate-limit:v1:contact:ip:203.0.113.10';

    const first = await hmacSha256Hex('a'.repeat(64), input);
    const repeated = await hmacSha256Hex('a'.repeat(64), input);
    const differentSecret = await hmacSha256Hex('b'.repeat(64), input);

    expect(first).toBe(repeated);
    expect(differentSecret).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain('203.0.113.10');
  });
});
