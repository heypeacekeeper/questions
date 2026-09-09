/** Security + cache headers for on-demand responses (API). Static assets get headers from public/_headers. */
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const res = await next();
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.headers.set('x-frame-options', 'DENY');
  // JSON-only endpoints: lock everything down. Pages get their CSP from public/_headers.
  if (new URL(ctx.request.url).pathname.startsWith('/api/')) {
    res.headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  }
  return res;
});
