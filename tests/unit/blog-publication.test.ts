import { describe, expect, it } from 'vitest';
import { isBlogPostPublished } from '@/lib/blog-publication';

describe('blog publication policy', () => {
  const now = new Date('2026-09-22T12:00:00.000Z');

  it('publishes a non-draft article whose publication date has passed', () => {
    expect(
      isBlogPostPublished(
        {
          draft: false,
          publishedAt: new Date('2026-09-21T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('publishes a non-draft article at its publication time', () => {
    expect(
      isBlogPostPublished(
        {
          draft: false,
          publishedAt: new Date('2026-09-22T12:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('excludes draft articles even when their publication date has passed', () => {
    expect(
      isBlogPostPublished(
        {
          draft: true,
          publishedAt: new Date('2026-09-21T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('excludes future-dated articles even when draft is false', () => {
    expect(
      isBlogPostPublished(
        {
          draft: false,
          publishedAt: new Date('2026-09-23T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });
});
