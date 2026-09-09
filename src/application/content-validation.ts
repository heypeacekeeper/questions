/**
 * Content-integrity validation. Pure: takes categories + questions, returns
 * issues. `tools/validate-content.ts` runs it before every production build.
 */
import type { CategoryWithCount } from '@/domain/category';
import { CANONICAL_PATH_PATTERN, CATEGORY_STATUSES, SLUG_PATTERN } from '@/domain/category';
import type { Question } from '@/domain/question';
import { QUESTION_STATUSES } from '@/domain/question';
import { CONTENT_LIMITS, PAGINATION, ROUTES } from '@/config/site';
import { SHARE_CODE_PATTERN } from '@/lib/crypto';
import {
  normalizeForComparison,
  questionOrderedFingerprint,
  questionPairFingerprint,
} from '@/lib/text';

export type Severity = 'error' | 'warning';

export interface ContentIssue {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  /** Affected record identifiers for actionable output. */
  readonly records: readonly string[];
}

export interface ValidationOptions {
  /** When false (production), published demo records are errors. */
  allowDemoContent: boolean;
  /** Reserved top-level paths that categories may not collide with. */
  reservedPaths?: readonly string[];
}

const DEFAULT_RESERVED = Object.values(ROUTES).filter(
  (p) => p !== '/' && !p.endsWith('/s/') && !p.endsWith('/game-data/'),
);

export function validateContent(
  categories: readonly CategoryWithCount[],
  questions: readonly Question[],
  options: ValidationOptions,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const push = (
    severity: Severity,
    code: string,
    message: string,
    records: readonly string[] = [],
  ) => issues.push({ severity, code, message, records });
  const reserved = new Set((options.reservedPaths ?? DEFAULT_RESERVED).map((p) => p.toLowerCase()));

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const published = questions.filter((q) => q.status === 'published');

  // --- Categories ------------------------------------------------------------
  const slugs = new Map<string, string[]>();
  const paths = new Map<string, string[]>();
  for (const c of categories) {
    const label = `category ${c.slug} (${c.id})`;
    if (!CATEGORY_STATUSES.includes(c.status))
      push('error', 'CATEGORY_INVALID_STATUS', `${label} has invalid status "${c.status}"`, [c.id]);
    if (!SLUG_PATTERN.test(c.slug))
      push('error', 'CATEGORY_INVALID_SLUG', `${label} has an invalid slug`, [c.id]);
    if (!CANONICAL_PATH_PATTERN.test(c.canonicalPath))
      push(
        'error',
        'CATEGORY_INVALID_PATH',
        `${label} canonical path "${c.canonicalPath}" must look like /lower-case-words/`,
        [c.id],
      );
    if (reserved.has(c.canonicalPath.toLowerCase()))
      push(
        'error',
        'CATEGORY_RESERVED_PATH',
        `${label} canonical path collides with a reserved route`,
        [c.id],
      );
    slugs.set(c.slug, [...(slugs.get(c.slug) ?? []), c.id]);
    paths.set(c.canonicalPath, [...(paths.get(c.canonicalPath) ?? []), c.id]);
    if (c.isChildSafe && c.isMature)
      push('error', 'CATEGORY_CHILD_AND_MATURE', `${label} is flagged both child-safe and mature`, [
        c.id,
      ]);
    if (c.requiresAgeGate && !c.isMature)
      push(
        'error',
        'CATEGORY_AGE_GATE_NOT_MATURE',
        `${label} requires an age gate but is not flagged mature`,
        [c.id],
      );
    if (c.includeInMixedGame && (c.isMature || c.requiresAgeGate))
      push(
        'warning',
        'CATEGORY_MATURE_IN_MIXED',
        `${label} is mature but included in the mixed game; it will be excluded automatically`,
        [c.id],
      );
    if ((c.seasonalStart === null) !== (c.seasonalEnd === null))
      push('error', 'CATEGORY_SEASONAL_PAIR', `${label} must set both or neither seasonal dates`, [
        c.id,
      ]);

    if (c.status === 'published') {
      if (!c.h1.trim())
        push('error', 'CATEGORY_MISSING_H1', `${label} is published without an H1`, [c.id]);
      if (!c.seoTitle.trim())
        push('error', 'CATEGORY_MISSING_TITLE', `${label} is published without an SEO title`, [
          c.id,
        ]);
      else if (c.seoTitle.length > CONTENT_LIMITS.seoTitleMax)
        push(
          'warning',
          'CATEGORY_TITLE_LONG',
          `${label} SEO title exceeds ${CONTENT_LIMITS.seoTitleMax} characters`,
          [c.id],
        );
      if (!c.metaDescription.trim())
        push(
          'error',
          'CATEGORY_MISSING_DESCRIPTION',
          `${label} is published without a meta description`,
          [c.id],
        );
      else if (c.metaDescription.length > CONTENT_LIMITS.metaDescriptionMax)
        push(
          'warning',
          'CATEGORY_DESCRIPTION_LONG',
          `${label} meta description exceeds ${CONTENT_LIMITS.metaDescriptionMax} characters`,
          [c.id],
        );
      if (!c.introduction.trim())
        push('warning', 'CATEGORY_MISSING_INTRO', `${label} is published without an introduction`, [
          c.id,
        ]);
      if (c.publishedQuestionCount === 0)
        push(
          'warning',
          'CATEGORY_EMPTY',
          `${label} is published but has no published questions; it will be hidden from navigation and the sitemap`,
          [c.id],
        );
    }
  }
  for (const [slug, ids] of slugs)
    if (ids.length > 1)
      push('error', 'CATEGORY_DUPLICATE_SLUG', `Duplicate category slug "${slug}"`, ids);
  for (const [path, ids] of paths)
    if (ids.length > 1)
      push('error', 'CATEGORY_DUPLICATE_PATH', `Duplicate canonical path "${path}"`, ids);

  // --- Questions -------------------------------------------------------------
  const ids = new Map<string, number>();
  const shareCodes = new Map<string, string[]>();
  const exact = new Map<string, string[]>();
  const reversed = new Map<string, string[]>();
  for (const q of questions) {
    const label = `question ${q.id}`;
    ids.set(q.id, (ids.get(q.id) ?? 0) + 1);
    shareCodes.set(q.shareCode, [...(shareCodes.get(q.shareCode) ?? []), q.id]);
    if (
      !Number.isFinite(q.displayVoteCount) ||
      !Number.isInteger(q.displayVoteCount) ||
      q.displayVoteCount < 0
    )
      push(
        'error',
        'QUESTION_INVALID_DISPLAY_VOTE_COUNT',
        `${label} has an invalid non-negative integer display vote count`,
        [q.id],
      );
    if (!QUESTION_STATUSES.includes(q.status))
      push('error', 'QUESTION_INVALID_STATUS', `${label} has invalid status "${q.status}"`, [q.id]);
    if (!SHARE_CODE_PATTERN.test(q.shareCode))
      push(
        'error',
        'QUESTION_INVALID_SHARE_CODE',
        `${label} share code "${q.shareCode}" is invalid`,
        [q.id],
      );
    if (!q.optionA.trim() || !q.optionB.trim())
      push('error', 'QUESTION_EMPTY_OPTION', `${label} has an empty option`, [q.id]);
    if (normalizeForComparison(q.optionA) === normalizeForComparison(q.optionB))
      push('error', 'QUESTION_IDENTICAL_OPTIONS', `${label} has identical options`, [q.id]);
    if (q.optionA.length > CONTENT_LIMITS.optionMax || q.optionB.length > CONTENT_LIMITS.optionMax)
      push(
        'error',
        'QUESTION_OPTION_TOO_LONG',
        `${label} has an option longer than ${CONTENT_LIMITS.optionMax} characters`,
        [q.id],
      );
    if (q.categoryIds.length === 0)
      push(
        q.status === 'published' ? 'error' : 'warning',
        'QUESTION_ORPHANED',
        `${label} has no categories`,
        [q.id],
      );
    for (const cid of q.categoryIds)
      if (!categoryById.has(cid))
        push('error', 'QUESTION_UNKNOWN_CATEGORY', `${label} references unknown category ${cid}`, [
          q.id,
        ]);
    if (q.status === 'published' && q.isDemo && !options.allowDemoContent)
      push(
        'error',
        'DEMO_IN_PRODUCTION',
        `${label} is a DEMO fixture but is published. Archive/delete it or set ALLOW_DEMO_CONTENT=true for a test build.`,
        [q.id],
      );
    if (q.status === 'published') {
      // Mature/child mix: a question in a mature category AND a child-safe category is suspicious.
      const cats = q.categoryIds
        .map((c) => categoryById.get(c))
        .filter((c): c is CategoryWithCount => Boolean(c));
      if (cats.some((c) => c.isMature) && cats.some((c) => c.isChildSafe)) {
        push(
          'error',
          'QUESTION_MATURE_AND_CHILD',
          `${label} is assigned to both a mature and a child-safe category`,
          [q.id],
        );
      }
      const o = questionOrderedFingerprint(q.optionA, q.optionB);
      const r = questionPairFingerprint(q.optionA, q.optionB);
      exact.set(o, [...(exact.get(o) ?? []), q.id]);
      reversed.set(r, [...(reversed.get(r) ?? []), q.id]);
    }
  }
  for (const [id, n] of ids)
    if (n > 1) push('error', 'QUESTION_DUPLICATE_ID', `Duplicate question id ${id}`, [id]);
  for (const [code, qids] of shareCodes)
    if (qids.length > 1)
      push(
        'error',
        'QUESTION_DUPLICATE_SHARE_CODE',
        `Share code "${code}" is used by several questions`,
        qids,
      );
  for (const [, qids] of exact)
    if (qids.length > 1)
      push(
        'error',
        'QUESTION_DUPLICATE',
        `Duplicate published question (same wording after normalization)`,
        qids,
      );
  for (const [, qids] of reversed) {
    if (
      qids.length > 1 &&
      !exact.has(questionOrderedFingerprint(...(pairFor(qids[0], questions) ?? ['', ''])))
    ) {
      push(
        'error',
        'QUESTION_REVERSED_DUPLICATE',
        `Reversed duplicate published question (A/B swapped)`,
        qids,
      );
    }
  }

  // --- Pagination sanity -------------------------------------------------------
  for (const c of categories) {
    if (c.status !== 'published') continue;
    const actual = published.filter((q) => q.categoryIds.includes(c.id)).length;
    if (actual !== c.publishedQuestionCount)
      push(
        'error',
        'CATEGORY_COUNT_MISMATCH',
        `category ${c.slug} reports ${c.publishedQuestionCount} published questions but ${actual} were found`,
        [c.id],
      );
    const pages = Math.max(1, Math.ceil(actual / PAGINATION.questionsPerPage));
    if (pages > 200)
      push(
        'warning',
        'CATEGORY_MANY_PAGES',
        `category ${c.slug} would generate ${pages} pagination pages`,
        [c.id],
      );
  }

  // De-duplicate reversed vs exact: exact dupes already reported as such.
  return dedupeReversed(issues);
}

function pairFor(id: string | undefined, questions: readonly Question[]): [string, string] | null {
  const q = questions.find((x) => x.id === id);
  return q ? [q.optionA, q.optionB] : null;
}

function dedupeReversed(issues: ContentIssue[]): ContentIssue[] {
  const exactSets = issues
    .filter((i) => i.code === 'QUESTION_DUPLICATE')
    .map((i) => [...i.records].sort().join(','));
  return issues.filter(
    (i) =>
      !(
        i.code === 'QUESTION_REVERSED_DUPLICATE' &&
        exactSets.includes([...i.records].sort().join(','))
      ),
  );
}

export function hasErrors(issues: readonly ContentIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

export function formatIssues(issues: readonly ContentIssue[]): string {
  if (issues.length === 0) return '✔ Content validation passed with no issues.';
  return issues
    .map(
      (i) =>
        `${i.severity === 'error' ? '✖ ERROR ' : '⚠ WARN  '} [${i.code}] ${i.message}${i.records.length ? `\n           records: ${i.records.join(', ')}` : ''}`,
    )
    .join('\n');
}
