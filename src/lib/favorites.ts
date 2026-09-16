import type { GameQuestion } from '@/domain/question';
import { STORAGE_KEYS } from '@/config/site';

export const MAX_FAVORITES = 100;

interface LegacyFavoritesPayload {
  readonly v: 1;
  readonly questions: readonly GameQuestion[];
}

interface FavoritesIdPayload {
  readonly v: 2;
  readonly ids: readonly string[];
}

export interface FavoriteMutationResult {
  readonly ok: boolean;
  readonly saved: boolean;
}

export interface FavoriteReconcileResult {
  readonly ok: boolean;
  readonly removed: number;
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isLegacyFavoriteQuestion(value: unknown): value is GameQuestion {
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

export function isFavoriteId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const id of value) {
    if (!isFavoriteId(id) || seen.has(id)) continue;

    seen.add(id);
    ids.push(id);

    if (ids.length === MAX_FAVORITES) break;
  }

  return ids;
}

function legacyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!isLegacyFavoriteQuestion(item) || seen.has(item.id)) continue;

    seen.add(item.id);
    ids.push(item.id);

    if (ids.length === MAX_FAVORITES) break;
  }

  return ids;
}

export class FavoriteStore {
  constructor(
    private readonly storage: Storage | null,
    private readonly key: string = STORAGE_KEYS.favorites,
  ) {}

  getIds(): readonly string[] {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return [];

      const payload = JSON.parse(raw) as
        Partial<FavoritesIdPayload> | Partial<LegacyFavoritesPayload>;

      if (payload.v === 2) return normalizeIds(payload.ids);

      if (payload.v === 1) {
        const ids = legacyIds(payload.questions);
        this.writeIds(ids);
        return ids;
      }

      return [];
    } catch {
      return [];
    }
  }

  hasId(questionId: string): boolean {
    return this.getIds().includes(questionId);
  }

  saveId(questionId: string): FavoriteMutationResult {
    if (!isFavoriteId(questionId)) return { ok: false, saved: false };
    if (this.hasId(questionId)) return { ok: true, saved: true };

    const ok = this.writeIds([questionId, ...this.getIds()].slice(0, MAX_FAVORITES));
    return { ok, saved: ok };
  }

  removeId(questionId: string): FavoriteMutationResult {
    const ids = this.getIds();
    if (!ids.includes(questionId)) return { ok: true, saved: false };

    const ok = this.writeIds(ids.filter((id) => id !== questionId));
    return { ok, saved: !ok };
  }

  toggleId(questionId: string): FavoriteMutationResult {
    return this.hasId(questionId) ? this.removeId(questionId) : this.saveId(questionId);
  }

  reconcileIds(availableIds: ReadonlySet<string>): FavoriteReconcileResult {
    const current = this.getIds();
    const next = current.filter((id) => availableIds.has(id));
    const removed = current.length - next.length;

    if (removed === 0) return { ok: true, removed: 0 };

    const ok = this.writeIds(next);
    return { ok, removed: ok ? removed : 0 };
  }

  clearIds(): { readonly ok: boolean } {
    try {
      if (!this.storage) return { ok: false };

      this.storage.removeItem(this.key);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  private writeIds(ids: readonly string[]): boolean {
    try {
      if (!this.storage) return false;

      const payload: FavoritesIdPayload = {
        v: 2,
        ids: normalizeIds(ids),
      };

      this.storage.setItem(this.key, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }
}
