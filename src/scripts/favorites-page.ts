import { FavoriteStore } from '@/lib/favorites';
import { sharePath } from '@/config/site';
import type { GameQuestion } from '@/domain/question';

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

function createFavoriteCard(
  question: GameQuestion,
  remove: (questionId: string) => void,
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

  const announce = (message: string) => {
    if (!live) return;
    live.textContent = '';
    requestAnimationFrame(() => {
      live.textContent = message;
    });
  };

  const render = () => {
    if (!storage) {
      if (count) count.textContent = 'Favorites are unavailable in this browser.';
      if (empty) empty.hidden = false;
      if (clearButton) clearButton.hidden = true;
      if (playLink) playLink.hidden = true;
      list.hidden = true;
      return;
    }

    const questions = store.getAll();
    list.replaceChildren(
      ...questions.map((question) =>
        createFavoriteCard(question, (questionId) => {
          store.remove(questionId);
          render();
          announce('Question removed from favorites.');
        }),
      ),
    );

    if (count) {
      count.textContent =
        questions.length === 1 ? '1 saved question' : `${questions.length} saved questions`;
    }

    const hasQuestions = questions.length > 0;
    list.hidden = !hasQuestions;
    if (empty) empty.hidden = hasQuestions;
    if (clearButton) clearButton.hidden = !hasQuestions;
    if (playLink) playLink.hidden = !hasQuestions;
  };

  clearButton?.addEventListener('click', () => {
    if (!window.confirm('Remove all saved questions?')) return;

    store.clear();
    render();
    announce('All favorites removed.');
  });

  window.addEventListener('pageshow', render);
  window.addEventListener('storage', render);
  render();
}
