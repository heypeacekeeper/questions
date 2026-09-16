import { describe, expect, it } from 'vitest';
import {
  buildFavoritesCatalog,
  parseFavoritesCatalog,
  resolveFavoriteIds,
} from '@/application/favorites-catalog';
import { FavoriteStore } from '@/lib/favorites';
import { STORAGE_KEYS } from '@/config/site';
import type { GameQuestion, Question } from '@/domain/question';
import { DEMO_QUESTIONS, LAUNCH_CATEGORIES } from '@/infrastructure/mock/fixtures';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function question(index: number): GameQuestion {
  return {
    id: `question-${index}`,
    a: `Option A ${index}`,
    b: `Option B ${index}`,
    s: `share-${index}`,
    d: 2000 + index,
  };
}

describe('Favorites catalog', () => {
  it('contains only published questions and marks restricted content', () => {
    const safeCategory = LAUNCH_CATEGORIES.find(
      (category) => !category.isMature && !category.requiresAgeGate,
    );
    const restrictedCategory = LAUNCH_CATEGORIES.find(
      (category) => category.isMature || category.requiresAgeGate,
    );

    if (!safeCategory || !restrictedCategory) {
      throw new Error('Expected safe and restricted fixture categories');
    }

    const safeQuestion: Question = {
      ...DEMO_QUESTIONS[0]!,
      id: 'favorite-safe',
      shareCode: 'favsaf2',
      categoryIds: [safeCategory.id],
      status: 'published',
    };
    const restrictedQuestion: Question = {
      ...DEMO_QUESTIONS[0]!,
      id: 'favorite-restricted',
      shareCode: 'favres2',
      categoryIds: [restrictedCategory.id],
      status: 'published',
    };
    const archivedQuestion: Question = {
      ...DEMO_QUESTIONS[0]!,
      id: 'favorite-archived',
      shareCode: 'favarc2',
      categoryIds: [safeCategory.id],
      status: 'archived',
    };

    const file = buildFavoritesCatalog(
      [safeQuestion, restrictedQuestion, archivedQuestion],
      LAUNCH_CATEGORIES,
    );
    const payload = JSON.parse(file.json) as {
      v: number;
      q: Array<{ id: string; g: boolean }>;
    };

    expect(file.url).toBe('/game-data/favorites.json');
    expect(file.questionCount).toBe(2);
    expect(payload).toEqual({
      v: 1,
      q: [
        expect.objectContaining({ id: 'favorite-safe', g: false }),
        expect.objectContaining({ id: 'favorite-restricted', g: true }),
      ],
    });
  });
});

describe('Favorites catalog resolution', () => {
  const catalog = [
    {
      id: 'available-1',
      a: 'Current option A',
      b: 'Current option B',
      s: 'avab222',
      d: 100,
      g: false,
    },
    {
      id: 'restricted-1',
      a: 'Restricted option A',
      b: 'Restricted option B',
      s: 'restr22',
      d: 200,
      g: true,
    },
  ];

  it('validates complete catalog question data', () => {
    expect(parseFavoritesCatalog({ v: 1, q: catalog })).toEqual(catalog);
    expect(parseFavoritesCatalog({ v: 2, q: catalog })).toBeNull();
    expect(
      parseFavoritesCatalog({
        v: 1,
        q: [{ ...catalog[0], d: -1 }],
      }),
    ).toBeNull();
    expect(
      parseFavoritesCatalog({
        v: 1,
        q: [catalog[0], catalog[0]],
      }),
    ).toBeNull();
  });

  it('resolves current questions and identifies unavailable ids', () => {
    expect(
      resolveFavoriteIds(
        ['available-1', 'deleted-question', 'restricted-1', 'available-1'],
        catalog,
      ),
    ).toEqual({
      questions: [catalog[0], catalog[1]],
      unavailableIds: ['deleted-question'],
    });
  });
});

describe('FavoriteStore ID-only API', () => {
  it('stores only IDs and reports mutation results', () => {
    const storage = new MemoryStorage();
    const store = new FavoriteStore(storage);

    expect(store.saveId('question-1')).toEqual({ ok: true, saved: true });
    expect(store.saveId('question-2')).toEqual({ ok: true, saved: true });
    expect(store.toggleId('question-1')).toEqual({ ok: true, saved: false });
    expect(store.getIds()).toEqual(['question-2']);

    expect(JSON.parse(storage.getItem(STORAGE_KEYS.favorites) ?? '{}')).toEqual({
      v: 2,
      ids: ['question-2'],
    });
  });

  it('migrates legacy full-question payloads to ID-only storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEYS.favorites,
      JSON.stringify({
        v: 1,
        questions: [question(1), question(2), question(1)],
      }),
    );

    const store = new FavoriteStore(storage);

    expect(store.getIds()).toEqual(['question-1', 'question-2']);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.favorites) ?? '{}')).toEqual({
      v: 2,
      ids: ['question-1', 'question-2'],
    });
  });

  it('purges unavailable IDs during reconciliation', () => {
    const storage = new MemoryStorage();
    const store = new FavoriteStore(storage);

    store.saveId('available-1');
    store.saveId('deleted-1');

    expect(store.reconcileIds(new Set(['available-1']))).toEqual({
      ok: true,
      removed: 1,
    });
    expect(store.getIds()).toEqual(['available-1']);
  });

  it('reports storage failures explicitly', () => {
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;

    const store = new FavoriteStore(blocked);

    expect(store.saveId('question-1')).toEqual({ ok: false, saved: false });
    expect(store.clearIds()).toEqual({ ok: false });
  });
});
