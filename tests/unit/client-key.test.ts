import { describe, expect, it } from 'vitest';
import { clientKey } from '@/lib/client-key';

const SECRET_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f70819a2b3c4d5e6f7081';
const SECRET_B = 'b1c2d3e4f5a60718293a4b5c6d7e8f901a2b3c4d5e6f70819a2b3c4d5e6f7081';

function request(ip?: string, forwardedFor?: string): Request {
  const headers = new Headers();

  if (ip) headers.set('cf-connecting-ip', ip);
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);

  return new Request('https://wouldyouratherquestions.org/api/contact', {
    headers,
  });
}

describe('rate-limit client keys', () => {
  it('generates a deterministic opaque key', async () => {
    const first = await clientKey(request('203.0.113.10'), 'contact', SECRET_A);
    const repeated = await clientKey(request('203.0.113.10'), 'contact', SECRET_A);

    expect(first).toBe(repeated);
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(first).not.toContain('203.0.113.10');
    expect(first).not.toContain(SECRET_A);
  });

  it('separates different client IP addresses', async () => {
    const first = await clientKey(request('203.0.113.10'), 'contact', SECRET_A);
    const second = await clientKey(request('203.0.113.11'), 'contact', SECRET_A);

    expect(first).not.toBe(second);
  });

  it('separates contact and submission buckets', async () => {
    const contact = await clientKey(request('203.0.113.10'), 'contact', SECRET_A);
    const submission = await clientKey(request('203.0.113.10'), 'submit', SECRET_A);

    expect(contact).not.toBe(submission);
  });

  it('changes keys when the secret rotates', async () => {
    const beforeRotation = await clientKey(request('203.0.113.10'), 'contact', SECRET_A);
    const afterRotation = await clientKey(request('203.0.113.10'), 'contact', SECRET_B);

    expect(beforeRotation).not.toBe(afterRotation);
  });

  it('does not trust X-Forwarded-For without CF-Connecting-IP', async () => {
    const first = await clientKey(request(undefined, '198.51.100.10'), 'contact', SECRET_A);
    const second = await clientKey(request(undefined, '198.51.100.11'), 'contact', SECRET_A);

    expect(first).toBe(second);
  });

  it('uses CF-Connecting-IP instead of X-Forwarded-For', async () => {
    const first = await clientKey(request('203.0.113.10', '198.51.100.10'), 'contact', SECRET_A);
    const second = await clientKey(request('203.0.113.10', '198.51.100.11'), 'contact', SECRET_A);

    expect(first).toBe(second);
  });

  it('rejects a missing HMAC secret', async () => {
    await expect(clientKey(request('203.0.113.10'), 'contact', '')).rejects.toThrow(
      /HMAC secret is required/,
    );
  });
});
