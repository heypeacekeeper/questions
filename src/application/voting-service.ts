/** Voting business rules: request validation and abuse-rate-limit key derivation. */
import { isVoteChoice, type VoteChoice, type VoteResult } from '@/domain/vote';
import type { RateLimiter, VoteRepository } from '@/repositories/interfaces';
import { hmacSha256Hex } from '@/lib/crypto';
import { VOTING } from '@/config/site';

export type VoteServiceOutcome =
  | { readonly kind: 'ok'; readonly result: VoteResult }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'unavailable' };

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface VoteRequest { readonly questionId: unknown; readonly choice: unknown; }

export function validateVoteRequest(body: unknown): { ok: true; questionId: string; choice: VoteChoice } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, message: 'Body must be a JSON object' };
  const keys = Object.keys(body);
  if (keys.some((key) => key !== 'questionId' && key !== 'choice')) return { ok: false, message: 'Unknown field' };
  const { questionId, choice } = body as VoteRequest;
  if (typeof questionId !== 'string' || !UUID_PATTERN.test(questionId)) return { ok: false, message: 'Invalid question id' };
  if (!isVoteChoice(choice)) return { ok: false, message: 'Choice must be A or B' };
  return { ok: true, questionId, choice };
}

export class VotingService {
  constructor(private readonly votes: VoteRepository, private readonly rateLimiter: RateLimiter, private readonly rateLimitSecret: string) {}

  /** The anonymous cookie is HMACed only to create an opaque abuse-rate-limit key. */
  async hashRateLimitToken(voterToken: string): Promise<string> {
    return hmacSha256Hex(this.rateLimitSecret, `rate-limit:vote:${voterToken}`);
  }

  async castVote(body: unknown, voterToken: string): Promise<VoteServiceOutcome> {
    const parsed = validateVoteRequest(body);
    if (!parsed.ok) return { kind: 'invalid', message: parsed.message };
    const rateLimitKey = await this.hashRateLimitToken(voterToken);
    if (!(await this.rateLimiter.allow(`vote:${rateLimitKey}`, VOTING.rateLimitPerMinute, 60))) return { kind: 'rate_limited' };

    const outcome = await this.votes.submitVote(parsed.questionId, parsed.choice);
    if (outcome.kind === 'ok') return { kind: 'ok', result: outcome.result };
    if (outcome.kind === 'not_found' || outcome.kind === 'not_published') return { kind: 'not_found' };
    return { kind: 'unavailable' };
  }
}
