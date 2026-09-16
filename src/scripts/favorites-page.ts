import {
  fetchFavoritesCatalog,
  resolveFavoriteIds,
  type FavoriteCatalogQuestion,
} from '@/application/favorites-catalog';
import { FavoriteStore } from '@/lib/favorites';
import { sharePath, STORAGE_KEYS } from '@/config/site';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

function safeLocalStorage(): Storage | null {
  try {
    localStorage.getItem('__favorites_test');
    return localStorage;
  } catch {
    return null;
  }
}

function confirmRestrictedContent(storage: Storage | null): boolean {
  if (storage?.getItem(STORAGE_KEYS.adultConfirmed) === '1') return true;

  const confirmed = window.confirm(
    'Some saved questions contain mature content. Confirm that you are 18 or older to continue.',
  );

  if (confirmed) {
    try {
      storage?.setItem(STORAGE_KEYS.adultConfirmed, '1');
    } catch {
      // Confirmation remains valid for this navigation.
    }
  }

  return confirmed;
}

function createFavoriteCard(
  question: FavoriteCatalogQuestion,
  remove: (questionId: string) => void,
  storage: Storage | null,
): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'favorite-card';

  const text = document.createElement('p');
  text.className = 'favorite-question';
  text.textContent = `Would you rather ${question.a} or ${question.b}?`;

  const actions = document.createElement('div');
  actions.className = 'favorite-card-actions';

  const open = document.createElement('a');
  open.href = sharePath(question.s);
  open.textContent = 'Open question';

  if (question.g) {
    open.addEventListener('click', (event) => {
      if (confirmRestrictedContent(storage)) return;
      event.preventDefault();
    });
  }

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.textContent = 'Remove';
  removeButton.setAttribute('aria-label', `Remove “${question.a} or ${question.b}” from favorites`);
  removeButton.addEventListener('click', () => remove(question.id));

  actions.append(open, removeButton);
  item.append(text, actions);

  return item;
}

export function initFavoritesPage(): void {
  const list = $<HTMLOListElement>('favorite-list');
  const empty = $('favorites-empty');
  const count = $('favorites-count');
  const clearButton = $<HTMLButtonElement>('clear-favorites');
  const playLink = $<HTMLAnchorElement>('play-favorites');
  const live = $('favorites-live');

  if (!list || list.dataset.ready === '1') return;
  list.dataset.ready = '1';

  const storage = safeLocalStorage();
  const store = new FavoriteStore(storage);
  let renderRequest = 0;
  let currentQuestions: readonly FavoriteCatalogQuestion[] = [];

  const announce = (message: string) => {
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => {
      live.textContent = message;
    });
  };

  const showUnavailable = (message: string) => {
    if (count) count.textContent = message;
    if (empty) empty.hidden = false;
    if (clearButton) clearButton.hidden = true;
    if (playLink) playLink.hidden = true;
    list.hidden = true;
  };

  const render = async () => {
    const request = ++renderRequest;

    if (!storage) {
      showUnavailable('Favorites are unavailable in this browser.');
      return;
    }

    if (count) count.textContent = 'Loading saved questions…';

    const catalog = await fetchFavoritesCatalog();
    if (request !== renderRequest) return;

    if (!catalog) {
      showUnavailable('Could not load saved questions. Check your connection and reload.');
      return;
    }

    const resolved = resolveFavoriteIds(store.getIds(), catalog);
    const reconciliation = store.reconcileIds(new Set(catalog.map((question) => question.id)));

    if (!reconciliation.ok) {
      showUnavailable('Favorites could not be updated in this browser.');
      return;
    }

    currentQuestions = resolved.questions;

    list.replaceChildren(
      ...currentQuestions.map((question) =>
        createFavoriteCard(
          question,
          (questionId) => {
            const result = store.removeId(questionId);

            if (!result.ok) {
              announce('Could not remove the question. Browser storage is unavailable.');
              return;
            }

            void render();
            announce('Question removed from favorites.');
          },
          storage,
        ),
      ),
    );

    if (count) {
      count.textContent =
        currentQuestions.length === 1
          ? '1 saved question'
          : `${currentQuestions.length} saved questions`;
    }

    const hasQuestions = currentQuestions.length > 0;
    list.hidden = !hasQuestions;
    if (empty) empty.hidden = hasQuestions;
    if (clearButton) clearButton.hidden = !hasQuestions;
    if (playLink) playLink.hidden = !hasQuestions;

    if (reconciliation.removed > 0) {
      announce(
        reconciliation.removed === 1
          ? 'One unavailable saved question was removed.'
          : `${reconciliation.removed} unavailable saved questions were removed.`,
      );
    }
  };

  playLink?.addEventListener('click', (event) => {
    if (!currentQuestions.some((question) => question.g)) return;
    if (confirmRestrictedContent(storage)) return;
    event.preventDefault();
  });

  clearButton?.addEventListener('click', () => {
    if (!window.confirm('Remove all saved questions?')) return;

    const result = store.clearIds();
    if (!result.ok) {
      announce('Could not clear favorites. Browser storage is unavailable.');
      return;
    }

    void render();
    announce('All favorites removed.');
  });

  window.addEventListener('pageshow', () => void render());
  window.addEventListener('storage', () => void render());
  void render();
}
