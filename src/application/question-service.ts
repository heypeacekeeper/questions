/**
 * Question business rules: publishing, category filtering, pagination,
 * randomization, share lookup. Provider-independent.
 */
import type { Question } from '@/domain/question';
import { isPublished } from '@/domain/question';
import type { CategoryWithCount } from '@/domain/category';
import { paginate, type PaginationResult } from '@/domain/site';
import type { QuestionRepository } from '@/repositories/interfaces';
import { PAGINATION, HOMEPAGE } from '@/config/site';
import { shuffle, seededRng, seedFromString, type Rng } from '@/lib/random';

export interface ShareLookup {
  readonly question: Question | null;
  /** 'ok' | 'archived' | 'unpublished' | 'missing' */
  readonly state: 'ok' | 'archived' | 'unpublished' | 'missing';
}

export class QuestionService {
  private readonly byCategory = new Map<string, readonly Question[]>();
  constructor(private readonly questions: QuestionRepository) {}

  async getPublished(): Promise<readonly Question[]> {
    return (await this.questions.getPublishedQuestions()).filter(isPublished).sort(byOrder);
  }

  async getForCategory(category: Pick<CategoryWithCount, 'id'>): Promise<readonly Question[]> {
    const cached = this.byCategory.get(category.id);
    if (cached) return cached;
    const questions = (await this.questions.getQuestionsByCategory(category.id)).filter(isPublished).sort(byOrder);
    this.byCategory.set(category.id, questions);
    return questions;
  }

  /** Paged questions for a category; page numbering continues across pages. */
  async getPage(category: Pick<CategoryWithCount, 'id'>, page: number, pageSize: number = PAGINATION.questionsPerPage): Promise<PaginationResult<Question>> {
    const all = await this.getForCategory(category);
    return paginate(all, page, pageSize);
  }

  /** Number of static pages a category needs (≥ 1). */
  static pageCount(totalQuestions: number, pageSize: number = PAGINATION.questionsPerPage): number {
    return Math.max(1, Math.ceil(totalQuestions / pageSize));
  }

  /** Compact homepage section: a stable "sample" of N published questions. */
  async getHomepageSample(category: Pick<CategoryWithCount, 'id' | 'slug'>, count: number = HOMEPAGE.questionsPerSection): Promise<readonly Question[]> {
    const all = await this.getForCategory(category);
    return all.slice(0, count);
  }

  /** Questions eligible for a category game, in a deterministic (build-seeded) random order. */
  async getGameQuestions(category: Pick<CategoryWithCount, 'id' | 'slug'>, rng?: Rng): Promise<readonly Question[]> {
    const all = (await this.questions.getQuestionsForGamePack(category.id)).filter(isPublished);
    return shuffle(all, rng ?? seededRng(seedFromString(`pack:${category.slug}`)));
  }

  /** Mixed game questions: union of the given categories, de-duplicated, shuffled. */
  async getMixedGameQuestions(categories: readonly Pick<CategoryWithCount, 'id' | 'slug'>[], rng?: Rng): Promise<readonly Question[]> {
    const seen = new Set<string>();
    const out: Question[] = [];
    for (const c of categories) {
      for (const q of await this.getForCategory(c)) {
        if (!seen.has(q.id)) {
          seen.add(q.id);
          out.push(q);
        }
      }
    }
    return shuffle(out, rng ?? seededRng(seedFromString('pack:mixed')));
  }

  async lookupShareCode(shareCode: string): Promise<ShareLookup> {
    const q = await this.questions.getQuestionByShareCode(shareCode);
    if (!q) return { question: null, state: 'missing' };
    if (q.status === 'published') return { question: q, state: 'ok' };
    if (q.status === 'archived') return { question: q, state: 'archived' };
    return { question: q, state: 'unpublished' };
  }

  /** Choose the primary (first, lowest sort order) visible category for a question. */
  static primaryCategory(question: Question, categories: readonly CategoryWithCount[]): CategoryWithCount | null {
    const matches = categories.filter((c) => question.categoryIds.includes(c.id));
    if (matches.length === 0) return null;
    return matches.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
  }
}

export function byOrder(a: Question, b: Question): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Randomization with session repeat prevention — pure, used by the client game engine and tests. */
export function pickNextUnseen<T extends { id: string }>(pool: readonly T[], seen: ReadonlySet<string>, rng: Rng = Math.random): T | null {
  const unseen = pool.filter((q) => !seen.has(q.id));
  if (unseen.length === 0) return null;
  return unseen[Math.floor(rng() * unseen.length)] ?? null;
}
