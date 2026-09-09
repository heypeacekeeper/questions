/**
 * Cloudflare Turnstile server-side verification (Siteverify API).
 * Checks success, hostname, action, token errors, and network/timeouts.
 * The secret never leaves the Worker.
 */
import type {
  HumanVerificationInput,
  HumanVerificationOutcome,
  HumanVerificationService,
} from '@/repositories/interfaces';
import { TURNSTILE } from '@/config/site';

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export class TurnstileVerifier implements HumanVerificationService {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = 5000,
    private readonly endpoint: string = TURNSTILE.siteverifyUrl,
  ) {}

  async verify(input: HumanVerificationInput): Promise<HumanVerificationOutcome> {
    if (!this.secretKey) return { ok: false, reason: 'misconfigured' };
    if (!input.token || input.token.length > 2048) return { ok: false, reason: 'invalid' };

    const body = new URLSearchParams({ secret: this.secretKey, response: input.token });
    // Cloudflare accepts a remoteip hint; we never have a raw IP here by design.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let json: SiteverifyResponse;
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, reason: 'network' };
      json = (await res.json()) as SiteverifyResponse;
    } catch {
      return { ok: false, reason: 'network' };
    } finally {
      clearTimeout(timer);
    }

    if (!json.success) {
      const codes = json['error-codes'] ?? [];
      if (codes.includes('timeout-or-duplicate')) return { ok: false, reason: 'duplicate' };
      if (codes.includes('invalid-input-response')) return { ok: false, reason: 'invalid' };
      if (codes.includes('missing-input-secret') || codes.includes('invalid-input-secret'))
        return { ok: false, reason: 'misconfigured' };
      return { ok: false, reason: 'invalid' };
    }

    if (json.action !== input.expectedAction) return { ok: false, reason: 'action' };
    if (!hostnameMatches(json.hostname, input.expectedHostname))
      return { ok: false, reason: 'hostname' };

    // Tokens are valid for 5 minutes; reject stale ones defensively.
    if (json.challenge_ts) {
      const age = Date.now() - new Date(json.challenge_ts).getTime();
      if (Number.isFinite(age) && age > 5 * 60 * 1000) return { ok: false, reason: 'expired' };
    }

    return { ok: true };
  }
}

/** Cloudflare test keys report hostname "example.com"; accept that only when using them. */
export function hostnameMatches(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  if (a === e) return true;
  // Accept www/non-www variants of the same registrable domain.
  return a.replace(/^www\./, '') === e.replace(/^www\./, '');
}

/** Dev/test verifier: accepts anything when the documented test secret is configured. */
export function isTurnstileTestSecret(secret: string | undefined): boolean {
  return (
    secret === TURNSTILE.testSecretKey ||
    secret === '2x0000000000000000000000000000000AA' ||
    secret === '3x0000000000000000000000000000000AA'
  );
}
