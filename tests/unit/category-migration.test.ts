import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/0010_finalize_category_catalog.sql', import.meta.url),
  'utf8',
);

const currentSeed = readFileSync(
  new URL('../../supabase/seed/categories.sql', import.meta.url),
  'utf8',
);

const generator = readFileSync(
  new URL('../../tools/generate-seed-sql.ts', import.meta.url),
  'utf8',
);

describe('category catalog migration', () => {
  it('installs the new categories and safely handles obsolete categories', () => {
    for (const slug of ['animals', 'spring', 'scary']) {
      expect(migration).toContain(`'${slug}'`);
    }

    expect(migration).toMatch(/delete from public\.categories/);
    expect(migration).toMatch(/public\.question_categories/);
    expect(migration).toMatch(/public\.question_submissions/);
    expect(migration).toMatch(/status = 'archived'/);
  });

  it('keeps the current seed separate from immutable migration 0002', () => {
    expect(generator).toContain('supabase/seed/categories.sql');
    expect(generator).not.toContain('supabase/migrations/0002_seed_categories.sql');

    for (const slug of ['animals', 'spring', 'scary']) {
      expect(currentSeed).toContain(`'${slug}'`);
    }
  });
});
