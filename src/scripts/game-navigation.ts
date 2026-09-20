export interface GesturePoint {
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

export function isUpwardSwipe(start: GesturePoint, end: GesturePoint): boolean {
  const upwardDistance = start.y - end.y;
  const horizontalDistance = Math.abs(end.x - start.x);
  const duration = end.time - start.time;

  return (
    duration >= 0 &&
    duration <= 800 &&
    upwardDistance >= 64 &&
    horizontalDistance <= upwardDistance * 0.75
  );
}

export class DownwardWheelDetector {
  private accumulated = 0;
  private lastEventAt = 0;
  private armed = true;

  constructor(
    private readonly threshold = 120,
    private readonly burstGapMs = 200,
  ) {}

  push(deltaY: number, now: number): boolean {
    if (!Number.isFinite(deltaY) || deltaY <= 0) {
      this.reset();
      return false;
    }

    if (this.lastEventAt === 0 || now - this.lastEventAt > this.burstGapMs) {
      this.accumulated = 0;
      this.armed = true;
    }

    this.lastEventAt = now;

    if (!this.armed) return false;

    this.accumulated += deltaY;
    if (this.accumulated < this.threshold) return false;

    this.accumulated = 0;
    this.armed = false;
    return true;
  }

  reset(): void {
    this.accumulated = 0;
    this.lastEventAt = 0;
    this.armed = true;
  }
}

export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * viewportHeight;
  return deltaY;
}
