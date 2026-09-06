/**
 * Isomorphic crypto helpers using the Web Crypto API (available in Cloudflare
 * Workers and Node ≥ 20). No Node-only imports.
 */

const SHARE_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0/1/i/l/o to avoid confusion
export const SHARE_CODE_LENGTH = 7;
export const SHARE_CODE_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{6,12}$/;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Permanent random short share code. Independent of question text. */
export function generateShareCode(length: number = SHARE_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SHARE_CODE_ALPHABET[(bytes[i] ?? 0) % SHARE_CODE_ALPHABET.length];
  }
  return out;
}

/** Opaque random anonymous voter token for the HttpOnly cookie (base64url, 32 bytes). */
export function generateVoterToken(): string {
  return toBase64Url(randomBytes(32));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const b of view) out += b.toString(16).padStart(2, '0');
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

/** HMAC-SHA256 keyed with a server-only secret. Used before storing voter identifiers. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(signature);
}

/** Constant-time string comparison for equal-length hex strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Short non-cryptographic hash for content-addressed filenames (stable across builds). */
export async function contentHash(input: string, length: number): Promise<string> {
  return (await sha256Hex(input)).slice(0, length);
}
