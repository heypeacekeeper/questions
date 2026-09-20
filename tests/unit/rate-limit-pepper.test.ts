import { describe, expect, it } from 'vitest';
import {
  buildAppEnv,
  DEVELOPMENT_RATE_LIMIT_PEPPER,
  RATE_LIMIT_PEPPER_MIN_LENGTH,
} from '@/config/env';

const productionWorkerEnv = {
  DATA_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SECRET_KEY: 'test-supabase-secret',
  PUBLIC_TURNSTILE_SITE_KEY: 'production-site-key',
  TURNSTILE_SECRET_KEY: 'production-secret-key',
};

describe('rate-limit pepper environment safety', () => {
  it('requires the pepper in a production Supabase Worker', () => {
    expect(() =>
      buildAppEnv(productionWorkerEnv, {
        mode: 'production',
        context: 'worker',
      }),
    ).toThrow(/RATE_LIMIT_PEPPER is required/);
  });

  it('rejects a short production pepper', () => {
    expect(() =>
      buildAppEnv(
        {
          ...productionWorkerEnv,
          RATE_LIMIT_PEPPER: 'x'.repeat(RATE_LIMIT_PEPPER_MIN_LENGTH - 1),
        },
        { mode: 'production', context: 'worker' },
      ),
    ).toThrow(/RATE_LIMIT_PEPPER must be at least 32 characters/);
  });

  it('rejects the shared development fallback in production', () => {
    expect(() =>
      buildAppEnv(
        {
          ...productionWorkerEnv,
          RATE_LIMIT_PEPPER: DEVELOPMENT_RATE_LIMIT_PEPPER,
        },
        { mode: 'production', context: 'worker' },
      ),
    ).toThrow(/must not use the shared development value/);
  });

  it('accepts a strong production pepper', () => {
    const env = buildAppEnv(
      {
        ...productionWorkerEnv,
        RATE_LIMIT_PEPPER: 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f70819a2b3c4d5e6f7081',
      },
      { mode: 'production', context: 'worker' },
    );

    expect(env.rateLimitPepper).toHaveLength(64);
  });

  it('does not require a production secret for local mock development', () => {
    const env = buildAppEnv({ DATA_PROVIDER: 'mock' }, { mode: 'development', context: 'worker' });

    expect(env.rateLimitPepper).toBeUndefined();
  });
});
