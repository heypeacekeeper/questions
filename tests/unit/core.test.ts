import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { isSeasonalCategoryActive, isWithinWindow } from '@/application/category-service';
import { hasErrors, validateContent } from '@/application/content-validation';
import { pickNextUnseen, QuestionService } from '@/application/question-service';
import { validateContact, validateSubmission } from '@/application/submission-service';
import { buildAppEnv } from '@/config/env';
import { FORM_LIMITS, SEASONAL_WINDOWS } from '@/config/site';
import { isSitemapEligible } from '@/config/site-static.mjs';
import { toGameQuestion, type Question } from '@/domain/question';
import type { CategoryWithCount } from '@/domain/category';
import { paginate } from '@/domain/site';
import { DEMO_QUESTIONS, LAUNCH_CATEGORIES } from '@/infrastructure/mock/fixtures';
import {
  createDefaultMockDataset,
  MockCategoryRepository,
  MockContactRepository,
  MockQuestionRepository,
  MockSubmissionRepository,
} from '@/infrastructure/mock/repositories';
import { mapCategory, mapQuestion } from '@/infrastructure/supabase/mappers';
import {
  loadContentGraph,
  SupabaseContactRepository,
  SupabaseSubmissionRepository,
} from '@/infrastructure/supabase/repositories';
import { IsolateRateLimiter } from '@/infrastructure/rate-limit/rate-limiter';
import { readBoundedBody } from '@/lib/bounded-body';
import { normalizePath } from '@/lib/performance-path';
import { normalizeForComparison, questionPairFingerprint } from '@/lib/text';
import {
  formatGeneratedPercent,
  GameEngine,
  generatedDisplayResult,
  parseGameDataManifest,
  parsePackFilePayload,
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

describe('mixed game filtering', () => {
  it('excludes a question cross-listed in a mature or age-gated category', async () => {
    const data = createDefaultMockDataset(0);
    const categories = await new MockCategoryRepository(data).getAllCategories();
    const safe = categories.find(
      (category) =>
        category.includeInMixedGame &&
        category.isMature === false &&
        category.requiresAgeGate === false,
    );
    const restricted = categories.find((category) => category.isMature || category.requiresAgeGate);

    if (safe === undefined || restricted === undefined) {
      throw new Error('Expected safe and restricted fixture categories');
    }

    const crossListedQuestion = {
      ...DEMO_QUESTIONS[0]!,
      id: 'cross-listed-question',
      categoryIds: [safe.id, restricted.id],
    };
    const service = new QuestionService(
      new MockQuestionRepository({
        categories: data.categories,
        questions: [crossListedQuestion],
      }),
    );

    const mixed = await service.getMixedGameQuestions([safe], categories, () => 0);

    expect(mixed).toEqual([]);
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

  const duplicateQuestion = (
    id: string,
    shareCode: string,
    optionA: string,
    optionB: string,
  ): Question => ({
    ...DEMO_QUESTIONS[0]!,
    id,
    shareCode,
    optionA,
    optionB,
    status: 'published',
    categoryIds: [],
    isDemo: false,
  });

  const duplicateIssues = (...questions: Question[]) =>
    validateContent([], questions, { allowDemoContent: true }).filter((issue) =>
      ['QUESTION_DUPLICATE', 'QUESTION_REVERSED_DUPLICATE'].includes(issue.code),
    );

  it('reports a reversed duplicate pair', () => {
    const issues = duplicateIssues(
      duplicateQuestion('reverse-1', 'rev0001', 'Live on Mars', 'Live underwater'),
      duplicateQuestion('reverse-2', 'rev0002', 'Live underwater', 'Live on Mars'),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'QUESTION_REVERSED_DUPLICATE',
        records: ['reverse-1', 'reverse-2'],
      }),
    ]);
  });

  it('reports exact duplicates without calling them reversed', () => {
    const issues = duplicateIssues(
      duplicateQuestion('exact-1', 'exct001', 'Live on Mars', 'Live underwater'),
      duplicateQuestion('exact-2', 'exct002', 'Live on Mars', 'Live underwater'),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'QUESTION_DUPLICATE',
        records: ['exact-1', 'exact-2'],
      }),
    ]);
  });

  it('reports exact duplicates plus a third reversed record', () => {
    const issues = duplicateIssues(
      duplicateQuestion('mixed-1', 'mix0001', 'Live on Mars', 'Live underwater'),
      duplicateQuestion('mixed-2', 'mix0002', 'Live on Mars', 'Live underwater'),
      duplicateQuestion('mixed-3', 'mix0003', 'Live underwater', 'Live on Mars'),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'QUESTION_DUPLICATE',
          records: ['mixed-1', 'mixed-2'],
        }),
        expect.objectContaining({
          code: 'QUESTION_REVERSED_DUPLICATE',
          records: ['mixed-1', 'mixed-2', 'mixed-3'],
        }),
      ]),
    );
  });

  it('strips the question lead-in', () => {
    expect(normalizeForComparison('Would you rather Fly?')).toBe('fly');
  });

  it('validates fixture content and share lookup', async () => {
    const data = createDefaultMockDataset(20);
    const categories = await new MockCategoryRepository(data).getAllCategories();
    const questions = await new MockQuestionRepository(data).getAllQuestions();
    expect(hasErrors(validateContent(categories, questions, { allowDemoContent: true }))).toBe(
      false,
    );
    expect((await new MockQuestionRepository(data).getQuestionByShareCode('demq22a'))?.id).toBe(
      DEMO_QUESTIONS[0]!.id,
    );
  });
});

describe('supabase mapping and environment', () => {
  it('uses unique final ordering keys for paginated Supabase content', async () => {
    const orderCalls: Record<string, string[]> = {};

    const client = {
      from(table: string) {
        orderCalls[table] = [];

        const query = {
          select() {
            return query;
          },
          order(column: string) {
            orderCalls[table]!.push(column);
            return query;
          },
          async range() {
            return { data: [], error: null };
          },
        };

        return query;
      },
    };

    await loadContentGraph(client as never);

    expect(orderCalls).toEqual({
      categories: ['sort_order', 'name', 'id'],
      questions: ['sort_order', 'created_at', 'id'],
      question_categories: ['question_id', 'category_id'],
    });
  });

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
    expect(() => buildAppEnv({ DATA_PROVIDER: 'supabase' }, { mode: 'production' })).toThrow();
  });
});

describe('strict environment booleans', () => {
  it('rejects invalid boolean values instead of silently using defaults', () => {
    expect(() =>
      buildAppEnv(
        {
          DATA_PROVIDER: 'mock',
          FEATURE_ADS: 'treu',
        },
        { mode: 'development' },
      ),
    ).toThrow(/FEATURE_ADS must be a boolean value/);
  });

  it('accepts supported boolean spellings', () => {
    const result = buildAppEnv(
      {
        DATA_PROVIDER: 'mock',
        FEATURE_ADS: 'yes',
        FEATURE_GA4: '0',
        PUBLIC_ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456',
      },
      { mode: 'development' },
    );

    expect(result.features.FEATURE_ADS).toBe(true);
    expect(result.features.FEATURE_GA4).toBe(false);
  });
});

describe('production Turnstile configuration', () => {
  const productionEnv = {
    DATA_PROVIDER: 'supabase',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SECRET_KEY: 'test-supabase-secret',
    PUBLIC_TURNSTILE_SITE_KEY: 'production-site-key',
    TURNSTILE_SECRET_KEY: 'production-secret-key',
  };

  it('rejects Cloudflare test sitekeys in production', () => {
    expect(() =>
      buildAppEnv(
        {
          ...productionEnv,
          PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        },
        { mode: 'production', context: 'worker' },
      ),
    ).toThrow(/PUBLIC_TURNSTILE_SITE_KEY must not use a Cloudflare test key/);
  });

  it('rejects Cloudflare test secrets in production', () => {
    expect(() =>
      buildAppEnv(
        {
          ...productionEnv,
          TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        },
        { mode: 'production', context: 'worker' },
      ),
    ).toThrow(/TURNSTILE_SECRET_KEY must not use a Cloudflare test key/);
  });

  it('allows non-test Turnstile keys in production', () => {
    expect(() =>
      buildAppEnv(productionEnv, { mode: 'production', context: 'worker' }),
    ).not.toThrow();
  });
});

describe('limited duplicate windows', () => {
  it('allows contact content again after the configured window', async () => {
    let now = Date.parse('2026-09-17T00:00:00.000Z');
    const repository = new MockContactRepository(() => now);
    const message = {
      name: 'Tester',
      email: 'tester@example.com',
      subject: 'A question',
      message: 'This is a sufficiently long contact message.',
    };

    expect((await repository.createMessage(message, 'contact-fingerprint')).kind).toBe('ok');
    expect((await repository.createMessage(message, 'contact-fingerprint')).kind).toBe('duplicate');

    now += FORM_LIMITS.contactDuplicateWindowSeconds * 1000 + 1;

    expect((await repository.createMessage(message, 'contact-fingerprint')).kind).toBe('ok');
  });

  it('allows a question pair again after the configured window', async () => {
    let now = Date.parse('2026-09-17T00:00:00.000Z');
    const data = createDefaultMockDataset(0);
    const repository = new MockSubmissionRepository(data, () => now);
    const submission = {
      optionA: 'Live on Mars',
      optionB: 'Live underwater',
      categoryId: LAUNCH_CATEGORIES[0]!.id,
      submitterName: null,
      submitterEmail: null,
      agreedToTerms: true as const,
    };

    expect((await repository.createSubmission(submission, 'submission-fingerprint')).kind).toBe(
      'ok',
    );
    expect((await repository.createSubmission(submission, 'submission-fingerprint')).kind).toBe(
      'duplicate',
    );

    now += FORM_LIMITS.submissionDuplicateWindowSeconds * 1000 + 1;

    expect((await repository.createSubmission(submission, 'submission-fingerprint')).kind).toBe(
      'ok',
    );
  });

  it('uses the contact RPC with the configured window', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: null, created_at: null, is_duplicate: true }],
      error: null,
    });

    const repository = new SupabaseContactRepository({ rpc } as never);
    const outcome = await repository.createMessage(
      {
        name: 'Tester',
        email: 'tester@example.com',
        subject: 'A question',
        message: 'This is a sufficiently long contact message.',
      },
      'a'.repeat(64),
    );

    expect(outcome).toEqual({ kind: 'duplicate' });
    expect(rpc).toHaveBeenCalledWith(
      'create_contact_message_limited',
      expect.objectContaining({
        p_duplicate_window_seconds: FORM_LIMITS.contactDuplicateWindowSeconds,
      }),
    );
  });

  it('uses the submission RPC with the configured window', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: null, status: null, created_at: null, is_duplicate: true }],
      error: null,
    });

    const repository = new SupabaseSubmissionRepository({ rpc } as never);
    const outcome = await repository.createSubmission(
      {
        optionA: 'Live on Mars',
        optionB: 'Live underwater',
        categoryId: LAUNCH_CATEGORIES[0]!.id,
        submitterName: null,
        submitterEmail: null,
        agreedToTerms: true,
      },
      'b'.repeat(64),
    );

    expect(outcome).toEqual({ kind: 'duplicate' });
    expect(rpc).toHaveBeenCalledWith(
      'create_question_submission_limited',
      expect.objectContaining({
        p_duplicate_window_seconds: FORM_LIMITS.submissionDuplicateWindowSeconds,
      }),
    );
  });

  it('keeps both RPC functions private and concurrency-safe', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/0006_limited_duplicate_windows.sql', import.meta.url),
      'utf8',
    );

    expect(migration.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(migration).toMatch(/revoke all on function public\.create_contact_message_limited/);
    expect(migration).toMatch(/revoke all on function public\.create_question_submission_limited/);
    expect(migration).toMatch(/grant execute[\s\S]*to service_role/);
  });
});

describe('secure share codes', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/0007_secure_share_codes.sql', import.meta.url),
    'utf8',
  );

  it('uses cryptographically secure bytes without modulo bias', () => {
    expect(migration).toMatch(/gen_random_bytes\(code_length \* 2\)/);
    expect(migration).toMatch(/byte_value < 248/);
    expect(migration).not.toMatch(/\brandom\s*\(/);
  });

  it('uses longer codes for new questions without changing existing codes', () => {
    expect(migration).toMatch(
      /alter column share_code[\s\S]*set default public\.generate_unique_share_code\(10, 16\)/,
    );
    expect(migration).not.toMatch(/update\s+public\.questions/i);
  });

  it('checks collisions and retries with a concurrency lock', () => {
    expect(migration).toMatch(/for attempt in 1\.\.max_attempts loop/);
    expect(migration).toMatch(/pg_advisory_xact_lock/);
    expect(migration).toMatch(/where question\.share_code = candidate/);
    expect(migration).toMatch(/Could not generate a unique share code/);
  });

  it('keeps both share-code functions unavailable to public roles', () => {
    expect(migration).toMatch(
      /revoke all on function public\.generate_share_code\(integer\)[\s\S]*from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.generate_unique_share_code\(integer, integer\)[\s\S]*from public, anon, authenticated/,
    );
  });
});

describe('personal-data retention', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/0008_personal_data_retention.sql', import.meta.url),
    'utf8',
  );
  const privacyPolicy = readFileSync(
    new URL('../../src/pages/privacy-policy/index.astro', import.meta.url),
    'utf8',
  );

  it('deletes expired contact messages and legacy votes', () => {
    expect(migration).toMatch(/contact_retention interval default interval '12 months'/);
    expect(migration).toMatch(
      /delete from public\.contact_messages[\s\S]*statement_timestamp\(\) - contact_retention/,
    );
    expect(migration).toMatch(/vote_retention interval default interval '90 days'/);
    expect(migration).toMatch(
      /delete from public\.votes[\s\S]*statement_timestamp\(\) - vote_retention/,
    );
  });

  it('anonymizes submission contact details without deleting submissions', () => {
    expect(migration).toMatch(
      /update public\.question_submissions[\s\S]*submitter_name = null[\s\S]*submitter_email = null/,
    );
    expect(migration).not.toMatch(/delete from public\.question_submissions/);
  });

  it('restricts cleanup execution to the service role', () => {
    expect(migration).toMatch(
      /revoke all on function public\.cleanup_expired_personal_data[\s\S]*from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.cleanup_expired_personal_data[\s\S]*to service_role/,
    );
  });

  it('schedules the cleanup function daily', () => {
    expect(migration).toMatch(/daily-personal-data-retention/);
    expect(migration).toMatch(/'17 3 \* \* \*'/);
    expect(migration).toMatch(/select public\.cleanup_expired_personal_data\(\)/);
  });

  it('discloses the retention periods in the privacy policy', () => {
    expect(privacyPolicy).toMatch(/deleted after 12[\s\S]*months/);
    expect(privacyPolicy).toMatch(/removed after 90 days/);
    expect(privacyPolicy).toMatch(/Legacy vote records[\s\S]*deleted after 90 days/);
  });
});

describe('bounded request bodies', () => {
  it('cancels an upload as soon as it exceeds the byte limit', async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 2) throw new Error('Body was read past the limit');
        controller.enqueue(new Uint8Array(6));
      },
      cancel() {
        cancelled = true;
      },
    });

    expect(await readBoundedBody(stream, 10)).toBeNull();
    expect(cancelled).toBe(true);
    expect(pulls).toBe(2);
  });
});

describe('client-only game helpers', () => {
  it('normalizes Windows and POSIX asset paths', () => {
    expect(normalizePath('dist\\client\\_astro\\game.js')).toBe('dist/client/_astro/game.js');
    expect(normalizePath('dist/client/_astro/game.js')).toBe('dist/client/_astro/game.js');
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

describe('Cloudflare rate-limit configuration', () => {
  it('matches the application form limits', () => {
    const source = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
    const binding = source.match(
      /"name"\s*:\s*"FORM_RATE_LIMITER"[\s\S]*?"simple"\s*:\s*\{\s*"limit"\s*:\s*(\d+)\s*,\s*"period"\s*:\s*(\d+)/,
    );

    expect(binding).not.toBeNull();
    expect({
      limit: Number(binding?.[1]),
      period: Number(binding?.[2]),
    }).toEqual({
      limit: FORM_LIMITS.rateLimitMaxRequests,
      period: FORM_LIMITS.rateLimitWindowSeconds,
    });
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

describe('game-data payload validation', () => {
  const validQuestion = {
    id: 'question-1',
    a: 'Option A',
    b: 'Option B',
    s: 'abc2345',
    d: 100,
  };

  it('accepts a valid pack and rejects malformed questions', () => {
    expect(
      parsePackFilePayload({
        v: 1,
        set: 'mixed',
        i: 0,
        n: 1,
        q: [validQuestion],
      }),
    ).toEqual([validQuestion]);

    expect(() =>
      parsePackFilePayload({
        v: 1,
        set: 'mixed',
        i: 0,
        n: 1,
        q: [{ ...validQuestion, id: '' }],
      }),
    ).toThrow(/Invalid question/);

    expect(() =>
      parsePackFilePayload({
        v: 2,
        set: 'mixed',
        i: 0,
        n: 1,
        q: [validQuestion],
      }),
    ).toThrow(/Invalid game-data pack metadata/);
  });

  it('rejects duplicate question ids inside a pack', () => {
    expect(() =>
      parsePackFilePayload({
        v: 1,
        set: 'mixed',
        i: 0,
        n: 1,
        q: [validQuestion, validQuestion],
      }),
    ).toThrow(/Invalid question/);
  });

  it('validates manifest metadata and pack URLs', () => {
    const validManifest = {
      version: 1,
      generatedAt: '2026-09-15T00:00:00.000Z',
      sets: {
        mixed: {
          slug: 'mixed',
          name: 'Mixed',
          icon: '🎲',
          requiresAgeGate: false,
          total: 1,
          packs: ['/game-data/mixed/pack-01.abcdef1234.json'],
        },
      },
    };

    expect(parseGameDataManifest(validManifest)).toEqual(validManifest);
    expect(
      parseGameDataManifest({
        ...validManifest,
        sets: {
          mixed: {
            ...validManifest.sets.mixed,
            packs: ['https://attacker.example/pack.json'],
          },
        },
      }),
    ).toBeNull();
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
      async () => [{ id: 'only-question', a: 'Option A', b: 'Option B', s: 'only001', d: 100 }],
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

describe('game category switching', () => {
  it('ignores an old pack download after switching categories', async () => {
    let resolveOld!: (
      questions: Array<{ id: string; a: string; b: string; s: string; d: number }>,
    ) => void;
    const engine = new GameEngine(
      new SessionSeenStore('race-seen', null),
      async (url) => {
        if (url === '/old-pack.json') {
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        }
        return [{ id: 'new-question', a: 'New A', b: 'New B', s: 'new0001', d: 10 }];
      },
      1,
      () => 0,
    );

    const oldLoad = engine.useSet({
      slug: 'old',
      name: 'Old',
      icon: '',
      requiresAgeGate: false,
      total: 1,
      packs: ['/old-pack.json'],
    });
    const newLoad = engine.useSet({
      slug: 'new',
      name: 'New',
      icon: '',
      requiresAgeGate: false,
      total: 1,
      packs: ['/new-pack.json'],
    });

    await newLoad;
    const current = await engine.next(null);
    expect(current?.id).toBe('new-question');

    resolveOld([{ id: 'old-question', a: 'Old A', b: 'Old B', s: 'old0001', d: 10 }]);
    await oldLoad;

    expect(await engine.next(current?.id ?? null)).toBeNull();
  });
});

describe('game background loading', () => {
  it('does not block an available question while prefetching', async () => {
    const calls: string[] = [];
    let finishPrefetch = () => {};
    const engine = new GameEngine(
      new SessionSeenStore('prefetch-seen', null),
      async (url) => {
        calls.push(url);
        if (url === '/pack-2.json') {
          return new Promise((resolve) => {
            finishPrefetch = () => resolve([{ id: 'q3', a: 'A3', b: 'B3', s: 'pref003', d: 30 }]);
          });
        }
        return [
          { id: 'q1', a: 'A1', b: 'B1', s: 'pref001', d: 10 },
          { id: 'q2', a: 'A2', b: 'B2', s: 'pref002', d: 20 },
        ];
      },
      2,
      () => 0,
    );

    await engine.useSet({
      slug: 'prefetch',
      name: 'Prefetch',
      icon: '',
      requiresAgeGate: false,
      total: 3,
      packs: ['/pack-1.json', '/pack-2.json'],
    });

    const first = await engine.next(null);
    expect(calls).toEqual(['/pack-1.json', '/pack-2.json']);

    const second = await engine.next(first?.id ?? null);
    expect(second?.id).toBe('q2');

    finishPrefetch();
    await engine.ensureSupply();
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
      ['question-a', 'question-b', 'question-c', 'question-d', 'question-e'].map((id) =>
        formatGeneratedPercent(generatedDisplayResult(id).percentA),
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
    expect(toGameQuestion(DEMO_QUESTIONS[0]!).d).toBe(DEMO_QUESTIONS[0]!.displayVoteCount);
  });
});

describe('display vote count validation', () => {
  const questionId = 'display-count-validation-question';
  const categoriesWithNoPublishedQuestions: readonly CategoryWithCount[] = LAUNCH_CATEGORIES.map(
    (category) => ({
      ...category,
      publishedQuestionCount: 0,
    }),
  );
  const questionWithCount = (displayVoteCount: number): Question => ({
    ...DEMO_QUESTIONS[0]!,
    id: questionId,
    shareCode: 'counttest',
    status: 'draft',
    categoryIds: [],
    displayVoteCount,
  });
  const issuesFor = (displayVoteCount: number) =>
    validateContent(categoriesWithNoPublishedQuestions, [questionWithCount(displayVoteCount)], {
      allowDemoContent: true,
    });
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
