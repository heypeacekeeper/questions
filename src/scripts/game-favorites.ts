import type { GameQuestion } from '@/domain/question';
import {
  FavoriteStore,
  type FavoriteMutationResult,
  type FavoriteReconcileResult,
} from '@/lib/favorites';

interface GameFavoritesOptions {
  readonly button: HTMLButtonElement | null;
  readonly icon: HTMLElement | null;
  readonly toast: HTMLElement | null;
  readonly storage: Storage | null;
  readonly storageKey: string;
}

export interface GameFavoritesController {
  update(question: GameQuestion | null): void;
  toggle(question: GameQuestion | null): FavoriteMutationResult | null;
  getIds(): readonly string[];
  reconcileIds(availableIds: ReadonlySet<string>): FavoriteReconcileResult;
}

export function createGameFavoritesController({
  button,
  icon,
  toast,
  storage,
  storageKey,
}: GameFavoritesOptions): GameFavoritesController {
  const store = new FavoriteStore(storage, storageKey);
  let toastTimer: number | null = null;

  function showMessage(message: string): void {
    if (!toast) return;

    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }

    toast.textContent = message;
    toast.hidden = false;

    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
      toast.textContent = '';
      toastTimer = null;
    }, 2000);
  }

  function update(question: GameQuestion | null): void {
    if (!button) return;

    const saved = Boolean(question && store.hasId(question.id));

    button.hidden = !question || !storage;
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute(
      'aria-label',
      saved ? 'Remove this question from favorites' : 'Save this question to favorites',
    );
    button.title = saved ? 'Remove from favorites' : 'Save question';

    if (icon) icon.textContent = saved ? '♥' : '♡';
  }

  function toggle(question: GameQuestion | null): FavoriteMutationResult | null {
    if (!question) return null;

    const result = store.toggleId(question.id);

    if (!result.ok) {
      showMessage('Favorites are unavailable in this browser.');
      return result;
    }

    update(question);
    showMessage(result.saved ? 'Added to favorites ♥' : 'Removed from favorites');

    return result;
  }

  return {
    update,
    toggle,
    getIds: () => store.getIds(),
    reconcileIds: (availableIds) => store.reconcileIds(availableIds),
  };
}
