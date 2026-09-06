/**
 * Astro integration: after the static build, write game-data packs, the
 * game-data manifest and the deployment manifest into the output directory.
 * Also copies `_headers`-equivalent config is handled by the Worker (see
 * src/middleware.ts) — static assets get cache headers from wrangler assets.
 *
 * Runs in Node during `astro build`.
 */
import type { AstroIntegration } from 'astro';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildGameData } from '@/application/game-data-service';
import { buildDeploymentManifest } from '@/application/manifest-service';
import { validateContent, hasErrors, formatIssues } from '@/application/content-validation';
import { getContentContext } from '@/repositories/factory';

function gitCommit(): string | null {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return process.env.GITHUB_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.WORKERS_CI_COMMIT_SHA ?? null;
  }
}

function appVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    return (require('../../package.json') as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

export default function buildArtifacts(): AstroIntegration {
  // The Cloudflare adapter replaces process.env with Wrangler vars before the
  // done hook. Preserve the invoking build environment without validating it
  // during config loading (so `astro check` remains credential-free).
  const invocationEnv = { ...process.env };
  return {
    name: 'wyr:build-artifacts',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        // @astrojs/cloudflare (Workers) writes static assets to dist/client.
        const root = fileURLToPath(dir);
        const outDir = existsSync(join(root, 'client')) ? join(root, 'client') : root;
        Object.assign(process.env, invocationEnv);
        const ctx = await getContentContext();
        const [categories, questions] = await Promise.all([ctx.categories.getAllCategories(), ctx.questions.getAllQuestions()]);

        // Safety net: validation also runs before the build, but never emit artifacts for invalid content.
        const issues = validateContent(categories, questions, { allowDemoContent: ctx.env.allowDemoContent });
        if (hasErrors(issues)) {
          logger.error(formatIssues(issues));
          throw new Error('Content validation failed — refusing to emit build artifacts.');
        }

        const visible = await ctx.categoryService.getVisibleCategories();
        const perCategory = await Promise.all(
          visible.map(async (category) => ({ category, questions: await ctx.questionService.getForCategory(category) })),
        );
        const mixedCats = await ctx.categoryService.getMixedGameCategories();
        const mixed = await ctx.questionService.getMixedGameQuestions(mixedCats);

        const gameData = await buildGameData(perCategory, mixed);
        for (const file of gameData.files) {
          const path = join(outDir, file.url);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, file.json, 'utf8');
        }
        const manifestPath = join(outDir, gameData.manifestUrl);
        await mkdir(dirname(manifestPath), { recursive: true });
        await writeFile(manifestPath, JSON.stringify(gameData.manifest), 'utf8');
        logger.info(`Wrote ${gameData.files.length} game-data packs for ${Object.keys(gameData.manifest.sets).length} sets`);

        const manifest = await buildDeploymentManifest({
          categories,
          questions,
          appVersion: appVersion(),
          gitCommit: gitCommit(),
          dataProvider: ctx.env.dataProvider,
        });
        await writeFile(join(outDir, 'deployment-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
        logger.info(
          `Deployment manifest: ${manifest.publishedQuestionCount} questions, ${manifest.publishedCategoryCount} categories, checksum ${manifest.contentChecksum.slice(0, 12)}…`,
        );

        if (ctx.env.dataProvider === 'mock') {
          logger.warn('Build used DATA_PROVIDER=mock. Do not deploy this output to production.');
        }
      },
    },
  };
}
