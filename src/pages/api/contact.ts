import type { APIRoute } from 'astro';
import { createMutationContext } from '@/repositories/factory';
import { workerBindings } from '@/lib/worker-env';
import { ContactService } from '@/application/submission-service';
import { FORM_LIMITS } from '@/config/site';
import { clientKey, fail, json, readJsonBody } from '@/lib/api';
import { formOutcomeResponse } from '@/lib/form-response';
export const prerender = false;
export const POST: APIRoute = async (ctx) => {
  const parsed = await readJsonBody(ctx, FORM_LIMITS.maxBodyBytes);
  if ('error' in parsed) return parsed.error;
  let mc;
  try {
    mc = createMutationContext(workerBindings());
  } catch {
    return fail(503, 'The contact form is temporarily unavailable.');
  }
  if (!mc.env.features.FEATURE_CONTACT_FORM)
    return fail(503, 'The contact form is currently disabled.');
  const key = await clientKey(ctx.request, 'contact');
  const outcome = await new ContactService(mc.contact, mc.verifier, mc.formRateLimiter).send(
    parsed.body,
    { hostname: new URL(ctx.request.url).hostname, clientKey: key },
  );
  return outcome.kind === 'ok'
    ? json({ ok: true, message: 'Thanks! Your message has been received.' })
    : formOutcomeResponse(outcome);
};
