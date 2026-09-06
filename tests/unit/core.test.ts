import { describe, it, expect } from 'vitest';
import { calculatePercentages, buildVoteResult } from '@/domain/vote';
import { paginate } from '@/domain/site';
import { pickNextUnseen } from '@/application/question-service';
import { isWithinWindow, isSeasonalCategoryActive } from '@/application/category-service';
import { validateSubmission, validateContact } from '@/application/submission-service';
import { validateVoteRequest as vvr } from '@/application/voting-service';
import { normalizeForComparison, questionPairFingerprint } from '@/lib/text';
import { validateContent, hasErrors } from '@/application/content-validation';
import { MockVoteRepository, MockQuestionRepository, MockCategoryRepository, createDefaultMockDataset } from '@/infrastructure/mock/repositories';
import { DEMO_QUESTIONS, LAUNCH_CATEGORIES } from '@/infrastructure/mock/fixtures';
import { mapQuestion, mapCategory } from '@/infrastructure/supabase/mappers';
import { isSitemapEligible } from '@/config/site-static.mjs';
import { buildAppEnv } from '@/config/env';
import { SEASONAL_WINDOWS } from '@/config/site';

describe('vote percentages', () => {
  it('zero votes → 0/0', () => expect(calculatePercentages({ votesA: 0, votesB: 0 })).toEqual({ percentA: 0, percentB: 0, total: 0 }));
  it('first vote → 100/0', () => expect(calculatePercentages({ votesA: 1, votesB: 0 })).toMatchObject({ percentA: 100, percentB: 0 }));
  it('always sums to 100', () => { for (let a = 0; a < 40; a++) for (let b = 1; b < 40; b++) { const p = calculatePercentages({ votesA: a, votesB: b }); expect(p.percentA + p.percentB).toBe(100); } });
  it('buildVoteResult flags acceptance', () => expect(buildVoteResult('q', { votesA: 2, votesB: 1 }, 'A', true).accepted).toBe(true));
});
describe('mock vote repository', () => {
  it('first vote accepted, duplicate rejected but returns totals', async () => {
    const repo = new MockVoteRepository(createDefaultMockDataset(0)); const id = DEMO_QUESTIONS[0]!.id; const h = 'a'.repeat(64);
    const r1 = await repo.submitVote(id, 'A', h); expect(r1.kind).toBe('ok'); if (r1.kind === 'ok') expect(r1.result.accepted).toBe(true);
    const r2 = await repo.submitVote(id, 'B', h); if (r2.kind === 'ok') { expect(r2.result.accepted).toBe(false); expect(r2.result.total).toBe(1); expect(r2.result.yourChoice).toBe('A'); }
    expect((await repo.submitVote('00000000-0000-4000-8000-000000000000', 'A', h)).kind).toBe('not_found');
  });
});
describe('pagination', () => {
  it('continues numbering', () => { const items = Array.from({ length: 120 }, (_, i) => i); const p2 = paginate(items, 2, 50); expect(p2.startIndex).toBe(51); expect(p2.endIndex).toBe(100); expect(p2.totalPages).toBe(3); expect(paginate(items, 3, 50).items.length).toBe(20); });
  it('empty → one page', () => expect(paginate([], 1, 50).totalPages).toBe(1));
});
describe('randomization', () => {
  it('never repeats seen ids', () => { const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; const seen = new Set<string>(); for (let i = 0; i < 3; i++) { const q = pickNextUnseen(pool, seen); expect(q).not.toBeNull(); seen.add(q!.id); } expect(pickNextUnseen(pool, seen)).toBeNull(); });
});
describe('seasonal windows', () => {
  it('handles normal + wrapping windows', () => { expect(isWithinWindow(new Date('2026-10-15T00:00:00Z'), { month: 9, day: 1 }, { month: 10, day: 31 })).toBe(true); expect(isWithinWindow(new Date('2026-01-05T00:00:00Z'), { month: 12, day: 1 }, { month: 2, day: 28 })).toBe(true); expect(isWithinWindow(new Date('2026-06-05T00:00:00Z'), { month: 12, day: 1 }, { month: 2, day: 28 })).toBe(false); });
  it('config windows by slug', () => expect(isSeasonalCategoryActive({ slug: 'halloween', seasonalStart: null, seasonalEnd: null }, new Date('2026-10-01T00:00:00Z'), SEASONAL_WINDOWS)).toBe(true));
});
describe('form validation', () => {
  const env = { turnstileToken: 'x'.repeat(20), website: '', renderedAt: Date.now() - 10000 };
  it('rejects identical options, unknown fields, honeypot', () => {
    expect(validateSubmission({ optionA: 'fly', optionB: 'Fly!', categoryId: LAUNCH_CATEGORIES[0]!.id, agree: true, ...env }).ok).toBe(false);
    expect(validateSubmission({ optionA: 'fly', optionB: 'swim', categoryId: LAUNCH_CATEGORIES[0]!.id, agree: true, extra: 1, ...env }).ok).toBe(false);
    expect(validateSubmission({ optionA: 'fly', optionB: 'swim', categoryId: LAUNCH_CATEGORIES[0]!.id, agree: true, ...env, website: 'spam' }).ok).toBe(false);
    expect(validateSubmission({ optionA: 'fly', optionB: 'swim', categoryId: LAUNCH_CATEGORIES[0]!.id, agree: true, ...env }).ok).toBe(true);
  });
  it('contact requires email + privacy', () => { expect(validateContact({ name: 'A', email: 'bad', subject: 'Hi there', message: 'x'.repeat(20), privacy: true, ...env }).ok).toBe(false); expect(validateContact({ name: 'A', email: 'a@b.co', subject: 'Hi there', message: 'x'.repeat(20), privacy: true, ...env }).ok).toBe(true); });
  it('vote request schema', () => { expect(vvr({ questionId: DEMO_QUESTIONS[0]!.id, choice: 'A' }).ok).toBe(true); expect(vvr({ questionId: 'nope', choice: 'A' }).ok).toBe(false); expect(vvr({ questionId: DEMO_QUESTIONS[0]!.id, choice: 'C' }).ok).toBe(false); });
});
describe('text normalization', () => {
  it('detects reversed duplicates', () => expect(questionPairFingerprint('Sweat maple syrup', 'sneeze glitter!')).toBe(questionPairFingerprint('Sneeze glitter', 'sweat maple syrup')));
  it('strips would you rather', () => expect(normalizeForComparison('Would you rather Fly?')).toBe('fly'));
});
describe('content validation', () => {
  it('passes demo data when allowed, fails demo in production', async () => {
    const data = createDefaultMockDataset(20); const cats = await new MockCategoryRepository(data).getAllCategories(); const qs = await new MockQuestionRepository(data).getAllQuestions();
    expect(hasErrors(validateContent(cats, qs, { allowDemoContent: true }))).toBe(false);
    expect(validateContent(cats, qs, { allowDemoContent: false }).some((i) => i.code === 'DEMO_IN_PRODUCTION')).toBe(true);
  });
  it('filters published/draft; share lookup', async () => { const data = createDefaultMockDataset(0); const repo = new MockQuestionRepository(data); expect((await repo.getPublishedQuestions()).every((q) => q.status === 'published')).toBe(true); expect((await repo.getQuestionByShareCode('demq22a'))?.id).toBe(DEMO_QUESTIONS[0]!.id); expect(await repo.getQuestionByShareCode('nope')).toBeNull(); });
  it('age gate config', () => { const dirty = createDefaultMockDataset(0).categories.find((c) => c.slug === 'dirty')!; expect(dirty.requiresAgeGate && dirty.isMature && dirty.status === 'draft').toBe(true); expect(createDefaultMockDataset(0).categories.find((c) => c.slug === 'for-adults')!.requiresAgeGate).toBe(false); });
});
describe('supabase mapping', () => {
  it('maps rows to domain', () => { const q = mapQuestion({ id: 'x', option_a: 'a', option_b: 'b', status: 'published', share_code: 'abcdefg', sort_order: 1, is_demo: false, created_at: 't', updated_at: 't', published_at: 't' }, ['c']); expect(q.optionA).toBe('a'); expect(q.categoryIds).toEqual(['c']); expect(mapCategory({ id: 'c', name: 'N', slug: 's', canonical_path: '/s/', h1: 'H', seo_title: 'T', meta_description: 'D', introduction: '', short_description: 'S', icon: '🎲', status: 'published', nav_featured: true, include_in_mixed_game: true, requires_age_gate: false, is_child_safe: true, is_mature: false, seasonal_start: null, seasonal_end: null, sort_order: 1, created_at: 't', updated_at: 't' }).canonicalPath).toBe('/s/'); });
});
describe('sitemap + env', () => {
  it('excludes share/api', () => { expect(isSitemapEligible('https://x.org/s/abc/')).toBe(false); expect(isSitemapEligible('https://x.org/api/vote')).toBe(false); expect(isSitemapEligible('https://x.org/funny-would-you-rather-questions/')).toBe(true); });
  it('env: mock in production fails; supabase requires keys', () => { expect(() => buildAppEnv({ DATA_PROVIDER: 'mock' }, { mode: 'production' })).toThrow(); expect(() => buildAppEnv({ DATA_PROVIDER: 'supabase' }, { mode: 'production' })).toThrow(); expect(buildAppEnv({ DATA_PROVIDER: 'mock' }, { mode: 'development' }).dataProvider).toBe('mock'); });
});
