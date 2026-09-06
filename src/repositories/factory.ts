/**
 * Composition root. The ONLY place that decides which provider adapters back
 * the repository interfaces. Pages, services and endpoints call these helpers;
 * they never import `@/infrastructure/*` directly.
 *
 * Replacing Supabase = write a new adapter set + edit this file.
 */
import type { AppEnv } from '@/config/env';
import { getBuildEnv, getWorkerEnv, type RawEnv } from '@/config/env';
import { TURNSTILE } from '@/config/site';
import type {
  ContentRepositories,
  HumanVerificationService,
  MutationRepositories,
  RateLimiter,
} from '@/repositories/interfaces';
import { CategoryService } from '@/application/category-service';
import { QuestionService } from '@/application/question-service';

// --- Mock ------------------------------------------------------------------
import {
  AlwaysPassHumanVerification,
  InMemoryRateLimiter,
  MockCategoryRepository,
  MockContactRepository,
  MockQuestionRepository,
  MockSubmissionRepository,
  MockVoteRepository,
  createDefaultMockDataset,
  type MockDataset,
} from '@/infrastructure/mock/repositories';

// --- Supabase --------------------------------------------------------------
import { createBuildClient, createWorkerClient } from '@/infrastructure/supabase/client';
import {
  SupabaseCategoryRepository,
  SupabaseContactRepository,
  SupabaseQuestionRepository,
  SupabaseSubmissionRepository,
  SupabaseVoteRepository,
  SupabaseWorkerCategoryRepository,
  loadContentGraph,
} from '@/infrastructure/supabase/repositories';
import { TurnstileVerifier, isTurnstileTestSecret } from '@/infrastructure/turnstile/turnstile-verifier';
import { createRateLimiter } from '@/infrastructure/rate-limit/rate-limiter';

// ---------------------------------------------------------------------------
// Build-time content
// ---------------------------------------------------------------------------

export interface ContentContext extends ContentRepositories {
  readonly env: AppEnv;
  readonly questionService: QuestionService;
  readonly categoryService: CategoryService;
}

let contentContextPromise: Promise<ContentContext> | undefined;
let sharedMockDataset: MockDataset | undefined;

/** Shared mock dataset so build + Worker (dev) see the same ids. */
export function getMockDataset(): MockDataset {
  sharedMockDataset ??= createDefaultMockDataset();
  return sharedMockDataset;
}

export function createContentRepositories(env: AppEnv): ContentRepositories {
  if (env.dataProvider === 'mock') {
    const data = getMockDataset();
    return { questions: new MockQuestionRepository(data), categories: new MockCategoryRepository(data) };
  }
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error('Supabase content provider selected but SUPABASE_URL / SUPABASE_SECRET_KEY are missing.');
  }
  const client = createBuildClient(env.supabaseUrl, env.supabaseSecretKey);
  // Load once; every repository call reuses the same promise. Failure throws → build fails.
  let graph: ReturnType<typeof loadContentGraph> | undefined;
  const getGraph = () => (graph ??= loadContentGraph(client));
  return { questions: new SupabaseQuestionRepository(getGraph), categories: new SupabaseCategoryRepository(getGraph) };
}

/** Memoized build-time context used by every Astro page during prerendering. */
export function getContentContext(): Promise<ContentContext> {
  contentContextPromise ??= (async () => {
    const env = getBuildEnv();
    const repos = createContentRepositories(env);
    if (env.dataProvider === 'mock') {
      // Loud, unmissable notice: mock data is never a silent substitute.
      console.warn('\n⚠️  DATA_PROVIDER=mock — building with DEMO fixtures, not production content.\n');
    }
    return {
      env,
      ...repos,
      questionService: new QuestionService(repos.questions),
      categoryService: new CategoryService(repos.categories),
    };
  })();
  return contentContextPromise;
}

/** Tests only. */
export function __resetContentContext(): void {
  contentContextPromise = undefined;
  sharedMockDataset = undefined;
}

// ---------------------------------------------------------------------------
// Worker runtime (API endpoints)
// ---------------------------------------------------------------------------

export interface MutationContext extends MutationRepositories {
  readonly env: AppEnv;
  readonly verifier: HumanVerificationService;
  readonly rateLimiter: RateLimiter;
}

let mockMutationSingleton: MutationRepositories | undefined;

/**
 * - Real secret configured → real Siteverify call.
 * - Cloudflare documented test secret → always-pass (local/dev/test only).
 * - No secret in production → TurnstileVerifier reports 'misconfigured' (fails closed).
 * - No secret outside production → always-pass so local dev works without keys.
 */
export function selectVerifier(env: AppEnv): HumanVerificationService {
  const secret = env.turnstileSecretKey;
  if (secret && !isTurnstileTestSecret(secret)) return new TurnstileVerifier(secret);
  if (secret === TURNSTILE.testSecretKey || (secret && isTurnstileTestSecret(secret))) return new AlwaysPassHumanVerification();
  return env.isProduction ? new TurnstileVerifier('') : new AlwaysPassHumanVerification();
}

export function createMutationContext(bindings: RawEnv | undefined): MutationContext {
  const env = getWorkerEnv(bindings);
  const rateLimiter = createRateLimiter((bindings as Record<string, unknown> | undefined)?.FORM_RATE_LIMITER);

  const verifier: HumanVerificationService = selectVerifier(env);

  if (env.dataProvider === 'mock') {
    if (!mockMutationSingleton) {
      const data = getMockDataset();
      mockMutationSingleton = {
        votes: new MockVoteRepository(data),
        submissions: new MockSubmissionRepository(data),
        contact: new MockContactRepository(),
        categories: new MockCategoryRepository(data),
      };
    }
    return { env, ...mockMutationSingleton, verifier, rateLimiter: env.isProduction ? rateLimiter : new InMemoryRateLimiter() };
  }

  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error('Supabase mutation provider selected but SUPABASE_URL / SUPABASE_SECRET_KEY are missing.');
  }
  const client = createWorkerClient(env.supabaseUrl, env.supabaseSecretKey);
  return {
    env,
    votes: new SupabaseVoteRepository(client),
    submissions: new SupabaseSubmissionRepository(client),
    contact: new SupabaseContactRepository(client),
    categories: new SupabaseWorkerCategoryRepository(client),
    verifier,
    rateLimiter,
  };
}
