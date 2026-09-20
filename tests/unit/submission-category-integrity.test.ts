import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/0011_enforce_published_submission_categories.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('published submission category migration', () => {
  it('locks and validates the category before inserting a submission', () => {
    const categoryCheck = migration.indexOf('from public.categories as category');
    const submissionInsert = migration.indexOf('insert into public.question_submissions');

    expect(categoryCheck).toBeGreaterThan(-1);
    expect(submissionInsert).toBeGreaterThan(categoryCheck);
    expect(migration).toMatch(
      /where category\.id = p_category_id\s+and category\.status = 'published'\s+for share;/,
    );
    expect(migration).toContain("message = 'submission category must be published'");
    expect(migration).toContain("errcode = '23514'");
  });

  it('preserves private RPC permissions', () => {
    expect(migration).toMatch(
      /revoke all on function public\.create_question_submission_limited[\s\S]*from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.create_question_submission_limited[\s\S]*to service_role;/,
    );
  });
});
