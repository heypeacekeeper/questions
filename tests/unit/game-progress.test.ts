import { describe, expect, it } from 'vitest';
import { isCompletionMilestone, milestoneIcon } from '@/scripts/game-progress';

describe('game completion milestones', () => {
  it.each([5, 20, 50, 100, 200, 300])('shows a milestone at %i answers', (count) => {
    expect(isCompletionMilestone(count)).toBe(true);
  });

  it.each([0, 1, 4, 6, 19, 21, 49, 51, 99, 101, 150])(
    'does not show a milestone at %i answers',
    (count) => {
      expect(isCompletionMilestone(count)).toBe(false);
    },
  );

  it('rejects invalid counts', () => {
    expect(isCompletionMilestone(-1)).toBe(false);
    expect(isCompletionMilestone(5.5)).toBe(false);
    expect(isCompletionMilestone(Number.NaN)).toBe(false);
  });

  it('returns the intended milestone icons', () => {
    expect(milestoneIcon(5)).toBe('🔥');
    expect(milestoneIcon(20)).toBe('⚡');
    expect(milestoneIcon(50)).toBe('🎯');
    expect(milestoneIcon(100)).toBe('🏆');
    expect(milestoneIcon(200)).toBe('🏆');
  });
});
