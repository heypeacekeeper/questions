import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES } from '@/infrastructure/mock/fixtures';

const EXPECTED_SLUGS = [
  'for-kids',
  'for-teens',
  'for-adults',
  'for-couples',
  'for-friends',
  'for-family',
  'for-work',
  'icebreakers',
  'funny',
  'hard',
  'deep',
  'weird',
  'crazy',
  'extreme',
  'gross',
  'scary',
  'spicy',
  'dirty',
  'food',
  'animals',
  'spring',
  'summer',
  'fall',
  'winter',
  'halloween',
  'christmas',
  'valentines',
] as const;

describe('category catalog', () => {
  it('contains exactly the approved 27 categories', () => {
    expect(
      [...ALL_CATEGORIES]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((category) => category.slug),
    ).toEqual(EXPECTED_SLUGS);
  });

  it('uses unique slugs, ids, paths and sort orders', () => {
    expect(new Set(ALL_CATEGORIES.map((category) => category.slug)).size).toBe(27);
    expect(new Set(ALL_CATEGORIES.map((category) => category.id)).size).toBe(27);
    expect(new Set(ALL_CATEGORIES.map((category) => category.canonicalPath)).size).toBe(27);
    expect(new Set(ALL_CATEGORIES.map((category) => category.sortOrder)).size).toBe(27);
  });

  it('keeps adult categories separate from child-safe categories', () => {
    for (const slug of ['spicy', 'dirty']) {
      expect(ALL_CATEGORIES.find((category) => category.slug === slug)).toMatchObject({
        isMature: true,
        requiresAgeGate: true,
        isChildSafe: false,
      });
    }

    for (const slug of ['for-kids', 'animals', 'spring']) {
      expect(ALL_CATEGORIES.find((category) => category.slug === slug)?.isChildSafe).toBe(true);
    }
  });
});
