/** Progressive enhancement controller for the static first game question. */
import type { GameQuestion } from '@/domain/question';
import { FavoriteStore } from '@/lib/favorites';
import type { GameDataManifest, PackSetManifestEntry } from '@/application/game-data-service';
import {
  formatGeneratedPercent,
  GameEngine,
  generatedDisplayResult,
  loadManifest,
  SessionSeenStore,
} from './game-engine';

interface GameConfig {
  mode: 'mixed' | 'category' | 'single' | 'favorites';
  set: string;
  manifest: string;
  refill: number;
  sharePrefix: string;
  keys: { pack: string; adult: string; seen: string; favorites: string };
  initial: GameQuestion | null;
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;
function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    const storage = kind === 'local' ? localStorage : sessionStorage;
    storage.getItem('__t');
    return storage;
  } catch {
    return null;
  }
}

export function initGame(): void {
  const shell = $('game-shell');
  if (!shell || shell.dataset.ready === '1') return;
  shell.dataset.ready = '1';
  let config: GameConfig;
  try {
    config = JSON.parse(shell.dataset.gameConfig ?? '{}') as GameConfig;
  } catch {
    return;
  }
  const stage = $('game-stage');
  const choiceA = $<HTMLButtonElement>('choice-a');
  const choiceB = $<HTMLButtonElement>('choice-b');
  const textA = $('text-a');
  const textB = $('text-b');
  const percentA = $('percent-a');
  const percentB = $('percent-b');
  const voteCount = $('vote-count');
  const fillA = $('fill-a');
  const fillB = $('fill-b');
  const verdict = $('verdict-text');
  const nextButton = $<HTMLButtonElement>('next-button');
  const nextLabel = $('next-label');
  const live = $('game-live');
  const favoriteButton = $<HTMLButtonElement>('favorite-button');
  const favoriteIcon = $('favorite-icon');
  const favoriteToast = $('favorite-toast');
  let favoriteToastTimer: number | null = null;
  const shareButton = $<HTMLButtonElement>('share-button');
  const fullscreenButton = $<HTMLButtonElement>('fullscreen-button');
  const packButton = $<HTMLButtonElement>('pack-button');
  const packLabel = $('pack-label');
  const packDialog = $<HTMLDialogElement>('pack-dialog');
  const packGrid = $('pack-grid');
  const packPicker = $('pack-picker');
  const ageGate = $('age-gate');
  const ageGatePack = $('age-gate-pack');
  const favoritesGameEmpty = $('favorites-game-empty');
  const favoritesGameEmptyText = $('favorites-game-empty-text');
  if (!stage) return;
  const gameStage = stage;
  const local = safeStorage('local');
  const session = safeStorage('session');
  const favorites = new FavoriteStore(local, config.keys.favorites);
  const engine = new GameEngine(
    new SessionSeenStore(`${config.keys.seen}:${config.set}`, session),
    undefined,
    config.refill,
  );
  let current: GameQuestion | null = config.initial;
  let hasVoted = false;
  let lastPick: 'A' | 'B' | null = null;
  let busy = false;
  let manifest: GameDataManifest | null = null;
  let pendingGatedPack: { slug: string; name: string } | null = null;
  let activationRequestId = 0;
  let userSelectedPack = false;
  function showFavoriteMessage(message: string): void {
    if (!favoriteToast) return;

    if (favoriteToastTimer !== null) {
      window.clearTimeout(favoriteToastTimer);
    }

    favoriteToast.textContent = message;
    favoriteToast.hidden = false;

    favoriteToastTimer = window.setTimeout(() => {
      favoriteToast.hidden = true;
      favoriteToast.textContent = '';
      favoriteToastTimer = null;
    }, 2000);
  }

  function updateFavoriteButton(): void {
    if (!favoriteButton) return;

    const saved = Boolean(current && favorites.has(current.id));
    favoriteButton.hidden = !current || !local;
    favoriteButton.setAttribute('aria-pressed', String(saved));
    favoriteButton.setAttribute(
      'aria-label',
      saved ? 'Remove this question from favorites' : 'Save this question to favorites',
    );
    favoriteButton.title = saved ? 'Remove from favorites' : 'Save question';

    if (favoriteIcon) favoriteIcon.textContent = saved ? '♥' : '♡';
  }

  function toggleFavorite(): void {
    if (!current) return;

    const wasSaved = favorites.has(current.id);
    favorites.toggle(current);
    const saved = favorites.has(current.id);

    updateFavoriteButton();

    if (saved === wasSaved) {
      showFavoriteMessage('Favorites are unavailable in this browser.');
      return;
    }

    showFavoriteMessage(saved ? 'Added to favorites ♥' : 'Removed from favorites');

    if (config.mode === 'favorites') {
      const questions = favorites.getAll();
      engine.useQuestions(questions);

      if (!saved && questions.length === 0) {
        gameStage.hidden = true;
        if (favoritesGameEmpty) favoritesGameEmpty.hidden = false;
        if (favoritesGameEmptyText) {
          favoritesGameEmptyText.textContent =
            'You have no saved questions left. Return to the main game to save more.';
        }
        announce('You have no saved questions left.');
        return;
      }

      if (current) engine.markSeen(current.id);
    }
  }
  if (current) {
    engine.primeWith(current);
    engine.markSeen(current.id);
  }
  if (shareButton && current) shareButton.hidden = false;
  updateFavoriteButton();
  type WebkitDocument = Document & {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  type WebkitElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };

  const fullscreenDocument = document as WebkitDocument;
  const fullscreenShell = shell as WebkitElement;
  const standardFullscreenAvailable =
    document.fullscreenEnabled && typeof shell.requestFullscreen === 'function';
  const webkitFullscreenAvailable =
    Boolean(fullscreenDocument.webkitFullscreenEnabled) &&
    typeof fullscreenShell.webkitRequestFullscreen === 'function';

  if (fullscreenButton && (standardFullscreenAvailable || webkitFullscreenAvailable)) {
    fullscreenButton.hidden = false;
  }
  const announce = (message: string) => {
    if (live) {
      live.textContent = '';
      requestAnimationFrame(() => {
        if (live) live.textContent = message;
      });
    }
  };
  const setNotice = (message: string) => {
    if (verdict) verdict.textContent = message;
    gameStage.classList.add('has-notice');
  };

  function renderQuestion(question: GameQuestion): void {
    current = question;
    hasVoted = false;
    lastPick = null;
    gameStage.classList.remove('voted', 'has-notice');
    gameStage.dataset.questionId = question.id;
    gameStage.dataset.shareCode = question.s;
    updateFavoriteButton();
    [choiceA, choiceB].forEach((button) => button?.classList.remove('picked', 'not-picked'));
    if (textA) textA.textContent = question.a;
    if (textB) textB.textContent = question.b;
    [percentA, percentB, voteCount, verdict].forEach((element) => {
      if (element) element.textContent = '';
    });
    if (fillA) fillA.style.height = '0';
    if (fillB) fillB.style.height = '0';

    announce(`Would you rather ${question.a}, or ${question.b}?`);
  }
  function choose(choice: 'A' | 'B'): void {
    if (!current || busy) return;
    if (hasVoted && lastPick === choice) return;
    hasVoted = true;
    lastPick = choice;
    gameStage.classList.add('voted');
    const picked = choice === 'A' ? choiceA : choiceB;
    const other = choice === 'A' ? choiceB : choiceA;
    [choiceA, choiceB].forEach((button) => button?.classList.remove('picked', 'not-picked'));
    picked?.classList.add('picked');
    other?.classList.add('not-picked');
    const result = generatedDisplayResult(current.id);
    if (percentA) percentA.textContent = formatGeneratedPercent(result.percentA);
    if (percentB) percentB.textContent = formatGeneratedPercent(result.percentB);
    if (voteCount) voteCount.textContent = `${current.d.toLocaleString('en-US')} votes`;
    requestAnimationFrame(() => {
      if (fillA) fillA.style.height = `${result.percentA}%`;
      if (fillB) fillB.style.height = `${result.percentB}%`;
    });

    announce(
      `Option A ${formatGeneratedPercent(result.percentA)}. Option B ${formatGeneratedPercent(result.percentB)}. ${current.d.toLocaleString('en-US')} votes.`,
    );
  }
  async function nextQuestion(): Promise<void> {
    if (busy || config.mode === 'single') return;
    if (
      config.mode === 'favorites' &&
      engine.unseenCount === 0 &&
      nextButton?.dataset.action !== 'replay'
    ) {
      const message = 'You have played every saved question. Nice work.';
      setNotice(message);
      announce(message);
      nextButton?.setAttribute('data-action', 'replay');
      if (nextLabel) nextLabel.textContent = 'Play again';
      return;
    }
    if (nextButton?.dataset.action === 'retry') {
      delete nextButton.dataset.action;
    }

    busy = true;
    gameStage.setAttribute('aria-busy', 'true');
    if (nextButton) nextButton.disabled = true;
    if (nextLabel) nextLabel.textContent = 'Loading…';
    announce('Loading next question.');
    try {
      if (config.mode === 'favorites' && nextButton?.dataset.action === 'replay') {
        const questions = favorites.getAll();
        const replaySeen = new SessionSeenStore(`${config.keys.seen}:favorites`, session);

        replaySeen.clear();
        engine.setSeenStore(replaySeen);
        engine.useQuestions(questions);
        delete nextButton.dataset.action;

        const replayQuestion = await engine.next(null);
        if (replayQuestion) {
          renderQuestion(replayQuestion);
        } else {
          setNotice('Save at least one question before playing favorites.');
        }

        return;
      }

      const question = await engine.next(current?.id ?? null);
      if (question) {
        renderQuestion(question);
      } else if (engine.supplyLoadFailed) {
        const message = 'Could not load more questions. Check your connection and try again.';
        setNotice(message);
        announce(message);
        nextButton?.setAttribute('data-action', 'retry');
      } else {
        setNotice(
          engine.totalInSet <= 1
            ? 'That is the only question in this collection right now.'
            : 'You have seen every question in this collection. Nice work!',
        );
      }
    } finally {
      busy = false;
      gameStage.removeAttribute('aria-busy');
      if (nextButton) nextButton.disabled = false;
      if (nextLabel) {
        nextLabel.textContent =
          nextButton?.dataset.action === 'replay'
            ? 'Play again'
            : nextButton?.dataset.action === 'retry'
              ? 'Try again'
              : 'Next question';
      }
    }
  }
  async function activateFavoritesGame(): Promise<void> {
    const questions = favorites.getAll();
    const favoritesSeen = new SessionSeenStore(`${config.keys.seen}:favorites`, session);
    favoritesSeen.clear();
    engine.setSeenStore(favoritesSeen);
    engine.useQuestions(questions);

    if (questions.length === 0) {
      gameStage.hidden = true;
      if (favoritesGameEmpty) favoritesGameEmpty.hidden = false;
      if (favoritesGameEmptyText) {
        favoritesGameEmptyText.textContent = local
          ? 'You have no saved questions yet. Return to the main game and tap the heart to add some.'
          : 'Favorites are unavailable in this browser.';
      }
      return;
    }

    const question = await engine.next(null);
    if (!question) return;

    if (favoritesGameEmpty) favoritesGameEmpty.hidden = true;
    gameStage.hidden = false;
    renderQuestion(question);
    if (shareButton) shareButton.hidden = false;
    announce(`Playing ${questions.length} saved questions.`);
  }

  async function ensureManifest(): Promise<GameDataManifest | null> {
    manifest ??= await loadManifest(config.manifest);
    return manifest;
  }
  async function activateSet(slug: string, label?: string): Promise<number | null> {
    const requestId = ++activationRequestId;
    const entry: PackSetManifestEntry | null = (await ensureManifest())?.sets[slug] ?? null;
    if (requestId !== activationRequestId) return null;
    if (packLabel && label) packLabel.textContent = label;
    engine.setSeenStore(new SessionSeenStore(`${config.keys.seen}:${slug}`, session));
    await engine.useSet(entry);
    if (requestId !== activationRequestId) return null;
    packGrid
      ?.querySelectorAll<HTMLButtonElement>('.pack-button')
      .forEach((button) =>
        button.setAttribute('aria-current', button.dataset.pack === slug ? 'true' : 'false'),
      );
    return requestId;
  }
  function openDialog(): void {
    if (!packDialog) return;
    if (packPicker) packPicker.hidden = false;
    if (ageGate) ageGate.hidden = true;
    if (typeof packDialog.showModal !== 'function') {
      setNotice('Pack selection requires a newer browser. You can continue playing Mixed.');
      return;
    }
    packDialog.showModal();
  }
  function closeDialog(): void {
    if (!packDialog) return;
    if (typeof packDialog.close === 'function') packDialog.close();
    packButton?.focus();
  }
  async function choosePack(slug: string, name: string, gated: boolean): Promise<void> {
    if (gated && local?.getItem(config.keys.adult) !== '1') {
      pendingGatedPack = { slug, name };
      if (packPicker) packPicker.hidden = true;
      if (ageGate) ageGate.hidden = false;
      if (ageGatePack) ageGatePack.textContent = name;
      $('confirm-age-button')?.focus();
      return;
    }
    userSelectedPack = true;
    const requestId = await activateSet(slug, name);
    if (requestId === null) return;

    closeDialog();
    const question = await engine.next(current?.id ?? null);
    if (requestId !== activationRequestId) return;

    if (question) renderQuestion(question);
    else setNotice('No questions are available in this pack yet.');
  }
  async function share(): Promise<void> {
    if (!current) return;
    const url = `${location.origin}${config.sharePrefix}${current.s}/`;
    const title = `Would you rather ${current.a} or ${current.b}?`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      /* Clipboard fallback. */
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied!');
      announce('Link copied to clipboard.');
    } catch {
      setNotice(url);
    }
  }
  const isFullscreen = () =>
    Boolean(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement);

  const runFullscreenAction = (action: (() => Promise<void> | void) | undefined): void => {
    if (!action) return;

    try {
      void Promise.resolve(action()).catch(() => undefined);
    } catch {
      // Fullscreen can be rejected by browser or permission policy.
    }
  };

  const toggleFullscreen = () => {
    if (isFullscreen()) {
      const exit =
        typeof document.exitFullscreen === 'function'
          ? document.exitFullscreen.bind(document)
          : fullscreenDocument.webkitExitFullscreen?.bind(fullscreenDocument);

      runFullscreenAction(exit);
      return;
    }

    const enter =
      typeof shell.requestFullscreen === 'function'
        ? shell.requestFullscreen.bind(shell)
        : fullscreenShell.webkitRequestFullscreen?.bind(fullscreenShell);

    runFullscreenAction(enter);
  };
  const updateFullscreenLabel = () =>
    fullscreenButton?.setAttribute(
      'aria-label',
      isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen',
    );
  choiceA?.addEventListener('click', () => choose('A'));
  choiceB?.addEventListener('click', () => choose('B'));
  nextButton?.addEventListener('click', () => void nextQuestion());
  favoriteButton?.addEventListener('click', toggleFavorite);
  shareButton?.addEventListener('click', () => void share());
  fullscreenButton?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenLabel);
  document.addEventListener('webkitfullscreenchange', updateFullscreenLabel);
  packButton?.addEventListener('click', openDialog);
  $('close-pack-dialog')?.addEventListener('click', closeDialog);
  $('close-age-gate')?.addEventListener('click', closeDialog);
  $('age-back-button')?.addEventListener('click', () => {
    if (ageGate) ageGate.hidden = true;
    if (packPicker) packPicker.hidden = false;
    pendingGatedPack = null;
  });
  $('confirm-age-button')?.addEventListener('click', () => {
    try {
      local?.setItem(config.keys.adult, '1');
    } catch {
      // Continue for this visit when storage is unavailable.
    }

    const pack = pendingGatedPack;
    pendingGatedPack = null;
    if (pack) void choosePack(pack.slug, pack.name, false);
  });
  packGrid?.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.pack-button');
    if (button)
      void choosePack(
        button.dataset.pack ?? config.set,
        button.dataset.name ?? 'Mixed',
        button.dataset.gated === '1',
      );
  });
  packDialog?.addEventListener('click', (event) => {
    if (event.target !== packDialog) return;
    const box = packDialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    ) {
      closeDialog();
    }
  });
  if (config.mode === 'favorites') void activateFavoritesGame();

  if (config.mode !== 'single' && config.mode !== 'favorites') {
    async function loadRandomEntryQuestion(): Promise<void> {
      if (busy || userSelectedPack) return;

      busy = true;
      gameStage.dataset.entryReady = '0';
      gameStage.setAttribute('aria-busy', 'true');
      if (nextButton) nextButton.disabled = true;
      if (choiceA) choiceA.disabled = true;
      if (choiceB) choiceB.disabled = true;
      if (favoriteButton) favoriteButton.disabled = true;
      if (shareButton) shareButton.disabled = true;
      if (packButton) packButton.disabled = true;

      try {
        if (config.mode === 'mixed') {
          local?.removeItem(config.keys.pack);
        }

        const previousQuestionId = current?.id ?? null;
        const requestId = await activateSet(config.set);

        if (requestId === null || userSelectedPack) return;

        const question = await engine.next(previousQuestionId);

        if (requestId !== activationRequestId || userSelectedPack) return;

        if (question) {
          renderQuestion(question);
        }
      } finally {
        busy = false;
        gameStage.dataset.entryReady = '1';
        gameStage.removeAttribute('aria-busy');
        if (nextButton) nextButton.disabled = false;
        if (choiceA) choiceA.disabled = false;
        if (choiceB) choiceB.disabled = false;
        if (favoriteButton) favoriteButton.disabled = false;
        if (shareButton) shareButton.disabled = false;
        if (packButton) packButton.disabled = false;
      }
    }

    void loadRandomEntryQuestion();

    window.addEventListener('pageshow', (event) => {
      if (!event.persisted || busy) return;

      gameStage.dataset.entryReady = '0';

      void nextQuestion().finally(() => {
        gameStage.dataset.entryReady = '1';
      });
    });
  }
}
