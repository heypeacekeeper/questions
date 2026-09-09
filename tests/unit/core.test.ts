import { describe, expect, it } from 'vitest';
import { isSeasonalCategoryActive, isWithinWindow } from '@/application/category-service';
import { hasErrors, validateContent } from '@/application/content-validation';
import { pickNextUnseen } from '@/application/question-service';
import { validateContact, validateSubmission } from '@/application/submission-service';
import { buildAppEnv } from '@/config/env';
import { SEASONAL_WINDOWS } from '@/config/site';
import { isSitemapEligible } from '@/config/site-static.mjs';
import { toGameQuestion, type Question } from '@/domain/question';
import type { CategoryWithCount } from '@/domain/category';
import { paginate } from '@/domain/site';
import { DEMO_QUESTIONS, LAUNCH_CATEGORIES } from '@/infrastructure/mock/fixtures';
import {
  createDefaultMockDataset,
  MockCategoryRepository,
  MockQuestionRepository,
} from '@/infrastructure/mock/repositories';
import { mapCategory, mapQuestion } from '@/infrastructure/supabase/mappers';
import { IsolateRateLimiter } from '@/infrastructure/rate-limit/rate-limiter';
import { normalizePath } from '@/lib/performance-path';
import { normalizeForComparison, questionPairFingerprint } from '@/lib/text';
import {
  formatGeneratedPercent,
  GameEngine,
  generatedDisplayResult,
  SessionSeenStore,
} from '@/scripts/game-engine';

describe('pagination', () => {
  it('continues numbering', () => {
    const items = Array.from({ length: 120 }, (_, index) => index);
    expect(paginate(items, 2, 50)).toMatchObject({
      startIndex: 51,
      endIndex: 100,
      totalPages: 3,
    });
    expect(paginate(items, 3, 50).items).toHaveLength(20);
  });

  it('uses one page for empty lists', () => {
    expect(paginate([], 1, 50).totalPages).toBe(1);
  });
});

describe('randomization', () => {
  it('never selects an already seen id', () => {
    const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const seen = new Set<string>();
    for (let index = 0; index < 3; index += 1) {
      const question = pickNextUnseen(pool, seen);
      expect(question).not.toBeNull();
      seen.add(question!.id);
    }
    expect(pickNextUnseen(pool, seen)).toBeNull();
  });
});

describe('seasonal windows', () => {
  it('handles normal and wrapping windows', () => {
    expect(
      isWithinWindow(
        new Date('2026-10-15T00:00:00Z'),
        { month: 9, day: 1 },
        { month: 10, day: 31 },
      ),
    ).toBe(true);
    expect(
      isWithinWindow(
        new Date('2026-01-05T00:00:00Z'),
        { month: 12, day: 1 },
        { month: 2, day: 28 },
      ),
    ).toBe(true);
    expect(
      isWithinWindow(
        new Date('2026-06-05T00:00:00Z'),
        { month: 12, day: 1 },
        { month: 2, day: 28 },
      ),
    ).toBe(false);
  });

  it('uses configured category windows', () => {
    expect(
      isSeasonalCategoryActive(
        { slug: 'halloween', seasonalStart: null, seasonalEnd: null },
        new Date('2026-10-01T00:00:00Z'),
        SEASONAL_WINDOWS,
      ),
    ).toBe(true);
  });
});

describe('form validation', () => {
  const env = {
    turnstileToken: 'x'.repeat(20),
    website: '',
    renderedAt: Date.now() - 10000,
  };

  it('validates question submissions', () => {
    expect(
      validateSubmission({
        optionA: 'fly',
        optionB: 'Fly!',
        categoryId: LAUNCH_CATEGORIES[0]!.id,
        agree: true,
        ...env,
      }).ok,
    ).toBe(false);
    expect(
      validateSubmission({
        optionA: 'fly',
        optionB: 'swim',
        categoryId: LAUNCH_CATEGORIES[0]!.id,
        agree: true,
        ...env,
      }).ok,
    ).toBe(true);
  });

  it('validates contact forms', () => {
    expect(
      validateContact({
        name: 'A',
        email: 'bad',
        subject: 'Hi there',
        message: 'x'.repeat(20),
        privacy: true,
        ...env,
      }).ok,
    ).toBe(false);
    expect(
      validateContact({
        name: 'A',
        email: 'a@b.co',
        subject: 'Hi there',
        message: 'x'.repeat(20),
        privacy: true,
        ...env,
      }).ok,
    ).toBe(true);
  });
});

describe('content helpers', () => {
  it('detects reversed duplicate questions', () => {
    expect(questionPairFingerprint('Sweat maple syrup', 'sneeze glitter!')).toBe(
      questionPairFingerprint('Sneeze glitter', 'sweat maple syrup'),
    );
  });

  it('strips the question lead-in', () => {
    expect(normalizeForComparison('Would you rather Fly?')).toBe('fly');
  });

  it('validates fixture content and share lookup', async () => {
    const data = createDefaultMockDataset(20);
    const categories = await new MockCategoryRepository(data).getAllCategories();
    const questions = await new MockQuestionRepository(data).getAllQuestions();
    expect(
      hasErrors(validateContent(categories, questions, { allowDemoContent: true })),
    ).toBe(false);
    expect(
      (await new MockQuestionRepository(data).getQuestionByShareCode('demq22a'))?.id,
    ).toBe(DEMO_QUESTIONS[0]!.id);
  });
});

describe('supabase mapping and environment', () => {
  it('maps content rows', () => {
    expect(
      mapQuestion(
        {
          id: 'x',
          option_a: 'a',
          option_b: 'b',
          status: 'published',
          share_code: 'abcdefg',
          sort_order: 1,
          display_vote_count: 3248,
          is_demo: false,
          created_at: 't',
          updated_at: 't',
          published_at: 't',
        },
        ['c'],
      ).categoryIds,
    ).toEqual(['c']);
    expect(
      mapCategory({
        id: 'c',
        name: 'N',
        slug: 's',
        canonical_path: '/s/',
        h1: 'H',
        seo_title: 'T',
        meta_description: 'D',
        introduction: '',
        short_description: 'S',
        icon: '🎲',
        status: 'published',
        nav_featured: true,
        include_in_mixed_game: true,
        requires_age_gate: false,
        is_child_safe: true,
        is_mature: false,
        seasonal_start: null,
        seasonal_end: null,
        sort_order: 1,
        created_at: 't',
        updated_at: 't',
      }).canonicalPath,
    ).toBe('/s/');
  });

  it('keeps build environment and sitemap safeguards', () => {
    expect(isSitemapEligible('https://x.org/s/abc/')).toBe(false);
    expect(() =>
      buildAppEnv({ DATA_PROVIDER: 'supabase' }, { mode: 'production' }),
    ).toThrow();
  });
});

describe('client-only game helpers', () => {
  it('normalizes Windows and POSIX asset paths', () => {
    expect(normalizePath('dist\\client\\_astro\\game.js')).toBe(
      'dist/client/_astro/game.js',
    );
    expect(normalizePath('dist/client/_astro/game.js')).toBe(
      'dist/client/_astro/game.js',
    );
  });

  it('keeps seen question ids in session storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } as unknown as Storage;
    const seen = new SessionSeenStore('game:seen', storage);

    seen.add('first');
    seen.add('second');
    expect([...seen.get()]).toEqual(['first', 'second']);
    seen.clear();
    expect(seen.get()).toEqual(new Set());
  });
});

describe('isolate rate limiter', () => {
  it('blocks requests over the limit and allows them after the window', async () => {
    const realDateNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;

    try {
      const limiter = new IsolateRateLimiter();

      expect(await limiter.allow('client-a', 2, 60)).toBe(true);
      expect(await limiter.allow('client-a', 2, 60)).toBe(true);
      expect(await limiter.allow('client-a', 2, 60)).toBe(false);

      now += 60_001;

      expect(await limiter.allow('client-a', 2, 60)).toBe(true);
    } finally {
      Date.now = realDateNow;
    }
  });

  it('tracks different client keys independently', async () => {
    const limiter = new IsolateRateLimiter();

    expect(await limiter.allow('client-a', 1, 60)).toBe(true);
    expect(await limiter.allow('client-a', 1, 60)).toBe(false);
    expect(await limiter.allow('client-b', 1, 60)).toBe(true);
  });
});

describe('game engine pack loading', () => {
  it('retries a pack after a temporary fetch failure', async () => {
    let attempts = 0;
    const engine = new GameEngine(
      new SessionSeenStore('retry-seen', null),
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary failure');
        return [
          {
            id: 'question-1',
            a: 'Option A',
            b: 'Option B',
            s: 'retry01',
            d: 100,
          },
        ];
      },
      1,
      () => 0,
    );

    await engine.useSet({
      slug: 'retry',
      name: 'Retry',
      icon: '🎲',
      requiresAgeGate: false,
      total: 1,
      packs: ['/game-data/retry/pack-01.json'],
    });

    expect(attempts).toBe(1);

    const question = await engine.next(null);

    expect(attempts).toBe(2);
    expect(question?.id).toBe('question-1');
  });
  it('avoids repeats and restarts after all questions are seen', async () => {
    const engine = new GameEngine(
      new SessionSeenStore('repeat-seen', null),
      async () => [
        { id: 'question-1', a: 'A1', b: 'B1', s: 'repeat1', d: 100 },
        { id: 'question-2', a: 'A2', b: 'B2', s: 'repeat2', d: 200 },
      ],
      1,
      () => 0,
    );

    await engine.useSet({
      slug: 'repeat',
      name: 'Repeat',
      icon: '🎲',
      requiresAgeGate: false,
      total: 2,
      packs: ['/game-data/repeat/pack-01.json'],
    });

    const first = await engine.next(null);
    const second = await engine.next(first?.id ?? null);
    const restarted = await engine.next(second?.id ?? null);

    expect(first?.id).toBe('question-1');
    expect(second?.id).toBe('question-2');
    expect(restarted?.id).toBe('question-1');
  });

  it('returns null when a pack only contains the current question', async () => {
    const engine = new GameEngine(
      new SessionSeenStore('single-seen', null),
      async () => [
        { id: 'only-question', a: 'Option A', b: 'Option B', s: 'only001', d: 100 },
      ],
      1,
      () => 0,
    );

    await engine.useSet({
      slug: 'single',
      name: 'Single',
      icon: '🎲',
      requiresAgeGate: false,
      total: 1,
      packs: ['/game-data/single/pack-01.json'],
    });

    const question = await engine.next(null);
    expect(question?.id).toBe('only-question');

    expect(await engine.next(question?.id ?? null)).toBeNull();
  });
});

describe('generated display results', () => {
  it('is deterministic and uses complementary in-range percentages', () => {
    const first = generatedDisplayResult('question-stable-id');
    const second = generatedDisplayResult('question-stable-id');

    expect(first).toEqual(second);
    expect(first.percentA).toBeGreaterThanOrEqual(25);
    expect(first.percentA).toBeLessThanOrEqual(75);
    expect(first.percentB).toBeGreaterThanOrEqual(25);
    expect(first.percentB).toBeLessThanOrEqual(75);
    expect(first.percentA * 10 + first.percentB * 10).toBe(1000);
  });

  it('formats every displayed percentage with one decimal place', () => {
    const result = generatedDisplayResult('format-id');
    expect(formatGeneratedPercent(result.percentA)).toMatch(/^\d+\.\d%$/);
    expect(formatGeneratedPercent(result.percentB)).toMatch(/^\d+\.\d%$/);
  });

  it('produces more than one split across several question ids', () => {
    const splits = new Set(
      ['question-a', 'question-b', 'question-c', 'question-d', 'question-e'].map(
        (id) => formatGeneratedPercent(generatedDisplayResult(id).percentA),
      ),
    );
    expect(splits.size).toBeGreaterThan(1);
  });

  it('does not regenerate results when the selection changes from A to B', () => {
    const resultsShownForSelections = ['A', 'B'].map(() =>
      generatedDisplayResult('same-question-id'),
    );
    expect(resultsShownForSelections[0]).toEqual(resultsShownForSelections[1]);
  });

  it('ships the owner-managed display count in compact game data', () => {
    expect(toGameQuestion(DEMO_QUESTIONS[0]!).d).toBe(
      DEMO_QUESTIONS[0]!.displayVoteCount,
    );
  });
});

describe('display vote count validation', () => {
  const questionId = 'display-count-validation-question';
  const categoriesWithNoPublishedQuestions: readonly CategoryWithCount[] =
    LAUNCH_CATEGORIES.map((category) => ({
      ...category,
      publishedQuestionCount: 0,
    }));
  const questionWithCount = (displayVoteCount: number): Question => ({
    ...DEMO_QUESTIONS[0]!,
    id: questionId,
    shareCode: 'counttest',
    status: 'draft',
    categoryIds: [],
    displayVoteCount,
  });
  const issuesFor = (displayVoteCount: number) =>
    validateContent(
      categoriesWithNoPublishedQuestions,
      [questionWithCount(displayVoteCount)],
      { allowDemoContent: true },
    );
  const displayCountIssues = (displayVoteCount: number) =>
    issuesFor(displayVoteCount).filter(
      (issue) => issue.code === 'QUESTION_INVALID_DISPLAY_VOTE_COUNT',
    );

  it('accepts a finite non-negative integer and zero', () => {
    expect(displayCountIssues(3248)).toHaveLength(0);
    expect(displayCountIssues(0)).toHaveLength(0);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid display count %s with the question id and error code',
    (displayVoteCount) => {
      const issues = displayCountIssues(displayVoteCount);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        code: 'QUESTION_INVALID_DISPLAY_VOTE_COUNT',
        records: [questionId],
      });
    },
  );
});
