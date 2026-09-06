/**
 * Rate limiting adapters.
 *
 * Cloudflare Workers are stateless across isolates, so a purely in-memory
 * limiter is best-effort per isolate. That is acceptable as a secondary
 * defence behind Turnstile + DB unique constraints. When a Cloudflare Rate
 * Limiting binding (`ratelimits` in wrangler.jsonc) is configured, use
 * `CloudflareBindingRateLimiter` for a global limit instead.
 */
import type { RateLimiter } from '@/repositories/interfaces';

interface CloudflareRateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export class CloudflareBindingRateLimiter implements RateLimiter {
  constructor(private readonly binding: CloudflareRateLimitBinding) {}
  async allow(key: string): Promise<boolean> {
    try {
      const { success } = await this.binding.limit({ key });
      return success;
    } catch {
      return true; // fail open — limiter outage must not break the site
    }
  }
}

/** Isolate-local sliding window. */
export class IsolateRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxKeys = 5000;

  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > this.maxKeys) {
      // Cheap eviction: drop the oldest inserted key.
      const first = this.hits.keys().next().value;
      if (first !== undefined) this.hits.delete(first);
    }
    return arr.length <= limit;
  }
}

/** Shared per-isolate instance for Worker endpoints. */
export const isolateRateLimiter = new IsolateRateLimiter();

export function createRateLimiter(binding: unknown): RateLimiter {
  if (binding && typeof (binding as CloudflareRateLimitBinding).limit === 'function') {
    return new CloudflareBindingRateLimiter(binding as CloudflareRateLimitBinding);
  }
  return isolateRateLimiter;
}
