/**
 * In-memory mock repositories. Enabled only with DATA_PROVIDER=mock. Used for
 * local development and tests. Never a silent production fallback.
 */
import type { Category, CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import { buildVoteResult, type VoteChoice, type VoteResult } from '@/domain/vote';
import type { ContactMessage, QuestionSubmission, StoredContactMessage, StoredQuestionSubmission } from '@/domain/forms';
import type {
  CategoryRepository,
  ContactRepository,
  HumanVerificationService,
  QuestionRepository,
  RateLimiter,
  SubmissionRepository,
  VoteRepository,
  VoteSubmitOutcome,
  WriteOutcome,
} from '@/repositories/interfaces';
import { SEASONAL_WINDOWS } from '@/config/site';
import { ALL_CATEGORIES, DEMO_QUESTIONS, generateMockFillerQuestions } from './fixtures';

export interface MockDataset {
  categories: readonly Category[];
  questions: readonly Question[];
}

export function createDefaultMockDataset(fillerCount = 130): MockDataset {
  return {
    categories: ALL_CATEGORIES,
    questions: [...DEMO_QUESTIONS, ...generateMockFillerQuestions(fillerCount)],
  };
}

function withCounts(categories: readonly Category[], questions: readonly Question[]): CategoryWithCount[] {
  return categories.map((c) => ({
    ...c,
    publishedQuestionCount: questions.filter((q) => q.status === 'published' && q.categoryIds.includes(c.id)).length,
  }));
}

export class MockQuestionRepository implements QuestionRepository {
  constructor(private readonly data: MockDataset) {}
  async getAllQuestions(): Promise<readonly Question[]> {
    return this.data.questions;
  }
  async getPublishedQuestions(): Promise<readonly Question[]> {
    return this.data.questions.filter((q) => q.status === 'published');
  }
  async getQuestionsByCategory(categoryId: string): Promise<readonly Question[]> {
    return (await this.getPublishedQuestions()).filter((q) => q.categoryIds.includes(categoryId));
  }
  async getQuestionByShareCode(shareCode: string): Promise<Question | null> {
    return this.data.questions.find((q) => q.shareCode === shareCode) ?? null;
  }
  async getPaginatedQuestions(categoryId: string, page: number, pageSize: number): Promise<readonly Question[]> {
    const all = await this.getQuestionsByCategory(categoryId);
    const start = (Math.max(1, page) - 1) * pageSize;
    return all.slice(start, start + pageSize);
  }
  async getQuestionsForGamePack(categoryId: string): Promise<readonly Question[]> {
    return this.getQuestionsByCategory(categoryId);
  }
}

export class MockCategoryRepository implements CategoryRepository {
  constructor(private readonly data: MockDataset) {}
  private all(): CategoryWithCount[] {
    return withCounts(this.data.categories, this.data.questions);
  }
  async getAllCategories(): Promise<readonly CategoryWithCount[]> {
    return this.all();
  }
  async getPublishedCategories(): Promise<readonly CategoryWithCount[]> {
    return this.all().filter((c) => c.status === 'published');
  }
  async getCategoryByPath(canonicalPath: string): Promise<CategoryWithCount | null> {
    return this.all().find((c) => c.canonicalPath === canonicalPath) ?? null;
  }
  async getCategoryBySlug(slug: string): Promise<CategoryWithCount | null> {
    return this.all().find((c) => c.slug === slug) ?? null;
  }
  async getNavigationCategories(): Promise<readonly CategoryWithCount[]> {
    return (await this.getPublishedCategories()).filter((c) => c.navFeatured);
  }
  async getSeasonalCategories(): Promise<readonly CategoryWithCount[]> {
    const seasonalSlugs = new Set(SEASONAL_WINDOWS.map((w) => w.slug));
    return (await this.getPublishedCategories()).filter((c) => seasonalSlugs.has(c.slug) || (c.seasonalStart && c.seasonalEnd));
  }
}

/** In-memory vote store with the same semantics as the SQL `cast_vote` function. */
export class MockVoteRepository implements VoteRepository {
  private readonly votes = new Map<string, Map<string, VoteChoice>>(); // questionId → voterHash → choice
  constructor(private readonly data: MockDataset) {}

  async submitVote(questionId: string, choice: VoteChoice, voterHash: string): Promise<VoteSubmitOutcome> {
    const q = this.data.questions.find((x) => x.id === questionId);
    if (!q) return { kind: 'not_found' };
    if (q.status !== 'published') return { kind: 'not_published' };
    let byVoter = this.votes.get(questionId);
    if (!byVoter) {
      byVoter = new Map();
      this.votes.set(questionId, byVoter);
    }
    const existing = byVoter.get(voterHash);
    const accepted = existing === undefined;
    if (accepted) byVoter.set(voterHash, choice);
    const result = this.totals(questionId, existing ?? choice, accepted);
    return { kind: 'ok', result };
  }

  async getVoteResult(questionId: string, voterHash: string | null): Promise<VoteResult | null> {
    const q = this.data.questions.find((x) => x.id === questionId);
    if (!q) return null;
    const existing = voterHash ? this.votes.get(questionId)?.get(voterHash) : undefined;
    return this.totals(questionId, existing ?? 'A', false);
  }

  private totals(questionId: string, yourChoice: VoteChoice, accepted: boolean): VoteResult {
    let votesA = 0;
    let votesB = 0;
    for (const c of this.votes.get(questionId)?.values() ?? []) {
      if (c === 'A') votesA++;
      else votesB++;
    }
    return buildVoteResult(questionId, { votesA, votesB }, yourChoice, accepted);
  }
}

export class MockSubmissionRepository implements SubmissionRepository {
  readonly stored: StoredQuestionSubmission[] = [];
  constructor(private readonly data: MockDataset) {}
  async isCategoryAcceptingSubmissions(categoryId: string): Promise<boolean> {
    return this.data.categories.some((c) => c.id === categoryId && c.status === 'published');
  }
  async createSubmission(submission: QuestionSubmission, fingerprint: string): Promise<WriteOutcome<StoredQuestionSubmission>> {
    if (this.stored.some((s) => s.fingerprint === fingerprint)) return { kind: 'duplicate' };
    const value: StoredQuestionSubmission = {
      ...submission,
      id: crypto.randomUUID(),
      status: 'pending',
      fingerprint,
      createdAt: new Date().toISOString(),
    };
    this.stored.push(value);
    return { kind: 'ok', value };
  }
}

export class MockContactRepository implements ContactRepository {
  readonly stored: (StoredContactMessage & { fingerprint: string })[] = [];
  async createMessage(message: ContactMessage, fingerprint: string): Promise<WriteOutcome<StoredContactMessage>> {
    if (this.stored.some((s) => s.fingerprint === fingerprint)) return { kind: 'duplicate' };
    const value = { ...message, id: crypto.randomUUID(), createdAt: new Date().toISOString(), fingerprint };
    this.stored.push(value);
    return { kind: 'ok', value };
  }
}

/** Always-pass verifier for local development/tests (mirrors Turnstile test keys). */
export class AlwaysPassHumanVerification implements HumanVerificationService {
  async verify(): Promise<{ ok: true }> {
    return { ok: true };
  }
}

/** Simple fixed-window in-memory limiter. Per-isolate only — fine for mock/tests. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}
  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const t = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      this.buckets.set(key, { count: 1, resetAt: t + windowSeconds * 1000 });
      return true;
    }
    bucket.count++;
    return bucket.count <= limit;
  }
}
