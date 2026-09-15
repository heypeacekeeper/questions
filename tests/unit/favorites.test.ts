import { describe, expect, it } from 'vitest';
import { FavoriteStore, MAX_FAVORITES, isFavoriteQuestion } from '@/lib/favorites';
import { STORAGE_KEYS } from '@/config/site';
import type { GameQuestion } from '@/domain/question';

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

describe('FavoriteStore', () => {
  it('saves, updates and de-duplicates questions', () => {
    const storage = new MemoryStorage();
    const store = new FavoriteStore(storage);
    const original = question(1);

    expect(store.save(original)).toBe(true);
    expect(store.has(original.id)).toBe(true);

    expect(store.save({ ...original, a: 'Updated option' })).toBe(true);
    expect(store.getAll()).toEqual([{ ...original, a: 'Updated option' }]);
  });

  it('removes and clears saved questions', () => {
    const store = new FavoriteStore(new MemoryStorage());

    store.save(question(1));
    store.save(question(2));
    expect(store.getAll()).toHaveLength(2);

    expect(store.remove('question-1')).toBe(true);
    expect(store.has('question-1')).toBe(false);

    store.clear();
    expect(store.getAll()).toEqual([]);
  });

  it('ignores malformed, invalid and unsupported storage data', () => {
    const storage = new MemoryStorage();
    const store = new FavoriteStore(storage);

    storage.setItem(STORAGE_KEYS.favorites, '{broken');
    expect(store.getAll()).toEqual([]);

    storage.setItem(STORAGE_KEYS.favorites, JSON.stringify({ v: 2, questions: [question(1)] }));
    expect(store.getAll()).toEqual([]);

    storage.setItem(
      STORAGE_KEYS.favorites,
      JSON.stringify({
        v: 1,
        questions: [question(1), { ...question(2), d: -1 }, question(1)],
      }),
    );
    expect(store.getAll()).toEqual([question(1)]);
  });

  it('keeps only the newest one hundred favorites', () => {
    const store = new FavoriteStore(new MemoryStorage());

    for (let index = 0; index < MAX_FAVORITES + 5; index += 1) {
      store.save(question(index));
    }

    const favorites = store.getAll();
    expect(favorites).toHaveLength(MAX_FAVORITES);
    expect(favorites[0]?.id).toBe(`question-${MAX_FAVORITES + 4}`);
    expect(favorites.some((item) => item.id === 'question-0')).toBe(false);
  });

  it('handles unavailable storage without throwing', () => {
    const blocked: Storage = {
      length: 0,
      clear: () => {
        throw new Error('blocked');
      },
      getItem: () => {
        throw new Error('blocked');
      },
      key: () => null,
      removeItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    const store = new FavoriteStore(blocked);

    expect(store.getAll()).toEqual([]);
    expect(store.save(question(1))).toBe(false);
    expect(() => store.clear()).not.toThrow();
  });

  it('validates favorite question data', () => {
    expect(isFavoriteQuestion(question(1))).toBe(true);
    expect(isFavoriteQuestion({ ...question(1), a: '' })).toBe(false);
    expect(isFavoriteQuestion({ ...question(1), d: 1.5 })).toBe(false);
    expect(isFavoriteQuestion(null)).toBe(false);
  });
});
