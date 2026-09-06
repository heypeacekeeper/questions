/** Voting domain model and pure calculations. */

export type VoteChoice = 'A' | 'B';

export interface Vote {
  readonly questionId: string;
  readonly choice: VoteChoice;
  /** Server-side HMAC of the anonymous voter token. Never the raw token. */
  readonly voterHash: string;
}

export interface VoteTotals {
  readonly votesA: number;
  readonly votesB: number;
}

export interface VoteResult extends VoteTotals {
  readonly questionId: string;
  readonly total: number;
  /** Integer percentages that always sum to 100 when total > 0, else 0/0. */
  readonly percentA: number;
  readonly percentB: number;
  /** True when this request created a new vote; false for a repeat vote. */
  readonly accepted: boolean;
  /** Choice this voter has on record (existing or new). */
  readonly yourChoice: VoteChoice;
}

export function isVoteChoice(value: unknown): value is VoteChoice {
  return value === 'A' || value === 'B';
}

/**
 * Percentages using the largest-remainder method so A + B === 100 exactly
 * whenever at least one vote exists. Zero votes → 0 / 0.
 */
export function calculatePercentages(totals: VoteTotals): { percentA: number; percentB: number; total: number } {
  const votesA = Math.max(0, Math.floor(totals.votesA));
  const votesB = Math.max(0, Math.floor(totals.votesB));
  const total = votesA + votesB;
  if (total === 0) return { percentA: 0, percentB: 0, total: 0 };

  const rawA = (votesA / total) * 100;
  let percentA = Math.floor(rawA);
  let percentB = Math.floor((votesB / total) * 100);
  const remainder = 100 - (percentA + percentB);
  if (remainder > 0) {
    // Give the leftover point to the side with the larger fractional part.
    const fracA = rawA - percentA;
    const fracB = (votesB / total) * 100 - percentB;
    if (fracA >= fracB) percentA += remainder;
    else percentB += remainder;
  }
  return { percentA, percentB, total };
}

export function buildVoteResult(
  questionId: string,
  totals: VoteTotals,
  yourChoice: VoteChoice,
  accepted: boolean,
): VoteResult {
  const { percentA, percentB, total } = calculatePercentages(totals);
  return {
    questionId,
    votesA: Math.max(0, totals.votesA),
    votesB: Math.max(0, totals.votesB),
    total,
    percentA,
    percentB,
    accepted,
    yourChoice,
  };
}
