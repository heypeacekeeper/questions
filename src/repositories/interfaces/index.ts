/**
 * Provider-independent repository and service interfaces (the "ports").
 *
 * Adapters live in `src/infrastructure/*`. UI, services, and game code depend
 * only on these interfaces and the domain types.
 */
import type { Category, CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import type { VoteChoice, VoteResult } from '@/domain/vote';
import type { ContactMessage, QuestionSubmission, StoredContactMessage, StoredQuestionSubmission } from '@/domain/forms';

// ---------------------------------------------------------------------------
// Content (read at build time)
// ---------------------------------------------------------------------------

export interface QuestionRepository {
  /** All published questions, ordered by sort_order then created_at. */
  getPublishedQuestions(): Promise<readonly Question[]>;
  /** Published questions that belong to the given category id. */
  getQuestionsByCategory(categoryId: string): Promise<readonly Question[]>;
  /** Any status — share routes must handle archived questions gracefully. */
  getQuestionByShareCode(shareCode: string): Promise<Question | null>;
  /** Published questions for a category, paged. */
  getPaginatedQuestions(categoryId: string, page: number, pageSize: number): Promise<readonly Question[]>;
  /** Published questions eligible for the given category's game (same as by-category, kept explicit). */
  getQuestionsForGamePack(categoryId: string): Promise<readonly Question[]>;
  /** Every question regardless of status (content validation, exports). */
  getAllQuestions(): Promise<readonly Question[]>;
}

export interface CategoryRepository {
  /** Published categories with counts (may include zero-count categories; services filter). */
  getPublishedCategories(): Promise<readonly CategoryWithCount[]>;
  getCategoryByPath(canonicalPath: string): Promise<CategoryWithCount | null>;
  getCategoryBySlug(slug: string): Promise<CategoryWithCount | null>;
  /** Published categories flagged nav_featured, ordered. */
  getNavigationCategories(): Promise<readonly CategoryWithCount[]>;
  /** Published categories that have a seasonal window (config or record). */
  getSeasonalCategories(): Promise<readonly CategoryWithCount[]>;
  /** Every category regardless of status (validation, forms). */
  getAllCategories(): Promise<readonly CategoryWithCount[]>;
}

// ---------------------------------------------------------------------------
// Mutations (Worker runtime)
// ---------------------------------------------------------------------------

export type VoteSubmitOutcome =
  | { readonly kind: 'ok'; readonly result: VoteResult }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'not_published' }
  | { readonly kind: 'error'; readonly message: string };

export interface VoteRepository {
  /** Atomically increment the selected aggregate total and return current totals. */
  submitVote(questionId: string, choice: VoteChoice): Promise<VoteSubmitOutcome>;
  /** Current aggregate totals without voting (used sparingly, e.g. tests). */
  getVoteResult(questionId: string): Promise<VoteResult | null>;
}

export type WriteOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export interface SubmissionRepository {
  createSubmission(submission: QuestionSubmission, fingerprint: string): Promise<WriteOutcome<StoredQuestionSubmission>>;
  /** Category must be published to accept a submission for it. */
  isCategoryAcceptingSubmissions(categoryId: string): Promise<boolean>;
}

export interface ContactRepository {
  createMessage(message: ContactMessage, fingerprint: string): Promise<WriteOutcome<StoredContactMessage>>;
}

// ---------------------------------------------------------------------------
// Cross-cutting services
// ---------------------------------------------------------------------------

export interface HumanVerificationInput {
  readonly token: string;
  readonly expectedAction: string;
  readonly expectedHostname: string;
  /** Hashed/opaque client identifier; never a raw IP. May be undefined. */
  readonly remoteIdentifier?: string;
}

export type HumanVerificationOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'invalid' | 'expired' | 'duplicate' | 'hostname' | 'action' | 'network' | 'misconfigured' };

export interface HumanVerificationService {
  verify(input: HumanVerificationInput): Promise<HumanVerificationOutcome>;
}

export interface RateLimiter {
  /** Returns true when the request is allowed. */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export type AnalyticsEventName =
  | 'vote_submitted'
  | 'vote_failed'
  | 'question_advanced'
  | 'pack_changed'
  | 'share_clicked'
  | 'form_submitted'
  | 'form_failed'
  | 'js_error'
  | 'web_vital'
  | 'api_timing';

export interface AnalyticsProvider {
  readonly id: string;
  /** Whether the provider requires explicit analytics consent before loading. */
  readonly requiresConsent: boolean;
  /** Called client-side once consent (if required) is granted. */
  load(): void;
  /** Must never receive personal data or full question text. */
  track(event: AnalyticsEventName, params?: Record<string, string | number | boolean>): void;
}

/** Convenience bundle returned by the composition root. */
export interface ContentRepositories {
  readonly questions: QuestionRepository;
  readonly categories: CategoryRepository;
}

export interface MutationRepositories {
  readonly votes: VoteRepository;
  readonly submissions: SubmissionRepository;
  readonly contact: ContactRepository;
  readonly categories: CategoryRepository;
}

export type { Category, CategoryWithCount, Question, VoteChoice, VoteResult };
