import { describe, expect, it } from 'vitest';
import {
  DownwardWheelDetector,
  isUpwardSwipe,
  normalizeWheelDelta,
} from '@/scripts/game-navigation';

describe('game gesture navigation', () => {
  it('accepts a clear upward swipe', () => {
    expect(isUpwardSwipe({ x: 100, y: 400, time: 1000 }, { x: 115, y: 300, time: 1300 })).toBe(
      true,
    );
  });

  it('rejects short, horizontal, downward, and slow gestures', () => {
    const start = { x: 100, y: 400, time: 1000 };

    expect(isUpwardSwipe(start, { x: 100, y: 350, time: 1200 })).toBe(false);
    expect(isUpwardSwipe(start, { x: 200, y: 320, time: 1200 })).toBe(false);
    expect(isUpwardSwipe(start, { x: 100, y: 480, time: 1200 })).toBe(false);
    expect(isUpwardSwipe(start, { x: 100, y: 300, time: 1900 })).toBe(false);
  });

  it('accumulates small movements into one wheel gesture', () => {
    const detector = new DownwardWheelDetector();

    expect(detector.push(40, 1000)).toBe(false);
    expect(detector.push(40, 1050)).toBe(false);
    expect(detector.push(40, 1100)).toBe(true);
  });

  it('fires only once during a continuous wheel burst', () => {
    const detector = new DownwardWheelDetector();

    expect(detector.push(120, 1000)).toBe(true);
    expect(detector.push(200, 1050)).toBe(false);
    expect(detector.push(200, 1100)).toBe(false);
    expect(detector.push(200, 1150)).toBe(false);
  });

  it('rearms automatically after the wheel burst ends', () => {
    const detector = new DownwardWheelDetector();

    expect(detector.push(120, 1000)).toBe(true);
    expect(detector.push(200, 1100)).toBe(false);
    expect(detector.push(120, 1350)).toBe(true);
  });

  it('rearms when the user reverses direction', () => {
    const detector = new DownwardWheelDetector();

    expect(detector.push(120, 1000)).toBe(true);
    expect(detector.push(-20, 1050)).toBe(false);
    expect(detector.push(120, 1100)).toBe(true);
  });

  it('normalizes line and page wheel values', () => {
    expect(normalizeWheelDelta(2, 0, 800)).toBe(2);
    expect(normalizeWheelDelta(2, 1, 800)).toBe(32);
    expect(normalizeWheelDelta(2, 2, 800)).toBe(1600);
  });
});
