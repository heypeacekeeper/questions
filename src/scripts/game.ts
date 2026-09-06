/**
 * DOM controller for the game. Progressive enhancement over the server-rendered
 * first question. Keyboard: ← vote A, → vote B, Enter/Space next (after voting),
 * C packs (homepage), F fullscreen.
 */
import type { GameQuestion } from '@/domain/question';
import type { VoteResult } from '@/domain/vote';
import type { GameDataManifest, PackSetManifestEntry } from '@/application/game-data-service';
import { GameEngine, SessionSeenStore, VotedStore, formatVotes, loadManifest, verdictText } from './game-engine';
import { track, reportApiTiming } from './analytics';

interface GameConfig {
  mode: 'mixed' | 'category' | 'single';
  set: string;
  manifest: string;
  voteApi: string;
  votingEnabled: boolean;
  refill: number;
  sharePrefix: string;
  keys: { pack: string; adult: string; voted: string; seen: string };
  cookie: string;
  category: string | null;
  initial: GameQuestion | null;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    s.getItem('__t');
    return s;
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
  const votesA = $('votes-a');
  const votesB = $('votes-b');
  const fillA = $('fill-a');
  const fillB = $('fill-b');
  const verdict = $('verdict-text');
  const nextButton = $<HTMLButtonElement>('next-button');
  const live = $('game-live');
  const shareButton = $<HTMLButtonElement>('share-button');
  const fullscreenButton = $<HTMLButtonElement>('fullscreen-button');
  const packButton = $<HTMLButtonElement>('pack-button');
  const packLabel = $('pack-label');
  const packDialog = $<HTMLDialogElement>('pack-dialog');
  const packGrid = $('pack-grid');
  const packPicker = $('pack-picker');
  const ageGate = $('age-gate');
  const ageGatePack = $('age-gate-pack');

  if (!stage) return;

  const local = safeStorage('local');
  const session = safeStorage('session');
  const seen = new SessionSeenStore(config.keys.seen + ':' + config.set, session);
  const voted = new VotedStore(config.keys.voted, local);
  const engine = new GameEngine(seen, undefined, config.refill);

  let current: GameQuestion | null = config.initial;
  let hasVoted = false;
  let busy = false;
  let manifest: GameDataManifest | null = null;
  let currentSet = config.set;
  let pendingGatedPack: { slug: string; name: string } | null = null;

  if (current) {
    engine.primeWith(current);
    engine.markSeen(current.id);
  }

  // Toolbar buttons only make sense with JS.
  if (shareButton && current) shareButton.hidden = false;
  if (fullscreenButton && (document.fullscreenEnabled || (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled)) {
    fullscreenButton.hidden = false;
  }

  const announce = (msg: string) => {
    if (live) {
      live.textContent = '';
      requestAnimationFrame(() => (live.textContent = msg));
    }
  };

  const setNotice = (msg: string) => {
    if (!verdict) return;
    verdict.textContent = msg;
    stage.classList.add('notice');
  };

  function renderQuestion(q: GameQuestion): void {
    current = q;
    hasVoted = false;
    stage.classList.remove('voted', 'notice');
    stage.dataset.questionId = q.id;
    stage.dataset.shareCode = q.s;
    for (const el of [choiceA, choiceB]) {
      el?.classList.remove('picked', 'not-picked');
      if (el) el.disabled = false;
    }
    if (textA) textA.textContent = q.a;
    if (textB) textB.textContent = q.b;
    for (const el of [percentA, percentB, votesA, votesB, verdict]) if (el) el.textContent = '';
    if (fillA) fillA.style.height = '0';
    if (fillB) fillB.style.height = '0';
    announce(`Would you rather ${q.a}, or ${q.b}?`);
    track('question_advanced', { category: currentSet });
  }

  function showResult(result: VoteResult, choice: 'A' | 'B'): void {
    hasVoted = true;
    stage.classList.add('voted');
    const picked = choice === 'A' ? choiceA : choiceB;
    const other = choice === 'A' ? choiceB : choiceA;
    picked?.classList.add('picked');
    other?.classList.add('not-picked');
    if (choiceA) choiceA.disabled = true;
    if (choiceB) choiceB.disabled = true;
    if (percentA) percentA.textContent = `${result.percentA}%`;
    if (percentB) percentB.textContent = `${result.percentB}%`;
    if (votesA) votesA.textContent = formatVotes(result.votesA);
    if (votesB) votesB.textContent = formatVotes(result.votesB);
    requestAnimationFrame(() => {
      if (fillA) fillA.style.height = `${result.percentA}%`;
      if (fillB) fillB.style.height = `${result.percentB}%`;
    });
    const yourPercent = choice === 'A' ? result.percentA : result.percentB;
    const text = verdictText(yourPercent, result.total, result.accepted);
    if (verdict) verdict.textContent = text;
    announce(`${text} Option A ${result.percentA} percent, ${formatVotes(result.votesA)}. Option B ${result.percentB} percent, ${formatVotes(result.votesB)}. Total ${formatVotes(result.total)}.`);
    try {
      nextButton?.focus({ preventScroll: true });
    } catch {
      nextButton?.focus();
    }
  }

  async function vote(choice: 'A' | 'B'): Promise<void> {
    if (!current || hasVoted || busy) return;
    if (!config.votingEnabled) {
      // Voting disabled: still let the visitor pick and move on.
      hasVoted = true;
      stage.classList.add('voted');
      (choice === 'A' ? choiceA : choiceB)?.classList.add('picked');
      (choice === 'A' ? choiceB : choiceA)?.classList.add('not-picked');
      if (choiceA) choiceA.disabled = true;
      if (choiceB) choiceB.disabled = true;
      setNotice('Voting is currently switched off — enjoy the questions!');
      nextButton?.focus({ preventScroll: true });
      return;
    }
    busy = true;
    if (choiceA) choiceA.disabled = true;
    if (choiceB) choiceB.disabled = true;
    const started = performance.now();
    let status = 0;
    try {
      const res = await fetch(config.voteApi, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ questionId: current.id, choice }),
      });
      status = res.status;
      const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: VoteResult } | null;
      if (res.ok && body?.ok && body.result) {
        voted.set(current.id, body.result.yourChoice);
        showResult(body.result, body.result.yourChoice);
        track('vote_submitted', { category: currentSet, choice });
      } else if (res.status === 404) {
        setNotice('This question is no longer available. Try the next one.');
        hasVoted = true;
        stage.classList.add('voted');
      } else {
        throw new Error(`vote ${res.status}`);
      }
    } catch {
      // Keep the game usable.
      hasVoted = true;
      stage.classList.add('voted');
      (choice === 'A' ? choiceA : choiceB)?.classList.add('picked');
      (choice === 'A' ? choiceB : choiceA)?.classList.add('not-picked');
      setNotice('Voting is temporarily unavailable. You can keep playing.');
      announce('Voting is temporarily unavailable. You can keep playing.');
      track('vote_failed', { category: currentSet, status: String(status) });
      nextButton?.focus({ preventScroll: true });
    } finally {
      reportApiTiming('vote', performance.now() - started, status);
      busy = false;
    }
  }

  async function nextQuestion(): Promise<void> {
    if (busy || config.mode === 'single') return;
    busy = true;
    try {
      const q = await engine.next(current?.id ?? null);
      if (q) renderQuestion(q);
      else setNotice(engine.totalInSet <= 1 ? 'That is the only question in this collection right now.' : 'You have seen every question in this collection. Nice work!');
    } finally {
      busy = false;
    }
  }

  // --- Packs / manifest ------------------------------------------------------

  async function ensureManifest(): Promise<GameDataManifest | null> {
    manifest ??= await loadManifest(config.manifest);
    return manifest;
  }

  async function activateSet(slug: string, label?: string): Promise<void> {
    const m = await ensureManifest();
    const entry: PackSetManifestEntry | null = m?.sets[slug] ?? null;
    currentSet = slug;
    if (packLabel && label) packLabel.textContent = label;
    engine.setSeenStore(new SessionSeenStore(config.keys.seen + ':' + slug, session));
    await engine.useSet(entry);
    if (current && slug === config.set) engine.primeWith(current);
    if (packGrid) {
      packGrid.querySelectorAll<HTMLButtonElement>('.pack-button').forEach((b) => b.setAttribute('aria-current', b.dataset.pack === slug ? 'true' : 'false'));
    }
  }

  function openDialog(): void {
    if (!packDialog) return;
    if (packPicker) packPicker.hidden = false;
    if (ageGate) ageGate.hidden = true;
    if (typeof packDialog.showModal === 'function') packDialog.showModal();
    else packDialog.setAttribute('open', '');
  }
  function closeDialog(): void {
    if (!packDialog) return;
    if (typeof packDialog.close === 'function') packDialog.close();
    else packDialog.removeAttribute('open');
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
    local?.setItem(config.keys.pack, slug);
    await activateSet(slug, name);
    closeDialog();
    track('pack_changed', { category: slug });
    const q = await engine.next(null);
    if (q) renderQuestion(q);
    else setNotice('No questions are available in this pack yet.');
  }

  // --- Sharing -----------------------------------------------------------------

  async function share(): Promise<void> {
    if (!current) return;
    const url = `${location.origin}${config.sharePrefix}${current.s}/`;
    const title = `Would you rather ${current.a} or ${current.b}?`;
    track('share_clicked', { category: currentSet });
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      /* user cancelled or unsupported → fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied!');
      announce('Link copied to clipboard.');
    } catch {
      setNotice(url);
    }
  }

  // --- Fullscreen ---------------------------------------------------------------

  const isFullscreen = () => Boolean(document.fullscreenElement || (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement);
  function toggleFullscreen(): void {
    if (isFullscreen()) {
      void document.exitFullscreen?.();
      return;
    }
    void shell?.requestFullscreen?.().catch(() => undefined);
  }
  const updateFullscreenLabel = () => fullscreenButton?.setAttribute('aria-label', isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen');

  // --- Wire up ------------------------------------------------------------------

  choiceA?.addEventListener('click', () => void vote('A'));
  choiceB?.addEventListener('click', () => void vote('B'));
  nextButton?.addEventListener('click', () => void nextQuestion());
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
    local?.setItem(config.keys.adult, '1');
    const p = pendingGatedPack;
    pendingGatedPack = null;
    if (p) void choosePack(p.slug, p.name, false);
  });
  packGrid?.addEventListener('click', (event) => {
    const btn = (event.target as Element).closest<HTMLButtonElement>('.pack-button');
    if (!btn) return;
    void choosePack(btn.dataset.pack ?? config.set, btn.dataset.name ?? 'Mixed', btn.dataset.gated === '1');
  });
  packDialog?.addEventListener('click', (event) => {
    const box = packDialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) closeDialog();
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    if (packDialog?.open) return;
    if (document.getElementById('nav-links')?.classList.contains('open')) return;
    const key = event.key;
    if (key === 'ArrowLeft') {
      event.preventDefault();
      void vote('A');
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      void vote('B');
    } else if ((key === 'Enter' || key === ' ') && hasVoted && target?.closest('.game-shell')) {
      event.preventDefault();
      void nextQuestion();
    } else if ((key === 'c' || key === 'C') && packButton) {
      openDialog();
    } else if ((key === 'f' || key === 'F') && fullscreenButton && !fullscreenButton.hidden) {
      toggleFullscreen();
    }
  });

  // Already voted on the initial question in this browser? Show a hint but keep it playable.
  if (current) {
    const prior = voted.get(current.id);
    if (prior) setNotice('You already voted on this one — pick again to see the results.');
  }

  // Prefetch data for the current set once idle (mixed/category only).
  if (config.mode !== 'single') {
    const warm = () => {
      const saved = config.mode === 'mixed' ? local?.getItem(config.keys.pack) : null;
      const adultOk = local?.getItem(config.keys.adult) === '1';
      const start = async () => {
        const m = await ensureManifest();
        if (config.mode === 'mixed' && saved && saved !== config.set && m?.sets[saved] && (!m.sets[saved].requiresAgeGate || adultOk)) {
          const entry = m.sets[saved];
          await activateSet(saved, entry?.name);
          const q = await engine.next(current?.id ?? null);
          if (q) renderQuestion(q);
        } else {
          await activateSet(config.set);
        }
      };
      void start();
    };
    if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback(warm, { timeout: 1500 });
    else setTimeout(warm, 300);
  }
}
