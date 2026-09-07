/**
 * Generates supabase/migrations/0002_seed_categories.sql and
 * supabase/seed/demo_questions.sql from the TypeScript fixtures so SQL and
 * mock data never drift apart.
 *
 *   npx tsx tools/generate-seed-sql.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_CATEGORIES, DEMO_QUESTIONS } from '../src/infrastructure/mock/fixtures';

function lit(value: string | null | boolean | number): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

const categoryRows = ALL_CATEGORIES.map((c) =>
  `  (${[
    lit(c.id), lit(c.name), lit(c.slug), lit(c.canonicalPath), lit(c.h1), lit(c.seoTitle), lit(c.metaDescription),
    lit(c.introduction), lit(c.shortDescription), lit(c.icon), lit(c.status), lit(c.navFeatured), lit(c.includeInMixedGame),
    lit(c.requiresAgeGate), lit(c.isChildSafe), lit(c.isMature), lit(c.seasonalStart), lit(c.seasonalEnd), lit(c.sortOrder),
  ].join(', ')})`,
);

const categorySql = `-- ============================================================================
-- Launch + future category definitions. GENERATED from
-- src/infrastructure/mock/fixtures.ts by tools/generate-seed-sql.ts — edit the
-- TypeScript and regenerate, or edit categories later in the Supabase dashboard.
--
-- Launch categories are 'published'. Future categories are 'draft' and are
-- hidden from navigation, the sitemap and routes until published AND given
-- published questions.
-- ============================================================================

insert into public.categories (
  id, name, slug, canonical_path, h1, seo_title, meta_description, introduction,
  short_description, icon, status, nav_featured, include_in_mixed_game,
  requires_age_gate, is_child_safe, is_mature, seasonal_start, seasonal_end, sort_order
) values
${categoryRows.join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  canonical_path = excluded.canonical_path,
  h1 = excluded.h1,
  seo_title = excluded.seo_title,
  meta_description = excluded.meta_description,
  introduction = excluded.introduction,
  short_description = excluded.short_description,
  icon = excluded.icon,
  nav_featured = excluded.nav_featured,
  include_in_mixed_game = excluded.include_in_mixed_game,
  requires_age_gate = excluded.requires_age_gate,
  is_child_safe = excluded.is_child_safe,
  is_mature = excluded.is_mature,
  seasonal_start = excluded.seasonal_start,
  seasonal_end = excluded.seasonal_end,
  sort_order = excluded.sort_order;
  -- NOTE: status is intentionally NOT overwritten so dashboard publish/unpublish decisions survive re-runs.
`;

const demoQuestionRows = DEMO_QUESTIONS.map(
  (q) => `  (${lit(q.id)}, ${lit(q.optionA)}, ${lit(q.optionB)}, 'published', ${lit(q.shareCode)}, ${q.sortOrder}, true, now())`,
);
const demoLinkRows = DEMO_QUESTIONS.flatMap((q) => q.categoryIds.map((c) => `  (${lit(q.id)}, ${lit(c)})`));

const demoSql = `-- ============================================================================
-- DEMO QUESTIONS — optional. Three clearly labelled fixtures so the game,
-- sharing and static lists can be tested against a real database.
--
-- Every row has is_demo = true and option text starting with "[DEMO]".
-- Production builds FAIL if demo rows are published unless ALLOW_DEMO_CONTENT=true.
--
-- Load:   paste into the SQL editor, or: supabase db execute -f supabase/seed/demo_questions.sql
-- Delete: delete from public.questions where is_demo = true;
-- ============================================================================

insert into public.questions (id, option_a, option_b, status, share_code, sort_order, is_demo, published_at) values
${demoQuestionRows.join(',\n')}
on conflict (id) do nothing;

insert into public.question_categories (question_id, category_id) values
${demoLinkRows.join(',\n')}
on conflict do nothing;
`;

const root = resolve(import.meta.dirname ?? '.', '..');
mkdirSync(resolve(root, 'supabase/seed'), { recursive: true });
writeFileSync(resolve(root, 'supabase/migrations/0002_seed_categories.sql'), categorySql);
writeFileSync(resolve(root, 'supabase/seed/demo_questions.sql'), demoSql);
console.log('Wrote supabase/migrations/0002_seed_categories.sql and supabase/seed/demo_questions.sql');
