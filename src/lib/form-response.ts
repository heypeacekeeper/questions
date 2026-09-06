import type { FormServiceOutcome } from '@/application/submission-service';
import { fail } from '@/lib/api';
export function formOutcomeResponse(o: Exclude<FormServiceOutcome, { kind: 'ok' }>): Response {
  switch (o.kind) {
    case 'invalid': return fail(400, 'Please check the highlighted fields.', { issues: o.issues });
    case 'verification_failed': return fail(400, 'Human verification failed. Please try again.', { issues: [{ field: 'turnstile', message: 'Please complete the verification again.' }] });
    case 'duplicate': return fail(409, 'It looks like we already received this. Thank you!');
    case 'rate_limited': return fail(429, 'Too many requests. Please try again later.');
    default: return fail(503, 'Temporarily unavailable. Please try again soon.');
  }
}
