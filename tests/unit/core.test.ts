import { describe, it, expect } from 'vitest';
import { calculatePercentages, buildVoteResult } from '@/domain/vote';
import { paginate } from '@/domain/site';
import { pickNextUnseen } from '@/application/question-service';
import { isWithinWindow, isSeasonalCategoryActive } from '@/application/category-service';
import { validateSubmission, validateContact } from '@/application/submission-service';
import { validateVoteRequest as validateVote } from '@/application/voting-service';
import { normalizeForComparison, questionPairFingerprint } from '@/lib/text';
import { normalizePath } from '@/lib/performance-path';
import { validateContent, hasErrors } from '@/application/content-validation';
import { MockVoteRepository, MockQuestionRepository, MockCategoryRepository, InMemoryRateLimiter, createDefaultMockDataset } from '@/infrastructure/mock/repositories';
import { DEMO_QUESTIONS, LAUNCH_CATEGORIES } from '@/infrastructure/mock/fixtures';
import { mapQuestion, mapCategory } from '@/infrastructure/supabase/mappers';
import { isSitemapEligible } from '@/config/site-static.mjs';
import { buildAppEnv } from '@/config/env';
import { SEASONAL_WINDOWS } from '@/config/site';
import { SessionSeenStore } from '@/scripts/game-engine';

describe('vote percentages', () => {
  it('uses zero percentages for zero and sums to 100 otherwise', () => {
    expect(calculatePercentages({ votesA: 0, votesB: 0 })).toEqual({ percentA: 0, percentB: 0, total: 0 });
    for (let votesA = 0; votesA < 40; votesA += 1) for (let votesB = 1; votesB < 40; votesB += 1) expect(calculatePercentages({ votesA, votesB }).percentA + calculatePercentages({ votesA, votesB }).percentB).toBe(100);
  });
  it('normalizes negative totals', () => expect(buildVoteResult('q', { votesA: -2, votesB: 1 })).toMatchObject({ votesA: 0, votesB: 1, total: 1, percentA: 0, percentB: 100 }));
});
describe('repeat voting', () => {
  it('accepts repeated votes and increments aggregate totals on every call', async () => {
    const repository = new MockVoteRepository(createDefaultMockDataset(0)); const id = DEMO_QUESTIONS[0]!.id;
    const first = await repository.submitVote(id, 'A'); const second = await repository.submitVote(id, 'A'); const third = await repository.submitVote(id, 'B');
    expect(first).toMatchObject({ kind: 'ok', result: { votesA: 1, votesB: 0, total: 1 } });
    expect(second).toMatchObject({ kind: 'ok', result: { votesA: 2, votesB: 0, total: 2 } });
    expect(third).toMatchObject({ kind: 'ok', result: { votesA: 2, votesB: 1, total: 3, percentA: 67, percentB: 33 } });
  });
  it('rejects missing and unpublished questions without changing totals', async () => {
    const base = createDefaultMockDataset(0);
    const draft = { ...DEMO_QUESTIONS[0]!, id: '00000000-0000-4000-8000-000000000002', status: 'draft' as const };
    const repository = new MockVoteRepository({ ...base, questions: [...base.questions, draft] });
    expect((await repository.submitVote('00000000-0000-4000-8000-000000000000', 'A')).kind).toBe('not_found');
    expect((await repository.submitVote(draft.id, 'A')).kind).toBe('not_published');
  });
  it('continues enforcing rate limits independently of vote storage', async () => { const limiter = new InMemoryRateLimiter(() => 0); expect(await limiter.allow('vote:test', 2, 60)).toBe(true); expect(await limiter.allow('vote:test', 2, 60)).toBe(true); expect(await limiter.allow('vote:test', 2, 60)).toBe(false); });
});
describe('client storage', () => {
  it('retains session-based question no-repeat state', () => { const store = new SessionSeenStore('seen', null); store.add('question-a'); expect(store.get()).toEqual(new Set(['question-a'])); });
});
describe('performance paths', () => { it('normalizes Windows and POSIX Astro paths', () => { expect(normalizePath('C:\\project\\dist\\client\\_astro\\file.js')).toContain('/_astro/file.js'); expect(normalizePath('/project/dist/client/_astro/file.js')).toContain('/_astro/file.js'); }); });
describe('pagination', () => { it('continues numbering', () => { const items = Array.from({ length: 120 }, (_, index) => index); expect(paginate(items, 2, 50)).toMatchObject({ startIndex: 51, endIndex: 100, totalPages: 3 }); expect(paginate(items, 3, 50).items).toHaveLength(20); }); it('uses one page for empty lists', () => expect(paginate([], 1, 50).totalPages).toBe(1)); });
describe('randomization', () => { it('never selects an already seen id', () => { const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; const seen = new Set<string>(); for (let index = 0; index < 3; index += 1) { const question = pickNextUnseen(pool, seen); expect(question).not.toBeNull(); seen.add(question!.id); } expect(pickNextUnseen(pool, seen)).toBeNull(); }); });
describe('seasonal windows', () => { it('handles normal and wrapping windows', () => { expect(isWithinWindow(new Date('2026-10-15T00:00:00Z'), { month: 9, day: 1 }, { month: 10, day: 31 })).toBe(true); expect(isWithinWindow(new Date('2026-01-05T00:00:00Z'), { month: 12, day: 1 }, { month: 2, day: 28 })).toBe(true); expect(isWithinWindow(new Date('2026-06-05T00:00:00Z'), { month: 12, day: 1 }, { month: 2, day: 28 })).toBe(false); }); it('uses configured category windows', () => expect(isSeasonalCategoryActive({ slug: 'halloween', seasonalStart: null, seasonalEnd: null }, new Date('2026-10-01T00:00:00Z'), SEASONAL_WINDOWS)).toBe(true)); });
describe('form validation', () => { const env = { turnstileToken: 'x'.repeat(20), website: '', renderedAt: Date.now() - 10000 }; it('validates question submissions', () => { expect(validateSubmission({ optionA: 'fly', optionB: 'Fly!', categoryId: LAUNCH_CATEGORIES[0]!.id, agree: true, ...env }).ok).toBe(false); expect(validateSubmission({ optionA: 'fly', optionB: 'swim', categoryId: LAUNCH_CATEGORIES[0]!.id, agree: true, ...env }).ok).toBe(true); }); it('validates contact forms', () => { expect(validateContact({ name: 'A', email: 'bad', subject: 'Hi there', message: 'x'.repeat(20), privacy: true, ...env }).ok).toBe(false); expect(validateContact({ name: 'A', email: 'a@b.co', subject: 'Hi there', message: 'x'.repeat(20), privacy: true, ...env }).ok).toBe(true); }); it('validates vote requests', () => { expect(validateVote({ questionId: DEMO_QUESTIONS[0]!.id, choice: 'A' }).ok).toBe(true); expect(validateVote({ questionId: 'nope', choice: 'A' }).ok).toBe(false); }); });
describe('content helpers', () => { it('detects reversed duplicate questions', () => expect(questionPairFingerprint('Sweat maple syrup', 'sneeze glitter!')).toBe(questionPairFingerprint('Sneeze glitter', 'sweat maple syrup'))); it('strips the question lead-in', () => expect(normalizeForComparison('Would you rather Fly?')).toBe('fly')); it('validates fixture content and share lookup', async () => { const data = createDefaultMockDataset(20); const categories = await new MockCategoryRepository(data).getAllCategories(); const questions = await new MockQuestionRepository(data).getAllQuestions(); expect(hasErrors(validateContent(categories, questions, { allowDemoContent: true }))).toBe(false); expect((await new MockQuestionRepository(data).getQuestionByShareCode('demq22a'))?.id).toBe(DEMO_QUESTIONS[0]!.id); }); });
describe('supabase mapping and environment', () => { it('maps content rows', () => { expect(mapQuestion({ id: 'x', option_a: 'a', option_b: 'b', status: 'published', share_code: 'abcdefg', sort_order: 1, is_demo: false, created_at: 't', updated_at: 't', published_at: 't' }, ['c']).categoryIds).toEqual(['c']); expect(mapCategory({ id: 'c', name: 'N', slug: 's', canonical_path: '/s/', h1: 'H', seo_title: 'T', meta_description: 'D', introduction: '', short_description: 'S', icon: '🎲', status: 'published', nav_featured: true, include_in_mixed_game: true, requires_age_gate: false, is_child_safe: true, is_mature: false, seasonal_start: null, seasonal_end: null, sort_order: 1, created_at: 't', updated_at: 't' }).canonicalPath).toBe('/s/'); }); it('keeps build environment and sitemap safeguards', () => { expect(isSitemapEligible('https://x.org/s/abc/')).toBe(false); expect(() => buildAppEnv({ DATA_PROVIDER: 'supabase' }, { mode: 'production' })).toThrow(); }); });
