import {
  DownwardWheelDetector,
  isUpwardSwipe,
  normalizeWheelDelta,
  type GesturePoint,
} from './game-navigation';

interface FullscreenNavigationOptions {
  readonly stage: HTMLElement;
  readonly fullscreenButton: HTMLButtonElement | null;
  readonly gestureHint: HTMLElement | null;
  readonly gestureHintIcon: HTMLElement | null;
  readonly gestureHintText: HTMLElement | null;
  readonly localStorage: Storage | null;
  readonly gestureHintKey: string;
  readonly enabled: boolean;
  readonly isFullscreen: () => boolean;
  readonly isBusy: () => boolean;
  readonly isBlocked: () => boolean;
  readonly nextQuestion: () => void;
}

export function installFullscreenNavigation({
  stage,
  fullscreenButton,
  gestureHint,
  gestureHintIcon,
  gestureHintText,
  localStorage,
  gestureHintKey,
  enabled,
  isFullscreen,
  isBusy,
  isBlocked,
  nextQuestion,
}: FullscreenNavigationOptions): void {
  const wheelDetector = new DownwardWheelDetector();
  let touchStart: GesturePoint | null = null;
  let gestureHintTimer: number | null = null;
  let gestureHintShown = false;

  function hideGestureHint(): void {
    if (!gestureHint) return;

    if (gestureHintTimer !== null) {
      window.clearTimeout(gestureHintTimer);
      gestureHintTimer = null;
    }

    gestureHint.classList.remove('is-visible');
    window.setTimeout(() => {
      gestureHint.hidden = true;
    }, 180);
  }

  function showGestureHint(): void {
    if (!gestureHint || gestureHintShown) return;

    try {
      if (localStorage?.getItem(gestureHintKey) === '1') {
        gestureHintShown = true;
        return;
      }
      localStorage?.setItem(gestureHintKey, '1');
    } catch {
      // In-memory state still prevents repetition during this page visit.
    }

    gestureHintShown = true;

    const touchDevice =
      window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

    if (gestureHintIcon) gestureHintIcon.textContent = touchDevice ? '↑' : '↓';
    if (gestureHintText) {
      gestureHintText.textContent = touchDevice
        ? 'Swipe up for the next question'
        : 'Scroll down for the next question';
    }

    gestureHint.hidden = false;
    requestAnimationFrame(() => gestureHint.classList.add('is-visible'));
    gestureHintTimer = window.setTimeout(hideGestureHint, 2500);
  }

  function updateFullscreenState(): void {
    fullscreenButton?.setAttribute(
      'aria-label',
      isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen',
    );

    wheelDetector.reset();
    touchStart = null;

    if (isFullscreen()) showGestureHint();
    else hideGestureHint();
  }

  function startSwipe(event: TouchEvent): void {
    if (!isFullscreen() || !enabled || event.touches.length !== 1) {
      touchStart = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;

    touchStart = {
      x: touch.clientX,
      y: touch.clientY,
      time: performance.now(),
    };
  }

  function finishSwipe(event: TouchEvent): void {
    const start = touchStart;
    touchStart = null;

    if (!start || !isFullscreen() || !enabled || isBusy() || isBlocked()) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const end: GesturePoint = {
      x: touch.clientX,
      y: touch.clientY,
      time: performance.now(),
    };

    if (!isUpwardSwipe(start, end)) return;

    event.preventDefault();
    hideGestureHint();
    nextQuestion();
  }

  function handleWheel(event: WheelEvent): void {
    if (isBlocked()) {
      event.preventDefault();
      return;
    }

    if (!isFullscreen() || !enabled || isBusy()) {
      wheelDetector.reset();
      return;
    }

    event.preventDefault();

    const delta = normalizeWheelDelta(event.deltaY, event.deltaMode, window.innerHeight);
    if (wheelDetector.push(delta, performance.now())) {
      hideGestureHint();
      nextQuestion();
    }
  }

  stage.addEventListener('touchstart', startSwipe, { passive: true });
  stage.addEventListener('touchend', finishSwipe, { passive: false });
  stage.addEventListener('touchcancel', () => {
    touchStart = null;
  });
  stage.addEventListener('wheel', handleWheel, { passive: false });
  document.addEventListener('fullscreenchange', updateFullscreenState);
  document.addEventListener('webkitfullscreenchange', updateFullscreenState);
}
