import { hmacSha256Hex } from '@/lib/crypto';

export type RateLimitScope = 'contact' | 'submit';

const CLIENT_KEY_VERSION = 'v1';
const CLIENT_KEY_HEX_LENGTH = 32;

/**
 * Derives an opaque rate-limit identifier without exposing the raw client IP.
 *
 * CF-Connecting-IP is authoritative in production. X-Forwarded-For is
 * intentionally ignored because it may be spoofed outside a trusted proxy.
 * Requests without a Cloudflare client IP share the conservative anonymous
 * rate-limit bucket.
 */
export async function clientKey(
  request: Request,
  scope: RateLimitScope,
  secret: string,
): Promise<string> {
  if (!secret) {
    throw new Error('A rate-limit HMAC secret is required.');
  }

  const connectingIp = request.headers.get('cf-connecting-ip')?.trim();
  const clientIdentifier = connectingIp ? `ip:${connectingIp}` : 'anonymous';
  const input = `rate-limit-client:${CLIENT_KEY_VERSION}\0${scope}\0${clientIdentifier}`;

  return (await hmacSha256Hex(secret, input)).slice(0, CLIENT_KEY_HEX_LENGTH);
}
