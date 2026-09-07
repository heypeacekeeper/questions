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

/** Short non-cryptographic hash for content-addressed filenames (stable across builds). */
export async function contentHash(input: string, length: number): Promise<string> {
  return (await sha256Hex(input)).slice(0, length);
}
