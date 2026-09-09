/** Convert Supabase rows → provider-independent domain objects. Pure functions. */
import type { Category, CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import type { CategoryRow, QuestionRow } from './database.types';

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    canonicalPath: row.canonical_path,
    h1: row.h1,
    seoTitle: row.seo_title,
    metaDescription: row.meta_description,
    introduction: row.introduction ?? '',
    shortDescription: row.short_description,
    icon: row.icon ?? '❓',
    status: row.status,
    navFeatured: row.nav_featured,
    includeInMixedGame: row.include_in_mixed_game,
    requiresAgeGate: row.requires_age_gate,
    isChildSafe: row.is_child_safe,
    isMature: row.is_mature,
    seasonalStart: row.seasonal_start,
    seasonalEnd: row.seasonal_end,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCategoryWithCount(
  row: CategoryRow,
  publishedQuestionCount: number,
): CategoryWithCount {
  return { ...mapCategory(row), publishedQuestionCount };
}

export function mapQuestion(row: QuestionRow, categoryIds: readonly string[]): Question {
  return {
    id: row.id,
    optionA: row.option_a,
    optionB: row.option_b,
    status: row.status,
    shareCode: row.share_code,
    sortOrder: row.sort_order,
    displayVoteCount: row.display_vote_count,
    categoryIds: [...categoryIds],
    isDemo: row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}
