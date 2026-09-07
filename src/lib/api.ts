/** Shared helpers for the on-demand API endpoints (Worker runtime). */
import type { APIContext } from 'astro';
import { workerBindings } from '@/lib/worker-env';
import { sha256Hex } from '@/lib/crypto';

export const NO_STORE = { 'cache-control': 'no-store, max-age=0', 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' } as const;

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, ...extra } });
}
export function fail(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, message, ...extra }, status);
}

/** POST-only, JSON content type, same-origin, bounded body. Returns parsed body or an error Response. */
export async function readJsonBody(ctx: APIContext, maxBytes: number): Promise<{ body: unknown } | { error: Response }> {
  const { request } = ctx;
  if (request.method !== 'POST') return { error: fail(405, 'Method not allowed') };
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().startsWith('application/json')) return { error: fail(415, 'Unsupported content type') };
  const origin = request.headers.get('origin');
  const site = new URL(request.url).origin;
  const allowed = new Set([site, workerBindings().PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? site]);
  if (origin && !allowed.has(origin)) return { error: fail(403, 'Forbidden origin') };
  if (!origin) {
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return { error: fail(403, 'Forbidden') };
  }
  const len = Number(request.headers.get('content-length') ?? '0');
  if (len > maxBytes) return { error: fail(413, 'Request too large') };
  const text = await request.text();
  if (text.length > maxBytes) return { error: fail(413, 'Request too large') };
  try { return { body: JSON.parse(text) }; } catch { return { error: fail(400, 'Invalid JSON') }; }
}

/** Opaque per-client key for rate limiting: hashed CF connecting IP (never stored raw), or a fallback. */
export async function clientKey(request: Request, pepper: string): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return (await sha256Hex(`${pepper}|${ip}`)).slice(0, 32);
}
