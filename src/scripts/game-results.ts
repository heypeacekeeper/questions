import type { GameQuestion } from '@/domain/question';
import { formatGeneratedPercent, generatedDisplayResult } from './game-engine';

export type GameChoice = 'A' | 'B';

interface GameResultsOptions {
  readonly stage: HTMLElement;
  readonly choiceA: HTMLButtonElement | null;
  readonly choiceB: HTMLButtonElement | null;
  readonly textA: HTMLElement | null;
  readonly textB: HTMLElement | null;
  readonly optionLabelA: HTMLElement | null;
  readonly optionLabelB: HTMLElement | null;
  readonly percentA: HTMLElement | null;
  readonly percentB: HTMLElement | null;
  readonly fillA: HTMLElement | null;
  readonly fillB: HTMLElement | null;
  readonly verdict: HTMLElement | null;
  readonly announce: (message: string) => void;
  readonly onFirstAnswer: () => void;
}

export interface GameResultsController {
  reset(question: GameQuestion): void;
  choose(question: GameQuestion, choice: GameChoice): void;
}

export function createGameResultsController({
  stage,
  choiceA,
  choiceB,
  textA,
  textB,
  optionLabelA,
  optionLabelB,
  percentA,
  percentB,
  fillA,
  fillB,
  verdict,
  announce,
  onFirstAnswer,
}: GameResultsOptions): GameResultsController {
  let hasAnswered = false;
  let lastPick: GameChoice | null = null;
  let animationFrame: number | null = null;

  function cancelAnimation(): void {
    if (animationFrame === null) return;

    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function animateResult(percentATarget: number, percentBTarget: number): void {
    cancelAnimation();
    stage.dataset.resultReady = '0';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (percentA) percentA.textContent = formatGeneratedPercent(percentATarget);
      if (percentB) percentB.textContent = formatGeneratedPercent(percentBTarget);
      stage.dataset.resultReady = '1';
      return;
    }

    const duration = 900;
    const startValue = 50;
    const startedAt = performance.now();

    if (percentA) percentA.textContent = formatGeneratedPercent(startValue);
    if (percentB) percentB.textContent = formatGeneratedPercent(startValue);

    const update = (now: number): void => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      const valueA = startValue + (percentATarget - startValue) * eased;
      const valueB = startValue + (percentBTarget - startValue) * eased;

      if (percentA) percentA.textContent = formatGeneratedPercent(valueA);
      if (percentB) percentB.textContent = formatGeneratedPercent(valueB);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(update);
        return;
      }

      animationFrame = null;

      if (percentA) percentA.textContent = formatGeneratedPercent(percentATarget);
      if (percentB) percentB.textContent = formatGeneratedPercent(percentBTarget);

      stage.dataset.resultReady = '1';
    };

    animationFrame = requestAnimationFrame(update);
  }

  function reset(question: GameQuestion): void {
    cancelAnimation();
    delete stage.dataset.resultReady;

    hasAnswered = false;
    lastPick = null;

    stage.classList.remove('answered');

    [choiceA, choiceB].forEach((button) => {
      button?.classList.remove('picked', 'not-picked');
      button?.setAttribute('aria-pressed', 'false');
    });

    if (optionLabelA) optionLabelA.textContent = 'OPTION A';
    if (optionLabelB) optionLabelB.textContent = 'OPTION B';
    if (textA) textA.textContent = question.a;
    if (textB) textB.textContent = question.b;

    [percentA, percentB, verdict].forEach((element) => {
      if (element) element.textContent = '';
    });

    if (fillA) fillA.style.height = '0';
    if (fillB) fillB.style.height = '0';

    announce(`Would you rather ${question.a}, or ${question.b}?`);
  }

  function choose(question: GameQuestion, choice: GameChoice): void {
    if (hasAnswered && lastPick === choice) return;

    const firstAnswer = !hasAnswered;
    hasAnswered = true;
    lastPick = choice;

    stage.classList.add('answered');

    const picked = choice === 'A' ? choiceA : choiceB;
    const other = choice === 'A' ? choiceB : choiceA;

    [choiceA, choiceB].forEach((button) => {
      button?.classList.remove('picked', 'not-picked');
    });

    picked?.classList.add('picked');
    other?.classList.add('not-picked');

    choiceA?.setAttribute('aria-pressed', String(choice === 'A'));
    choiceB?.setAttribute('aria-pressed', String(choice === 'B'));

    if (optionLabelA) {
      optionLabelA.textContent = choice === 'A' ? 'YOUR CHOICE' : 'OPTION A';
    }

    if (optionLabelB) {
      optionLabelB.textContent = choice === 'B' ? 'YOUR CHOICE' : 'OPTION B';
    }

    const result = generatedDisplayResult(question.id);

    if (firstAnswer) {
      animateResult(result.percentA, result.percentB);
      onFirstAnswer();
    }

    requestAnimationFrame(() => {
      if (fillA) fillA.style.height = `${result.percentA}%`;
      if (fillB) fillB.style.height = `${result.percentB}%`;
    });

    announce(
      `Option A ${formatGeneratedPercent(result.percentA)}. ` +
        `Option B ${formatGeneratedPercent(result.percentB)}. For-fun result.`,
    );
  }

  return {
    reset,
    choose,
  };
}
