/**
 * Supabase implementations of the repository ports.
 *
 * Content repositories load the full (small) content graph once per process
 * and answer every query from memory. This keeps the build fast, deterministic
 * and — critically — makes any Supabase failure surface immediately as a
 * thrown error so the build fails instead of shipping partial data.
 */
import type { Category, CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import type { ContactMessage, QuestionSubmission, StoredContactMessage, StoredQuestionSubmission } from '@/domain/forms';
import type {
  CategoryRepository,
  ContactRepository,
  QuestionRepository,
  SubmissionRepository,
  WriteOutcome,
} from '@/repositories/interfaces';
import { SEASONAL_WINDOWS } from '@/config/site';
import type { TypedSupabaseClient } from './client';
import type { CategoryRow, QuestionCategoryRow, QuestionRow } from './database.types';
import { mapCategoryWithCount, mapQuestion } from './mappers';

export class SupabaseContentError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(`Supabase content request failed: ${message}`);
    this.name = 'SupabaseContentError';
  }
}

interface ContentGraph {
  categories: CategoryWithCount[];
  questions: Question[];
}

const PAGE_SIZE = 1000;

async function fetchAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new SupabaseContentError(error.message, error);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

/** Loads categories, questions and relationships. Throws on any failure. */
export async function loadContentGraph(client: TypedSupabaseClient): Promise<ContentGraph> {
  const [categoryRows, questionRows, linkRows] = await Promise.all([
    fetchAll<CategoryRow>((from, to) => client.from('categories').select('*').order('sort_order').order('name').range(from, to)),
    fetchAll<QuestionRow>((from, to) => client.from('questions').select('*').order('sort_order').order('created_at').range(from, to)),
    fetchAll<QuestionCategoryRow>((from, to) => client.from('question_categories').select('*').range(from, to)),
  ]);

  const linksByQuestion = new Map<string, string[]>();
  for (const link of linkRows) {
    const arr = linksByQuestion.get(link.question_id) ?? [];
    arr.push(link.category_id);
    linksByQuestion.set(link.question_id, arr);
  }

  const questions = questionRows.map((row) => mapQuestion(row, linksByQuestion.get(row.id) ?? []));

  const publishedCounts = new Map<string, number>();
  for (const q of questions) {
    if (q.status !== 'published') continue;
    for (const c of q.categoryIds) publishedCounts.set(c, (publishedCounts.get(c) ?? 0) + 1);
  }
  const categories = categoryRows.map((row) => mapCategoryWithCount(row, publishedCounts.get(row.id) ?? 0));

  return { categories, questions };
}

export class SupabaseQuestionRepository implements QuestionRepository {
  constructor(private readonly graph: () => Promise<ContentGraph>) {}
  async getAllQuestions(): Promise<readonly Question[]> {
    return (await this.graph()).questions;
  }
  async getPublishedQuestions(): Promise<readonly Question[]> {
    return (await this.graph()).questions.filter((q) => q.status === 'published');
  }
  async getQuestionsByCategory(categoryId: string): Promise<readonly Question[]> {
    return (await this.getPublishedQuestions()).filter((q) => q.categoryIds.includes(categoryId));
  }
  async getQuestionByShareCode(shareCode: string): Promise<Question | null> {
    return (await this.graph()).questions.find((q) => q.shareCode === shareCode) ?? null;
  }

}

export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly graph: () => Promise<ContentGraph>) {}
  async getAllCategories(): Promise<readonly CategoryWithCount[]> {
    return (await this.graph()).categories;
  }
  async getPublishedCategories(): Promise<readonly CategoryWithCount[]> {
    return (await this.graph()).categories.filter((c) => c.status === 'published');
  }
  async getNavigationCategories(): Promise<readonly CategoryWithCount[]> {
    return (await this.getPublishedCategories()).filter((c) => c.navFeatured);
  }
  async getSeasonalCategories(): Promise<readonly CategoryWithCount[]> {
    const slugs = new Set(SEASONAL_WINDOWS.map((w) => w.slug));
    return (await this.getPublishedCategories()).filter((c) => slugs.has(c.slug) || (c.seasonalStart && c.seasonalEnd));
  }
}

const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';
const PG_FK_VIOLATION = '23503';

export class SupabaseSubmissionRepository implements SubmissionRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async isCategoryAcceptingSubmissions(categoryId: string): Promise<boolean> {
    const { data, error } = await this.client.from('categories').select('id').eq('id', categoryId).eq('status', 'published').maybeSingle();
    return !error && Boolean(data);
  }

  async createSubmission(submission: QuestionSubmission, fingerprint: string): Promise<WriteOutcome<StoredQuestionSubmission>> {
    const { data, error } = await this.client
      .from('question_submissions')
      .insert({
        option_a: submission.optionA,
        option_b: submission.optionB,
        category_id: submission.categoryId,
        submitter_name: submission.submitterName,
        submitter_email: submission.submitterEmail,
        agreed_to_terms: true,
        fingerprint,
      })
      .select('id, status, created_at')
      .single();
    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) return { kind: 'duplicate' };
      if (error.code === PG_CHECK_VIOLATION || error.code === PG_FK_VIOLATION) return { kind: 'invalid', message: 'constraint' };
      return { kind: 'error', message: error.message };
    }
    return {
      kind: 'ok',
      value: { ...submission, id: data.id, status: data.status, fingerprint, createdAt: data.created_at },
    };
  }
}

export class SupabaseContactRepository implements ContactRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async createMessage(message: ContactMessage, fingerprint: string): Promise<WriteOutcome<StoredContactMessage>> {
    const { data, error } = await this.client
      .from('contact_messages')
      .insert({ name: message.name, email: message.email, subject: message.subject, message: message.message, fingerprint })
      .select('id, created_at')
      .single();
    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) return { kind: 'duplicate' };
      if (error.code === PG_CHECK_VIOLATION) return { kind: 'invalid', message: 'constraint' };
      return { kind: 'error', message: error.message };
    }
    return { kind: 'ok', value: { ...message, id: data.id, createdAt: data.created_at } };
  }
}

export type { Category };
