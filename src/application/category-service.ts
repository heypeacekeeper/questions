/**
 * Category business rules: visibility, navigation selection, related
 * categories, seasonal selection. Provider-independent.
 */
import type { CategoryWithCount } from '@/domain/category';
import { isCategoryVisible } from '@/domain/category';
import type { SeasonalWindow, MonthDay } from '@/domain/site';
import type { CategoryRepository } from '@/repositories/interfaces';
import { NAVIGATION, SEASONAL_WINDOWS } from '@/config/site';

export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  /** Published categories that actually have published questions. */
  async getVisibleCategories(): Promise<readonly CategoryWithCount[]> {
    const all = await this.categories.getPublishedCategories();
    return all.filter(isCategoryVisible).sort(bySortOrder);
  }

  /** Header dropdown: featured & visible, capped. */
  async getNavigationCategories(
    limit: number = NAVIGATION.navCategoryLimit,
  ): Promise<readonly CategoryWithCount[]> {
    const featured = (await this.categories.getNavigationCategories())
      .filter(isCategoryVisible)
      .sort(bySortOrder);
    return featured.slice(0, limit);
  }

  /** Sidebar "popular" block: visible categories ordered by question count then sort order. */
  async getPopularCategories(
    limit: number = NAVIGATION.popularCategoryLimit,
    excludeId?: string,
  ): Promise<readonly CategoryWithCount[]> {
    const visible = await this.getVisibleCategories();
    return visible
      .filter((c) => c.id !== excludeId)
      .slice()
      .sort((a, b) => b.publishedQuestionCount - a.publishedQuestionCount || bySortOrder(a, b))
      .slice(0, limit);
  }

  /** Related categories for a category page: other visible categories, featured first. */
  async getRelatedCategories(
    current: CategoryWithCount,
    limit: number = NAVIGATION.relatedCategoryLimit,
  ): Promise<readonly CategoryWithCount[]> {
    const visible = await this.getVisibleCategories();
    // Prefer categories with a compatible audience: never suggest mature next to child-safe and vice versa.
    return visible
      .filter((c) => c.id !== current.id)
      .filter((c) => !(current.isChildSafe && c.isMature) && !(current.isMature && c.isChildSafe))
      .sort((a, b) => Number(b.navFeatured) - Number(a.navFeatured) || bySortOrder(a, b))
      .slice(0, limit);
  }

  /** Categories offered in the homepage game pack picker (visible only). */
  async getGamePackCategories(): Promise<readonly CategoryWithCount[]> {
    return this.getVisibleCategories();
  }

  /** Categories whose questions form the homepage mixed game. */
  async getMixedGameCategories(): Promise<readonly CategoryWithCount[]> {
    return (await this.getVisibleCategories()).filter(
      (c) => c.includeInMixedGame && !c.requiresAgeGate && !c.isMature,
    );
  }

  /**
   * The seasonal category to promote right now (if any). Requires: published,
   * has content, and active date window (record dates override config windows).
   */
  async getActiveSeasonalCategory(now: Date = new Date()): Promise<CategoryWithCount | null> {
    const seasonal = (await this.categories.getSeasonalCategories()).filter(isCategoryVisible);
    for (const c of seasonal) {
      if (isSeasonalCategoryActive(c, now, SEASONAL_WINDOWS)) return c;
    }
    return null;
  }

  /** Categories accepting user submissions (published; mature ones too, they are moderated). */
  async getSubmissionCategories(): Promise<readonly CategoryWithCount[]> {
    return (await this.categories.getPublishedCategories()).slice().sort(bySortOrder);
  }
}

export function bySortOrder(a: CategoryWithCount, b: CategoryWithCount): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

// ---------------------------------------------------------------------------
// Seasonal logic (pure)
// ---------------------------------------------------------------------------

function monthDayIndex(md: MonthDay): number {
  return md.month * 100 + md.day;
}

/** Inclusive month/day window check that supports year-wrapping windows. */
export function isWithinWindow(now: Date, start: MonthDay, end: MonthDay): boolean {
  const today = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const s = monthDayIndex(start);
  const e = monthDayIndex(end);
  if (s <= e) return today >= s && today <= e;
  // Wraps year end (e.g. Dec 15 → Jan 10)
  return today >= s || today <= e;
}

function parseIsoDate(value: string): Date | null {
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isSeasonalCategoryActive(
  category: Pick<CategoryWithCount, 'slug' | 'seasonalStart' | 'seasonalEnd'>,
  now: Date,
  windows: readonly SeasonalWindow[],
): boolean {
  if (category.seasonalStart && category.seasonalEnd) {
    const s = parseIsoDate(category.seasonalStart);
    const e = parseIsoDate(category.seasonalEnd);
    if (s && e) {
      // Compare by month/day so record windows repeat every year.
      return isWithinWindow(
        now,
        { month: s.getUTCMonth() + 1, day: s.getUTCDate() },
        { month: e.getUTCMonth() + 1, day: e.getUTCDate() },
      );
    }
  }
  const window = windows.find((w) => w.slug === category.slug);
  return window ? isWithinWindow(now, window.start, window.end) : false;
}
