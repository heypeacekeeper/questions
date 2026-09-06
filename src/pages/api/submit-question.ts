import type { APIRoute } from 'astro';
import { createMutationContext } from '@/repositories/factory';
import { workerBindings } from '@/lib/worker-env';
import { SubmissionService } from '@/application/submission-service';
import { FORM_LIMITS } from '@/config/site';
import { clientKey, fail, json, readJsonBody } from '@/lib/api';
import { formOutcomeResponse } from '@/lib/form-response';
export const prerender = false;
export const POST: APIRoute = async (ctx) => {
  const parsed = await readJsonBody(ctx, FORM_LIMITS.maxBodyBytes); if ('error' in parsed) return parsed.error;
  let mc; try { mc = createMutationContext(workerBindings()); } catch { return fail(503, 'Submissions are temporarily unavailable.'); }
  if (!mc.env.features.FEATURE_SUBMISSIONS) return fail(503, 'Submissions are currently closed.');
  const key = await clientKey(ctx.request, mc.env.voterHashSecret ?? 'submit');
  const outcome = await new SubmissionService(mc.submissions, mc.verifier, mc.rateLimiter).submit(parsed.body, { hostname: new URL(ctx.request.url).hostname, clientKey: key });
  return outcome.kind === 'ok' ? json({ ok: true, message: 'Thank you! Your question is pending review.' }) : formOutcomeResponse(outcome);
};
