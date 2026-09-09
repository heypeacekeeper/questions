/** In-memory mock repositories for local development and tests. */
import type { Category, CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import type {
  ContactMessage,
  QuestionSubmission,
  StoredContactMessage,
  StoredQuestionSubmission,
} from '@/domain/forms';
import type {
  CategoryRepository,
  ContactRepository,
  HumanVerificationService,
  QuestionRepository,
  RateLimiter,
  SubmissionRepository,
  WriteOutcome,
} from '@/repositories/interfaces';
import { SEASONAL_WINDOWS } from '@/config/site';
import {
  ALL_CATEGORIES,
  DEMO_QUESTIONS,
  generateMockFillerQuestions,
} from './fixtures';

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
function withCounts(
  categories: readonly Category[],
  questions: readonly Question[],
): CategoryWithCount[] {
  return categories.map((c) => ({
    ...c,
    publishedQuestionCount: questions.filter(
      (q) => q.status === 'published' && q.categoryIds.includes(c.id),
    ).length,
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
  async getQuestionsByCategory(
    categoryId: string,
  ): Promise<readonly Question[]> {
    return (await this.getPublishedQuestions()).filter((q) =>
      q.categoryIds.includes(categoryId),
    );
  }
  async getQuestionByShareCode(shareCode: string): Promise<Question | null> {
    return this.data.questions.find((q) => q.shareCode === shareCode) ?? null;
  }
  async getPaginatedQuestions(
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<readonly Question[]> {
    const all = await this.getQuestionsByCategory(categoryId);
    return all.slice(
      (Math.max(1, page) - 1) * pageSize,
      Math.max(1, page) * pageSize,
    );
  }
  async getQuestionsForGamePack(
    categoryId: string,
  ): Promise<readonly Question[]> {
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
  async getCategoryByPath(
    canonicalPath: string,
  ): Promise<CategoryWithCount | null> {
    return this.all().find((c) => c.canonicalPath === canonicalPath) ?? null;
  }
  async getCategoryBySlug(slug: string): Promise<CategoryWithCount | null> {
    return this.all().find((c) => c.slug === slug) ?? null;
  }
  async getNavigationCategories(): Promise<readonly CategoryWithCount[]> {
    return (await this.getPublishedCategories()).filter((c) => c.navFeatured);
  }
  async getSeasonalCategories(): Promise<readonly CategoryWithCount[]> {
    const slugs = new Set(SEASONAL_WINDOWS.map((w) => w.slug));
    return (await this.getPublishedCategories()).filter(
      (c) => slugs.has(c.slug) || (c.seasonalStart && c.seasonalEnd),
    );
  }
}

export class MockSubmissionRepository implements SubmissionRepository {
  readonly stored: StoredQuestionSubmission[] = [];
  constructor(private readonly data: MockDataset) {}
  async isCategoryAcceptingSubmissions(categoryId: string): Promise<boolean> {
    return this.data.categories.some(
      (c) => c.id === categoryId && c.status === 'published',
    );
  }
  async createSubmission(
    submission: QuestionSubmission,
    fingerprint: string,
  ): Promise<WriteOutcome<StoredQuestionSubmission>> {
    if (this.stored.some((s) => s.fingerprint === fingerprint))
      return { kind: 'duplicate' };
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
  async createMessage(
    message: ContactMessage,
    fingerprint: string,
  ): Promise<WriteOutcome<StoredContactMessage>> {
    if (this.stored.some((s) => s.fingerprint === fingerprint))
      return { kind: 'duplicate' };
    const value = {
      ...message,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      fingerprint,
    };
    this.stored.push(value);
    return { kind: 'ok', value };
  }
}
export class AlwaysPassHumanVerification implements HumanVerificationService {
  async verify(): Promise<{ ok: true }> {
    return { ok: true };
  }
}
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();
  constructor(private readonly now: () => number = Date.now) {}
  async allow(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }
}
