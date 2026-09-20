import { describe, expect, it } from 'vitest';
import { validateContent } from '@/application/content-validation';
import type { CategoryWithCount } from '@/domain/category';
import type { Question, QuestionStatus } from '@/domain/question';
import { DEMO_QUESTIONS, LAUNCH_CATEGORIES } from '@/infrastructure/mock/fixtures';

const baseCategory = LAUNCH_CATEGORIES[0]!;
const baseQuestion = DEMO_QUESTIONS[0]!;

function category(id: string, status: CategoryWithCount['status']): CategoryWithCount {
  return {
    ...baseCategory,
    id,
    status,
    slug: `${status}-${id}`,
    canonicalPath: `/${status}-${id}/`,
    publishedQuestionCount: status === 'published' ? 1 : 0,
  };
}

function question(status: QuestionStatus, categoryIds: readonly string[]): Question {
  return {
    ...baseQuestion,
    id: `question-${status}-${categoryIds.join('-')}`,
    status,
    categoryIds,
    isDemo: false,
  };
}

function publishedCategoryIssues(categories: readonly CategoryWithCount[], candidate: Question) {
  return validateContent(categories, [candidate], {
    allowDemoContent: true,
  }).filter((issue) => issue.code === 'QUESTION_NO_PUBLISHED_CATEGORY');
}

describe('published question category integrity', () => {
  it('accepts a published question with a published category', () => {
    const published = category('published', 'published');

    expect(publishedCategoryIssues([published], question('published', [published.id]))).toEqual([]);
  });

  it.each(['draft', 'archived'] as const)(
    'rejects a published question linked only to a %s category',
    (status) => {
      const unavailable = category(status, status);
      const candidate = question('published', [unavailable.id]);

      expect(publishedCategoryIssues([unavailable], candidate)).toEqual([
        expect.objectContaining({
          severity: 'error',
          code: 'QUESTION_NO_PUBLISHED_CATEGORY',
          records: [candidate.id],
        }),
      ]);
    },
  );

  it('accepts a published question when at least one linked category is published', () => {
    const draft = category('draft', 'draft');
    const published = category('published', 'published');

    expect(
      publishedCategoryIssues([draft, published], question('published', [draft.id, published.id])),
    ).toEqual([]);
  });

  it('allows a draft question to remain in a draft category', () => {
    const draft = category('draft', 'draft');

    expect(publishedCategoryIssues([draft], question('draft', [draft.id]))).toEqual([]);
  });
});
