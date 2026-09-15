import type { GameQuestion } from '@/domain/question';
import { STORAGE_KEYS } from '@/config/site';

export const MAX_FAVORITES = 100;

interface FavoritesPayload {
  readonly v: 1;
  readonly questions: readonly GameQuestion[];
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

export function isFavoriteQuestion(value: unknown): value is GameQuestion {
  if (!value || typeof value !== 'object') return false;

  const question = value as Record<string, unknown>;

  return (
    isText(question.id, 128) &&
    isText(question.a, 200) &&
    isText(question.b, 200) &&
    isText(question.s, 64) &&
    typeof question.d === 'number' &&
    Number.isSafeInteger(question.d) &&
    question.d >= 0
  );
}

function normalizeQuestions(value: unknown): GameQuestion[] {
  if (!Array.isArray(value)) return [];

  const questions: GameQuestion[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!isFavoriteQuestion(item) || seen.has(item.id)) continue;

    seen.add(item.id);
    questions.push(item);

    if (questions.length === MAX_FAVORITES) break;
  }

  return questions;
}

export class FavoriteStore {
  constructor(
    private readonly storage: Storage | null,
    private readonly key: string = STORAGE_KEYS.favorites,
  ) {}

  getAll(): readonly GameQuestion[] {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return [];

      const payload = JSON.parse(raw) as Partial<FavoritesPayload>;
      if (payload.v !== 1) return [];

      return normalizeQuestions(payload.questions);
    } catch {
      return [];
    }
  }

  has(questionId: string): boolean {
    return this.getAll().some((question) => question.id === questionId);
  }

  save(question: GameQuestion): boolean {
    if (!isFavoriteQuestion(question)) return false;

    const questions = [
      question,
      ...this.getAll().filter((existing) => existing.id !== question.id),
    ].slice(0, MAX_FAVORITES);

    return this.write(questions);
  }

  remove(questionId: string): boolean {
    const questions = this.getAll().filter((question) => question.id !== questionId);
    return this.write(questions);
  }

  toggle(question: GameQuestion): boolean {
    if (this.has(question.id)) {
      this.remove(question.id);
      return false;
    }

    return this.save(question);
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // Storage may be blocked.
    }
  }

  private write(questions: readonly GameQuestion[]): boolean {
    try {
      if (!this.storage) return false;

      const payload: FavoritesPayload = {
        v: 1,
        questions,
      };

      this.storage.setItem(this.key, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }
}
