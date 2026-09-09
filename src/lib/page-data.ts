/** Shared build-time data loader for layout-level widgets (sidebar etc). */
import { getContentContext } from '@/repositories/factory';
import { toGameQuestion, type GameQuestion } from '@/domain/question';
import type { CategoryWithCount } from '@/domain/category';
import { seedFromString, seededRng, shuffle } from '@/lib/random';

export async function sidebarData(excludeId?: string) {
  const ctx = await getContentContext();
  const [popular, seasonal] = await Promise.all([
    ctx.categoryService.getPopularCategories(undefined, excludeId),
    ctx.categoryService.getActiveSeasonalCategory(),
  ]);
  return { popular, seasonal };
}

/** Initial (server-rendered) game question for a category or the mixed set. */
export async function initialGameQuestion(
  category: CategoryWithCount | null,
): Promise<GameQuestion | null> {
  const ctx = await getContentContext();
  const qs = category
    ? await ctx.questionService.getForCategory(category)
    : await ctx.questionService.getMixedGameQuestions(
        await ctx.categoryService.getMixedGameCategories(),
      );
  if (qs.length === 0) return null;
  const pick = shuffle(qs, seededRng(seedFromString(`initial:${category?.slug ?? 'mixed'}`)))[0];
  return pick ? toGameQuestion(pick) : null;
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
