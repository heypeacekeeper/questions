import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_RATE_LIMIT_PEPPER } from '@/config/env';
import { createMutationContext } from '@/repositories/factory';

const CUSTOM_PEPPER = 'c1d2e3f4a5b60718293a4b5c6d7e8f901a2b3c4d5e6f70819a2b3c4d5e6f7081';

describe('mutation context rate-limit pepper', () => {
  it('uses an explicitly configured pepper', () => {
    const context = createMutationContext({
      NODE_ENV: 'development',
      DATA_PROVIDER: 'mock',
      RATE_LIMIT_PEPPER: CUSTOM_PEPPER,
    });

    expect(context.rateLimitPepper).toBe(CUSTOM_PEPPER);
  });

  it('uses the deterministic fallback only in local mock development', () => {
    const context = createMutationContext({
      NODE_ENV: 'development',
      DATA_PROVIDER: 'mock',
      RATE_LIMIT_PEPPER: undefined,
    });

    expect(context.rateLimitPepper).toBe(DEVELOPMENT_RATE_LIMIT_PEPPER);
  });
});
