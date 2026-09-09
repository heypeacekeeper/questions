/** Progressive enhancement controller for the static first game question. */
import type { GameQuestion } from '@/domain/question';
import type { GameDataManifest, PackSetManifestEntry } from '@/application/game-data-service';
import {
  formatGeneratedPercent,
  GameEngine,
  generatedDisplayResult,
  loadManifest,
  SessionSeenStore,
} from './game-engine';

interface GameConfig {
  mode: 'mixed' | 'category' | 'single';
  set: string;
  manifest: string;
  refill: number;
  sharePrefix: string;
  keys: { pack: string; adult: string; seen: string };
  initial: GameQuestion | null;
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
function safeStorage(kind: 'local' | 'session'): Storage | null { try { const storage = kind === 'local' ? localStorage : sessionStorage; storage.getItem('__t'); return storage; } catch { return null; } }

export function initGame(): void {
  const shell = $('game-shell');
  if (!shell || shell.dataset.ready === '1') return;
  shell.dataset.ready = '1';
  let config: GameConfig;
  try { config = JSON.parse(shell.dataset.gameConfig ?? '{}') as GameConfig; } catch { return; }
  const stage = $('game-stage'); const choiceA = $<HTMLButtonElement>('choice-a'); const choiceB = $<HTMLButtonElement>('choice-b');
  const textA = $('text-a'); const textB = $('text-b'); const percentA = $('percent-a'); const percentB = $('percent-b'); const voteCount = $('vote-count'); const fillA = $('fill-a');
const fillB = $('fill-b');
 const verdict = $('verdict-text'); const nextButton = $<HTMLButtonElement>('next-button'); const live = $('game-live'); const shareButton = $<HTMLButtonElement>('share-button'); const fullscreenButton = $<HTMLButtonElement>('fullscreen-button'); const packButton = $<HTMLButtonElement>('pack-button'); const packLabel = $('pack-label'); const packDialog = $<HTMLDialogElement>('pack-dialog'); const packGrid = $('pack-grid'); const packPicker = $('pack-picker'); const ageGate = $('age-gate'); const ageGatePack = $('age-gate-pack');
  if (!stage) return;
  const gameStage = stage;
  const local = safeStorage('local'); const session = safeStorage('session');
  const engine = new GameEngine(new SessionSeenStore(`${config.keys.seen}:${config.set}`, session), undefined, config.refill);
  let current: GameQuestion | null = config.initial; let hasVoted = false; let lastPick: 'A' | 'B' | null = null;
  let busy = false; let manifest: GameDataManifest | null = null; let pendingGatedPack: { slug: string; name: string } | null = null;
  if (current) { engine.primeWith(current); engine.markSeen(current.id); }
  if (shareButton && current) shareButton.hidden = false;
  if (fullscreenButton && (document.fullscreenEnabled || (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled)) fullscreenButton.hidden = false;
  const announce = (message: string) => { if (live) { live.textContent = ''; requestAnimationFrame(() => { if (live) live.textContent = message; }); } };
  const setNotice = (message: string) => { if (verdict) verdict.textContent = message; gameStage.classList.add('has-notice'); };

  function renderQuestion(question: GameQuestion): void {
    current = question; hasVoted = false; lastPick = null;
    gameStage.classList.remove('voted', 'has-notice'); gameStage.dataset.questionId = question.id; gameStage.dataset.shareCode = question.s;
    [choiceA, choiceB].forEach((button) => button?.classList.remove('picked', 'not-picked'));
    if (textA) textA.textContent = question.a; if (textB) textB.textContent = question.b;
    [percentA, percentB, voteCount, verdict].forEach((element) => { if (element) element.textContent = ''; });
    if (fillA) fillA.style.height = '0';
if (fillB) fillB.style.height = '0';

    announce(`Would you rather ${question.a}, or ${question.b}?`);
  }
  function choose(choice: 'A' | 'B'): void {
    if (!current || busy) return;
    if (hasVoted && lastPick === choice) return;
    hasVoted = true; lastPick = choice; gameStage.classList.add('voted');
    const picked = choice === 'A' ? choiceA : choiceB; const other = choice === 'A' ? choiceB : choiceA;
    [choiceA, choiceB].forEach((button) => button?.classList.remove('picked', 'not-picked'));
    picked?.classList.add('picked'); other?.classList.add('not-picked');
    const result = generatedDisplayResult(current.id);
    if (percentA) percentA.textContent = formatGeneratedPercent(result.percentA); if (percentB) percentB.textContent = formatGeneratedPercent(result.percentB);
    if (voteCount) voteCount.textContent = `${current.d.toLocaleString('en-US')} votes`;
    requestAnimationFrame(() => {
  if (fillA) fillA.style.height = `${result.percentA}%`;
  if (fillB) fillB.style.height = `${result.percentB}%`;
});

    announce(`Option A ${formatGeneratedPercent(result.percentA)}. Option B ${formatGeneratedPercent(result.percentB)}. ${current.d.toLocaleString('en-US')} votes.`);
  }
  async function nextQuestion(): Promise<void> { if (busy || config.mode === 'single') return; busy = true; try { const question = await engine.next(current?.id ?? null); if (question) renderQuestion(question); else setNotice(engine.totalInSet <= 1 ? 'That is the only question in this collection right now.' : 'You have seen every question in this collection. Nice work!'); } finally { busy = false; } }
  async function ensureManifest(): Promise<GameDataManifest | null> { manifest ??= await loadManifest(config.manifest); return manifest; }
  async function activateSet(slug: string, label?: string): Promise<void> { const entry: PackSetManifestEntry | null = (await ensureManifest())?.sets[slug] ?? null; if (packLabel && label) packLabel.textContent = label; engine.setSeenStore(new SessionSeenStore(`${config.keys.seen}:${slug}`, session)); await engine.useSet(entry); if (current && slug === config.set) engine.primeWith(current); packGrid?.querySelectorAll<HTMLButtonElement>('.pack-button').forEach((button) => button.setAttribute('aria-current', button.dataset.pack === slug ? 'true' : 'false')); }
  function openDialog(): void { if (!packDialog) return; if (packPicker) packPicker.hidden = false; if (ageGate) ageGate.hidden = true; if (typeof packDialog.showModal === 'function') packDialog.showModal(); else packDialog.setAttribute('open', ''); }
  function closeDialog(): void { if (!packDialog) return; if (typeof packDialog.close === 'function') packDialog.close(); else packDialog.removeAttribute('open'); packButton?.focus(); }
  async function choosePack(slug: string, name: string, gated: boolean): Promise<void> { if (gated && local?.getItem(config.keys.adult) !== '1') { pendingGatedPack = { slug, name }; if (packPicker) packPicker.hidden = true; if (ageGate) ageGate.hidden = false; if (ageGatePack) ageGatePack.textContent = name; $('confirm-age-button')?.focus(); return; } local?.setItem(config.keys.pack, slug); await activateSet(slug, name); closeDialog(); const question = await engine.next(null); if (question) renderQuestion(question); else setNotice('No questions are available in this pack yet.'); }
  async function share(): Promise<void> { if (!current) return; const url = `${location.origin}${config.sharePrefix}${current.s}/`; const title = `Would you rather ${current.a} or ${current.b}?`; try { if (navigator.share) { await navigator.share({ title, url }); return; } } catch { /* Clipboard fallback. */ } try { await navigator.clipboard.writeText(url); setNotice('Link copied!'); announce('Link copied to clipboard.'); } catch { setNotice(url); } }
  const isFullscreen = () => Boolean(document.fullscreenElement || (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement);
  const toggleFullscreen = () => { if (isFullscreen()) { void document.exitFullscreen?.(); return; } void shell.requestFullscreen?.().catch(() => undefined); };
  const updateFullscreenLabel = () => fullscreenButton?.setAttribute('aria-label', isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen');
  choiceA?.addEventListener('click', () => choose('A')); choiceB?.addEventListener('click', () => choose('B')); nextButton?.addEventListener('click', () => void nextQuestion()); shareButton?.addEventListener('click', () => void share()); fullscreenButton?.addEventListener('click', toggleFullscreen); document.addEventListener('fullscreenchange', updateFullscreenLabel); document.addEventListener('webkitfullscreenchange', updateFullscreenLabel);
  packButton?.addEventListener('click', openDialog); $('close-pack-dialog')?.addEventListener('click', closeDialog); $('close-age-gate')?.addEventListener('click', closeDialog); $('age-back-button')?.addEventListener('click', () => { if (ageGate) ageGate.hidden = true; if (packPicker) packPicker.hidden = false; pendingGatedPack = null; }); $('confirm-age-button')?.addEventListener('click', () => { local?.setItem(config.keys.adult, '1'); const pack = pendingGatedPack; pendingGatedPack = null; if (pack) void choosePack(pack.slug, pack.name, false); }); packGrid?.addEventListener('click', (event) => { const button = (event.target as Element).closest<HTMLButtonElement>('.pack-button'); if (button) void choosePack(button.dataset.pack ?? config.set, button.dataset.name ?? 'Mixed', button.dataset.gated === '1'); }); packDialog?.addEventListener('click', (event) => { const box = packDialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog(); });
  document.addEventListener('keydown', (event) => { if (event.defaultPrevented || packDialog?.open || document.getElementById('nav-links')?.classList.contains('open')) return; if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null; if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return; if (event.key === 'ArrowLeft') { event.preventDefault(); choose('A'); } else if (event.key === 'ArrowRight') { event.preventDefault(); choose('B'); } else if ((event.key === 'Enter' || event.key === ' ') && hasVoted && target?.closest('.game-shell')) { event.preventDefault(); void nextQuestion(); } else if ((event.key === 'c' || event.key === 'C') && packButton) openDialog(); else if ((event.key === 'f' || event.key === 'F') && fullscreenButton && !fullscreenButton.hidden) toggleFullscreen(); });
  if (config.mode !== 'single') { const warm = () => { const saved = config.mode === 'mixed' ? local?.getItem(config.keys.pack) : null; const adultOk = local?.getItem(config.keys.adult) === '1'; void (async () => { const loaded = await ensureManifest(); if (config.mode === 'mixed' && saved && saved !== config.set && loaded?.sets[saved] && (!loaded.sets[saved].requiresAgeGate || adultOk)) { const entry = loaded.sets[saved]; await activateSet(saved, entry?.name); const question = await engine.next(current?.id ?? null); if (question) renderQuestion(question); } else await activateSet(config.set); })(); }; if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback(warm, { timeout: 1500 }); else setTimeout(warm, 300); }
}
