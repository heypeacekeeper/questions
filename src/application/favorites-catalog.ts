import type { Category } from '@/domain/category';
import type { GameQuestion, Question } from '@/domain/question';
import { toGameQuestion } from '@/domain/question';
import { CONTENT_LIMITS, GAME_DATA, ROUTES } from '@/config/site';
import { SHARE_CODE_PATTERN } from '@/lib/crypto';

export interface FavoriteCatalogQuestion extends GameQuestion {
  /** True when any assigned category is mature or requires age confirmation. */
  readonly g: boolean;
}

export interface FavoritesCatalogPayload {
  readonly v: 1;
  readonly q: readonly FavoriteCatalogQuestion[];
}

export interface FavoritesCatalogFile {
  readonly url: string;
  readonly json: string;
  readonly questionCount: number;
}

export function buildFavoritesCatalog(
  questions: readonly Question[],
  categories: readonly Pick<Category, 'id' | 'isMature' | 'requiresAgeGate'>[],
): FavoritesCatalogFile {
  const restrictedCategoryIds = new Set(
    categories
      .filter((category) => category.isMature || category.requiresAgeGate)
      .map((category) => category.id),
  );

  const catalog: FavoritesCatalogPayload = {
    v: 1,
    q: questions
      .filter((question) => question.status === 'published')
      .map((question) => ({
        ...toGameQuestion(question),
        g: question.categoryIds.some((categoryId) => restrictedCategoryIds.has(categoryId)),
      })),
  };

  return {
    url: `${ROUTES.gameDataPrefix}${GAME_DATA.favoritesCatalogFile}`,
    json: JSON.stringify(catalog),
    questionCount: catalog.q.length,
  };
}

export interface ResolvedFavorites {
  readonly questions: readonly FavoriteCatalogQuestion[];
  readonly unavailableIds: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCatalogQuestion(value: unknown): value is FavoriteCatalogQuestion {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    value.id.length <= 128 &&
    typeof value.a === 'string' &&
    value.a.trim().length > 0 &&
    value.a.length <= CONTENT_LIMITS.optionMax &&
    typeof value.b === 'string' &&
    value.b.trim().length > 0 &&
    value.b.length <= CONTENT_LIMITS.optionMax &&
    typeof value.s === 'string' &&
    SHARE_CODE_PATTERN.test(value.s) &&
    typeof value.d === 'number' &&
    Number.isSafeInteger(value.d) &&
    value.d >= 0 &&
    typeof value.g === 'boolean'
  );
}

export function parseFavoritesCatalog(data: unknown): readonly FavoriteCatalogQuestion[] | null {
  if (!isRecord(data) || data.v !== 1 || !Array.isArray(data.q)) return null;

  const questions: FavoriteCatalogQuestion[] = [];
  const seen = new Set<string>();

  for (const value of data.q) {
    if (!isCatalogQuestion(value) || seen.has(value.id)) return null;
    seen.add(value.id);
    questions.push(value);
  }

  return questions;
}

export function resolveFavoriteIds(
  ids: readonly string[],
  catalog: readonly FavoriteCatalogQuestion[],
): ResolvedFavorites {
  const byId = new Map(catalog.map((question) => [question.id, question]));
  const questions: FavoriteCatalogQuestion[] = [];
  const unavailableIds: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);

    const question = byId.get(id);
    if (question) {
      questions.push(question);
    } else {
      unavailableIds.push(id);
    }
  }

  return { questions, unavailableIds };
}

export async function fetchFavoritesCatalog(
  url: string = `${ROUTES.gameDataPrefix}${GAME_DATA.favoritesCatalogFile}`,
): Promise<readonly FavoriteCatalogQuestion[] | null> {
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) return null;
    return parseFavoritesCatalog(await response.json());
  } catch {
    return null;
  }
}
