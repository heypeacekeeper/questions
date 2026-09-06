/**
 * Builds category-specific game-data packs and the manifest that maps each
 * pack to its content-hashed URL. Pure (no I/O): the build integration writes
 * the returned files to disk.
 *
 * Packs never include vote totals (they are long-lived static files).
 */
import type { CategoryWithCount } from '@/domain/category';
import type { Question } from '@/domain/question';
import { toGameQuestion, type GameQuestion } from '@/domain/question';
import { GAME_DATA, ROUTES } from '@/config/site';
import { contentHash } from '@/lib/crypto';
import { seedFromString, seededRng, shuffle } from '@/lib/random';

export const MIXED_PACK_SLUG = 'mixed';

export interface GamePackFile {
  /** Site-relative URL e.g. /game-data/funny/pack-01.a1b2c3d4e5.json */
  readonly url: string;
  readonly json: string;
  readonly questionCount: number;
}

export interface PackSetManifestEntry {
  readonly slug: string;
  readonly name: string;
  readonly icon: string;
  readonly requiresAgeGate: boolean;
  readonly total: number;
  /** Hashed pack URLs, in load order. */
  readonly packs: readonly string[];
}

export interface GameDataManifest {
  readonly version: 1;
  readonly generatedAt: string;
  readonly sets: Record<string, PackSetManifestEntry>;
}

export interface GameDataBuild {
  readonly files: readonly GamePackFile[];
  readonly manifest: GameDataManifest;
  readonly manifestUrl: string;
}

export interface PackSource {
  readonly slug: string;
  readonly name: string;
  readonly icon: string;
  readonly requiresAgeGate: boolean;
  readonly questions: readonly Question[];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function buildPackSet(source: PackSource, perPack: number = GAME_DATA.questionsPerPack, maxPacks?: number): Promise<{ files: GamePackFile[]; entry: PackSetManifestEntry }> {
  const ordered = shuffle(source.questions, seededRng(seedFromString(`pack:${source.slug}`)));
  let chunks = chunk(ordered.map(toGameQuestion), perPack);
  if (maxPacks !== undefined) chunks = chunks.slice(0, maxPacks);
  const files: GamePackFile[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const questions: GameQuestion[] = chunks[i] ?? [];
    const json = JSON.stringify({ v: 1, set: source.slug, i, n: chunks.length, q: questions });
    const hash = await contentHash(json, GAME_DATA.hashLength);
    files.push({
      url: `${ROUTES.gameDataPrefix}${source.slug}/pack-${String(i + 1).padStart(2, '0')}.${hash}.json`,
      json,
      questionCount: questions.length,
    });
  }
  return {
    files,
    entry: {
      slug: source.slug,
      name: source.name,
      icon: source.icon,
      requiresAgeGate: source.requiresAgeGate,
      total: files.reduce((n, f) => n + f.questionCount, 0),
      packs: files.map((f) => f.url),
    },
  };
}

export async function buildGameData(
  categories: readonly { category: CategoryWithCount; questions: readonly Question[] }[],
  mixedQuestions: readonly Question[],
): Promise<GameDataBuild> {
  const files: GamePackFile[] = [];
  const sets: Record<string, PackSetManifestEntry> = {};

  const mixed = await buildPackSet(
    { slug: MIXED_PACK_SLUG, name: 'Mixed', icon: '🎲', requiresAgeGate: false, questions: mixedQuestions },
    GAME_DATA.questionsPerPack,
    GAME_DATA.maxMixedPacks,
  );
  files.push(...mixed.files);
  sets[MIXED_PACK_SLUG] = mixed.entry;

  for (const { category, questions } of categories) {
    if (questions.length === 0) continue;
    const set = await buildPackSet({ slug: category.slug, name: category.name, icon: category.icon, requiresAgeGate: category.requiresAgeGate, questions });
    files.push(...set.files);
    sets[category.slug] = set.entry;
  }

  const manifest: GameDataManifest = { version: 1, generatedAt: new Date().toISOString(), sets };
  return { files, manifest, manifestUrl: `${ROUTES.gameDataPrefix}${GAME_DATA.manifestFile}` };
}
