/**
 * Pure game engine: pack loading, session repeat prevention, question
 * selection. No DOM. Fully unit-testable.
 */
import type { GameQuestion } from '@/domain/question';
import type { GameDataManifest, PackSetManifestEntry } from '@/application/game-data-service';
import { pickNextUnseen } from '@/application/question-service';
import type { Rng } from '@/lib/random';

export interface SeenStore {
  get(): Set<string>;
  add(id: string): void;
  clear(): void;
}

export class SessionSeenStore implements SeenStore {
  private cache: Set<string> | null = null;
  constructor(private readonly key: string, private readonly storage: Storage | null) {}
  get(): Set<string> {
    if (this.cache) return this.cache;
    try {
      const raw = this.storage?.getItem(this.key);
      this.cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      this.cache = new Set();
    }
    return this.cache;
  }
  add(id: string): void {
    const s = this.get();
    s.add(id);
    try {
      this.storage?.setItem(this.key, JSON.stringify([...s].slice(-2000)));
    } catch {
      /* storage full or blocked */
    }
  }
  clear(): void {
    this.cache = new Set();
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }
}

export interface PackFetcher {
  (url: string): Promise<GameQuestion[]>;
}

export interface PackFilePayload {
  v: 1;
  set: string;
  i: number;
  n: number;
  q: GameQuestion[];
}

export const defaultFetcher: PackFetcher = async (url) => {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`pack ${res.status}`);
  const data = (await res.json()) as PackFilePayload;
  return Array.isArray(data.q) ? data.q : [];
};

export class GameEngine {
  private pool: GameQuestion[] = [];
  private loadedPacks = new Set<string>();
  private entry: PackSetManifestEntry | null = null;
  private loading: Promise<void> | null = null;
  private exhausted = false;

  constructor(
    private seen: SeenStore,
    private readonly fetcher: PackFetcher = defaultFetcher,
    private readonly refillThreshold = 8,
    private readonly rng: Rng = Math.random,
  ) {}

  /** Seed the pool with the server-rendered question so it's never re-shown this session. */
  primeWith(question: GameQuestion | null): void {
    if (!question) return;
    if (!this.pool.some((q) => q.id === question.id)) this.pool.unshift(question);
  }

  /** Swap the session memory (one memory per pack set). */
  setSeenStore(store: SeenStore): void {
    this.seen = store;
  }

  async useSet(entry: PackSetManifestEntry | null): Promise<void> {
    this.entry = entry;
    this.pool = [];
    this.loadedPacks.clear();
    this.exhausted = false;
    if (entry) await this.ensureSupply();
  }

  get unseenCount(): number {
    const seen = this.seen.get();
    return this.pool.filter((q) => !seen.has(q.id)).length;
  }

  get totalInSet(): number {
    return this.entry?.total ?? this.pool.length;
  }

  private get remainingPacks(): string[] {
    return (this.entry?.packs ?? []).filter((u) => !this.loadedPacks.has(u));
  }

  /** Load more packs until we have enough unseen questions or run out of packs. */
  async ensureSupply(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      while (this.unseenCount < this.refillThreshold && this.remainingPacks.length > 0) {
        const url = this.remainingPacks[0];
        if (!url) break;
        this.loadedPacks.add(url);
        try {
          const qs = await this.fetcher(url);
          const ids = new Set(this.pool.map((q) => q.id));
          for (const q of qs) if (!ids.has(q.id)) this.pool.push(q);
        } catch {
          // Network failure: continue with what we have; next call retries remaining packs.
          break;
        }
      }
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  /**
   * Next unseen question. When every question in the set has been seen, the
   * session memory for this set is cleared once and selection restarts (still
   * never repeating the current question back-to-back).
   */
  async next(currentId: string | null): Promise<GameQuestion | null> {
    await this.ensureSupply();
    let seen = this.seen.get();
    let candidate = pickNextUnseen(this.pool.filter((q) => q.id !== currentId), seen, this.rng);
    if (!candidate && this.remainingPacks.length === 0 && this.pool.length > 0) {
      if (this.exhausted || this.pool.length === 1) {
        // Only one question exists: nothing else to show.
        if (this.pool.length === 1) return null;
      }
      this.exhausted = true;
      this.seen.clear();
      seen = this.seen.get();
      candidate = pickNextUnseen(this.pool.filter((q) => q.id !== currentId), seen, this.rng);
    }
    if (candidate) this.seen.add(candidate.id);
    return candidate;
  }

  markSeen(id: string): void {
    this.seen.add(id);
  }
}

export async function loadManifest(url: string): Promise<GameDataManifest | null> {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return null;
    const data = (await res.json()) as GameDataManifest;
    return data && data.version === 1 && data.sets ? data : null;
  } catch {
    return null;
  }
}

export function formatVotes(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'vote' : 'votes'}`;
}

export function verdictText(selectedPercent: number, total: number): string {
  if (total === 1) return "You're the first to vote on this question!";
  return selectedPercent >= 50
    ? `That option currently has ${selectedPercent}% of the votes.`
    : `That option currently has ${selectedPercent}% of the votes.`;
}
