export function isCompletionMilestone(count: number): boolean {
  if (!Number.isInteger(count) || count < 1) return false;

  return count === 5 || count === 20 || count === 50 || (count >= 100 && count % 100 === 0);
}

export function milestoneIcon(count: number): string {
  if (count >= 100) return '🏆';
  if (count >= 50) return '🎯';
  if (count >= 20) return '⚡';
  return '🔥';
}
