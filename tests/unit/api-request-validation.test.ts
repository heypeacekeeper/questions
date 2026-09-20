import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/worker-env', () => ({
  workerBindings: () => ({
    PUBLIC_SITE_URL: 'https://wouldyouratherquestions.org',
  }),
}));

import { readJsonBody } from '@/lib/api';

const url = 'https://wouldyouratherquestions.org/api/contact/';

async function errorResponse(request: Request, maxBytes = 1024) {
  const result = await readJsonBody({ request } as Parameters<typeof readJsonBody>[0], maxBytes);

  if (!('error' in result)) {
    throw new Error('Expected request validation to fail');
  }

  expect(result.error.headers.get('cache-control')).toContain('no-store');
  expect(result.error.headers.get('content-type')).toContain('application/json');
  expect(result.error.headers.get('x-content-type-options')).toBe('nosniff');

  return result.error;
}

describe('API request validation', () => {
  it('rejects non-POST requests', async () => {
    const response = await errorResponse(new Request(url));
    expect(response.status).toBe(405);
  });

  it('rejects unsupported content types', async () => {
    const response = await errorResponse(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      }),
    );

    expect(response.status).toBe(415);
  });

  it('rejects malformed JSON', async () => {
    const response = await errorResponse(
      new Request(url, {
        method: 'POST',
        headers: {
          origin: 'https://wouldyouratherquestions.org',
          'content-type': 'application/json',
        },
        body: '{',
      }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects declared oversized bodies', async () => {
    const response = await errorResponse(
      new Request(url, {
        method: 'POST',
        headers: {
          origin: 'https://wouldyouratherquestions.org',
          'content-type': 'application/json',
          'content-length': '100',
        },
        body: '{}',
      }),
      10,
    );

    expect(response.status).toBe(413);
  });

  it('rejects foreign origins', async () => {
    const response = await errorResponse(
      new Request(url, {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    );

    expect(response.status).toBe(403);
  });

  it('rejects cross-site fetch metadata when Origin is absent', async () => {
    const response = await errorResponse(
      new Request(url, {
        method: 'POST',
        headers: {
          'sec-fetch-site': 'cross-site',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    );

    expect(response.status).toBe(403);
  });
});
