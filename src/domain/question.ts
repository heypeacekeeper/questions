/** Provider-independent question domain model. */

export type QuestionStatus = 'draft' | 'published' | 'archived';
export const QUESTION_STATUSES: readonly QuestionStatus[] = ['draft', 'published', 'archived'];

export interface Question {
  readonly id: string;
  readonly optionA: string;
  readonly optionB: string;
  readonly status: QuestionStatus;
  /** Permanent random short code used by /s/[code]/ */
  readonly shareCode: string;
  readonly sortOrder: number;
  /** Owner-editable static count shown in game results. */
  readonly displayVoteCount: number;
  /** Category ids this question belongs to (may be several). */
  readonly categoryIds: readonly string[];
  /** Demo fixtures are flagged so builds can refuse them in production. */
  readonly isDemo: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

/** Minimal shape shipped in static game-data chunks (no vote totals!). */
export interface GameQuestion {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly s: string; // shareCode
  readonly d: number; // displayVoteCount
}

export function toGameQuestion(q: Question): GameQuestion {
  return { id: q.id, a: q.optionA, b: q.optionB, s: q.shareCode, d: q.displayVoteCount };
}

export function isPublished(q: Pick<Question, 'status'>): boolean {
  return q.status === 'published';
}

/** Human-readable sentence used in lists and metadata. */
export function questionSentence(q: Pick<Question, 'optionA' | 'optionB'>): string {
  return `Would you rather ${q.optionA} or ${q.optionB}?`;
}
