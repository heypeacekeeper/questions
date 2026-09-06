import type { APIRoute } from 'astro';
import { createMutationContext } from '@/repositories/factory';
import { workerBindings } from '@/lib/worker-env';
import { VotingService } from '@/application/voting-service';
import { VOTING } from '@/config/site';
import { generateVoterToken } from '@/lib/crypto';
import { fail, json, readCookie, readJsonBody } from '@/lib/api';
export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const parsed = await readJsonBody(ctx, VOTING.maxBodyBytes);
  if ('error' in parsed) return parsed.error;
  let mc; try { mc = createMutationContext(workerBindings()); } catch { return fail(503, 'Voting is temporarily unavailable.'); }
  if (!mc.env.features.FEATURE_VOTING) return fail(503, 'Voting is currently disabled.');
  const secret = mc.env.voterHashSecret; if (!secret) return fail(503, 'Voting is temporarily unavailable.');
  let token = readCookie(ctx.request, VOTING.cookieName); const issued = !token || !/^[A-Za-z0-9_-]{32,64}$/.test(token);
  if (issued) token = generateVoterToken();
  const outcome = await new VotingService(mc.votes, mc.rateLimiter, secret).castVote(parsed.body, token as string);
  const secure = new URL(ctx.request.url).protocol === 'https:' ? '; Secure' : '';
  const setCookie = issued ? { 'set-cookie': `${VOTING.cookieName}=${token}; Max-Age=${VOTING.cookieMaxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}` } : {};
  switch (outcome.kind) {
    case 'ok': return json({ ok: true, result: outcome.result }, 200, setCookie);
    case 'invalid': return fail(400, 'Invalid vote.');
    case 'not_found': return fail(404, 'Question not found.');
    case 'rate_limited': return fail(429, 'Too many votes. Please slow down.');
    default: return fail(503, 'Voting is temporarily unavailable.');
  }
};
