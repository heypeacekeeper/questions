/** Provider-independent category domain model. */

export type CategoryStatus = 'draft' | 'published' | 'archived';
export const CATEGORY_STATUSES: readonly CategoryStatus[] = ['draft', 'published', 'archived'];

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** Absolute site path with leading and trailing slash, e.g. /funny-would-you-rather-questions/ */
  readonly canonicalPath: string;
  readonly h1: string;
  readonly seoTitle: string;
  readonly metaDescription: string;
  /** Long-form intro (plain text paragraphs separated by blank lines). */
  readonly introduction: string;
  /** One-line description for menus/cards. */
  readonly shortDescription: string;
  /** Emoji or short glyph shown in menus; purely decorative. */
  readonly icon: string;
  readonly status: CategoryStatus;
  readonly navFeatured: boolean;
  readonly includeInMixedGame: boolean;
  readonly requiresAgeGate: boolean;
  /** Marks categories intended for children/families (used for mature-content validation). */
  readonly isChildSafe: boolean;
  /** Marks mature categories (used for mature-content validation). */
  readonly isMature: boolean;
  /** ISO date (YYYY-MM-DD) or null; overrides config windows when set. */
  readonly seasonalStart: string | null;
  readonly seasonalEnd: string | null;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A category enriched with its published question count. */
export interface CategoryWithCount extends Category {
  readonly publishedQuestionCount: number;
}

export function isCategoryPublished(c: Pick<Category, 'status'>): boolean {
  return c.status === 'published';
}

export function isCategoryVisible(c: CategoryWithCount): boolean {
  return isCategoryPublished(c) && c.publishedQuestionCount > 0;
}

/** Normalize an arbitrary path to `/leading/and/trailing/` form. */
export function normalizeCanonicalPath(path: string): string {
  let p = path.trim();
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p.replace(/\/{2,}/g, '/');
}

export const CANONICAL_PATH_PATTERN = /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
