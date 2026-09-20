import { describe, expect, it, vi } from 'vitest';
import { TURNSTILE } from '@/config/site';
import { hostnameMatches, TurnstileVerifier } from '@/infrastructure/turnstile/turnstile-verifier';

const input = {
  token: 'valid-turnstile-token',
  expectedAction: 'contact',
  expectedHostname: 'wouldyouratherquestions.org',
};

function jsonFetch(body: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

describe('TurnstileVerifier', () => {
  it('fails closed when the secret is missing', async () => {
    const fetchImpl = jsonFetch({ success: true });
    const result = await new TurnstileVerifier('', fetchImpl).verify(input);

    expect(result).toEqual({ ok: false, reason: 'misconfigured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a valid response', async () => {
    const fetchImpl = jsonFetch({
      success: true,
      action: 'contact',
      hostname: 'wouldyouratherquestions.org',
      challenge_ts: new Date().toISOString(),
    });

    await expect(
      new TurnstileVerifier('production-secret', fetchImpl).verify(input),
    ).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledWith(
      TURNSTILE.siteverifyUrl,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects the wrong action', async () => {
    const fetchImpl = jsonFetch({
      success: true,
      action: 'submit_question',
      hostname: 'wouldyouratherquestions.org',
    });

    await expect(new TurnstileVerifier('secret', fetchImpl).verify(input)).resolves.toEqual({
      ok: false,
      reason: 'action',
    });
  });

  it('rejects the wrong hostname but accepts the www variant', async () => {
    expect(hostnameMatches('www.wouldyouratherquestions.org', 'wouldyouratherquestions.org')).toBe(
      true,
    );
    expect(hostnameMatches('attacker.example', 'wouldyouratherquestions.org')).toBe(false);

    const fetchImpl = jsonFetch({
      success: true,
      action: 'contact',
      hostname: 'attacker.example',
    });

    await expect(new TurnstileVerifier('secret', fetchImpl).verify(input)).resolves.toEqual({
      ok: false,
      reason: 'hostname',
    });
  });

  it('rejects expired challenges', async () => {
    const fetchImpl = jsonFetch({
      success: true,
      action: 'contact',
      hostname: 'wouldyouratherquestions.org',
      challenge_ts: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    });

    await expect(new TurnstileVerifier('secret', fetchImpl).verify(input)).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it.each([
    ['timeout-or-duplicate', 'duplicate'],
    ['invalid-input-response', 'invalid'],
    ['invalid-input-secret', 'misconfigured'],
  ] as const)('maps %s to %s', async (code, reason) => {
    const fetchImpl = jsonFetch({
      success: false,
      'error-codes': [code],
    });

    await expect(new TurnstileVerifier('secret', fetchImpl).verify(input)).resolves.toEqual({
      ok: false,
      reason,
    });
  });

  it('fails closed on HTTP, network, and malformed-JSON failures', async () => {
    const httpFailure = jsonFetch({}, 503);
    const networkFailure = vi.fn(async () => {
      throw new Error('network unavailable');
    }) as unknown as typeof fetch;
    const malformedJson = vi.fn(
      async () => new Response('not-json', { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(new TurnstileVerifier('secret', httpFailure).verify(input)).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
    await expect(new TurnstileVerifier('secret', networkFailure).verify(input)).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
    await expect(new TurnstileVerifier('secret', malformedJson).verify(input)).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('aborts timed-out verification requests', async () => {
    const hangingFetch = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;

    await expect(new TurnstileVerifier('secret', hangingFetch, 1).verify(input)).resolves.toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
