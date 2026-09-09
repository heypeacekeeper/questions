/** Non-secret deployment manifest (build metadata + content checksum). */
import type { DeploymentManifest } from '@/domain/site';
import type { CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import { sha256Hex } from '@/lib/crypto';

export async function computeContentChecksum(
  categories: readonly CategoryWithCount[],
  questions: readonly Question[],
): Promise<string> {
  const cats = categories
    .filter((c) => c.status === 'published')
    .map(
      (c) =>
        `${c.id}|${c.slug}|${c.canonicalPath}|${c.h1}|${c.seoTitle}|${c.metaDescription}|${c.introduction}|${c.sortOrder}`,
    )
    .sort();
  const qs = questions
    .filter((q) => q.status === 'published')
    .map(
      (q) =>
        `${q.id}|${q.optionA}|${q.optionB}|${q.shareCode}|${q.sortOrder}|${[...q.categoryIds].sort().join(',')}`,
    )
    .sort();
  return sha256Hex(`${cats.join('\n')}\n--\n${qs.join('\n')}`);
}

export async function buildDeploymentManifest(input: {
  categories: readonly CategoryWithCount[];
  questions: readonly Question[];
  appVersion: string;
  gitCommit: string | null;
  dataProvider: string;
  now?: Date;
}): Promise<DeploymentManifest> {
  return {
    buildTimestamp: (input.now ?? new Date()).toISOString(),
    gitCommit: input.gitCommit,
    appVersion: input.appVersion,
    dataProvider: input.dataProvider,
    publishedQuestionCount: input.questions.filter((q) => q.status === 'published').length,
    publishedCategoryCount: input.categories.filter(
      (c) => c.status === 'published' && c.publishedQuestionCount > 0,
    ).length,
    contentChecksum: await computeContentChecksum(input.categories, input.questions),
  };
}
