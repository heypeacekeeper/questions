/**
 * Question submission + contact message rules: schema validation, sanitizing,
 * duplicate fingerprints, anti-spam checks. Pure validation is exported for tests
 * and reused by the client for instant feedback.
 */
import type { ContactMessage, QuestionSubmission, ValidationIssue, ValidationResult } from '@/domain/forms';
import type { ContactRepository, HumanVerificationService, RateLimiter, SubmissionRepository } from '@/repositories/interfaces';
import { FORM_LIMITS, TURNSTILE } from '@/config/site';
import { cleanUserText, cleanUserTextMultiline, looksLikeEmail, normalizeForComparison, questionPairFingerprint } from '@/lib/text';
import { sha256Hex } from '@/lib/crypto';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Shared anti-spam envelope
// ---------------------------------------------------------------------------

export interface FormEnvelope {
  /** Turnstile response token. */
  readonly turnstileToken: string;
  /** Honeypot — must be empty. */
  readonly website: string;
  /** Epoch ms when the form was rendered (client-provided, sanity-checked). */
  readonly renderedAt: number;
}

const ENVELOPE_KEYS = ['turnstileToken', 'website', 'renderedAt'] as const;

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

function unknownFields(obj: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

function envelopeIssues(obj: Record<string, unknown>, now: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (readString(obj, 'website') !== '') issues.push({ field: '_form', message: 'Submission rejected.' });
  const renderedAt = Number(obj.renderedAt);
  if (!Number.isFinite(renderedAt) || renderedAt <= 0) issues.push({ field: '_form', message: 'Please reload the page and try again.' });
  else if (now - renderedAt < FORM_LIMITS.minTimeToSubmitMs) issues.push({ field: '_form', message: 'That was quick — please review the form and try again.' });
  else if (now - renderedAt > 1000 * 60 * 60 * 6) issues.push({ field: '_form', message: 'This form has expired. Please reload the page.' });
  if (readString(obj, 'turnstileToken').length < 10) issues.push({ field: 'turnstile', message: 'Please complete the human verification.' });
  return issues;
}

// ---------------------------------------------------------------------------
// Question submission
// ---------------------------------------------------------------------------

export const SUBMISSION_FIELDS = ['optionA', 'optionB', 'categoryId', 'name', 'email', 'agree', ...ENVELOPE_KEYS] as const;

export function validateSubmission(body: unknown, now: number = Date.now()): ValidationResult<QuestionSubmission & FormEnvelope> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, issues: [{ field: '_form', message: 'Invalid request.' }] };
  }
  const obj = body as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  if (unknownFields(obj, SUBMISSION_FIELDS).length > 0) issues.push({ field: '_form', message: 'Unknown field.' });

  const optionA = cleanUserText(readString(obj, 'optionA'), FORM_LIMITS.optionMax + 50);
  const optionB = cleanUserText(readString(obj, 'optionB'), FORM_LIMITS.optionMax + 50);
  const categoryId = readString(obj, 'categoryId').trim();
  const name = cleanUserText(readString(obj, 'name'), FORM_LIMITS.nameMax + 20);
  const email = cleanUserText(readString(obj, 'email'), FORM_LIMITS.emailMax + 20).toLowerCase();
  const agree = obj.agree === true || obj.agree === 'true' || obj.agree === 'on';

  if (optionA.length < FORM_LIMITS.optionMin) issues.push({ field: 'optionA', message: 'Please enter Option A.' });
  else if (optionA.length > FORM_LIMITS.optionMax) issues.push({ field: 'optionA', message: `Option A must be ${FORM_LIMITS.optionMax} characters or fewer.` });
  if (optionB.length < FORM_LIMITS.optionMin) issues.push({ field: 'optionB', message: 'Please enter Option B.' });
  else if (optionB.length > FORM_LIMITS.optionMax) issues.push({ field: 'optionB', message: `Option B must be ${FORM_LIMITS.optionMax} characters or fewer.` });
  if (optionA && optionB && normalizeForComparison(optionA) === normalizeForComparison(optionB)) {
    issues.push({ field: 'optionB', message: 'Option A and Option B must be different.' });
  }
  if (!UUID_PATTERN.test(categoryId)) issues.push({ field: 'categoryId', message: 'Please choose a category.' });
  if (name.length > FORM_LIMITS.nameMax) issues.push({ field: 'name', message: `Name must be ${FORM_LIMITS.nameMax} characters or fewer.` });
  if (email && !looksLikeEmail(email)) issues.push({ field: 'email', message: 'Please enter a valid email address or leave it blank.' });
  if (!agree) issues.push({ field: 'agree', message: 'Please confirm the submission agreement.' });
  if (/<\s*\/?\s*(script|iframe|object|embed|style|link)/i.test(optionA + optionB + name)) issues.push({ field: '_form', message: 'Submission rejected.' });

  issues.push(...envelopeIssues(obj, now));
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      optionA,
      optionB,
      categoryId,
      submitterName: name || null,
      submitterEmail: email || null,
      agreedToTerms: true,
      turnstileToken: readString(obj, 'turnstileToken'),
      website: '',
      renderedAt: Number(obj.renderedAt),
    },
  };
}

// ---------------------------------------------------------------------------
// Contact message
// ---------------------------------------------------------------------------

export const CONTACT_FIELDS = ['name', 'email', 'subject', 'message', 'privacy', ...ENVELOPE_KEYS] as const;

export function validateContact(body: unknown, now: number = Date.now()): ValidationResult<ContactMessage & FormEnvelope> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, issues: [{ field: '_form', message: 'Invalid request.' }] };
  }
  const obj = body as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  if (unknownFields(obj, CONTACT_FIELDS).length > 0) issues.push({ field: '_form', message: 'Unknown field.' });

  const name = cleanUserText(readString(obj, 'name'), FORM_LIMITS.nameMax + 20);
  const email = cleanUserText(readString(obj, 'email'), FORM_LIMITS.emailMax + 20).toLowerCase();
  const subject = cleanUserText(readString(obj, 'subject'), FORM_LIMITS.subjectMax + 20);
  const message = cleanUserTextMultiline(readString(obj, 'message'), FORM_LIMITS.messageMax + 100);
  const privacy = obj.privacy === true || obj.privacy === 'true' || obj.privacy === 'on';

  if (name.length < 1) issues.push({ field: 'name', message: 'Please enter your name.' });
  else if (name.length > FORM_LIMITS.nameMax) issues.push({ field: 'name', message: `Name must be ${FORM_LIMITS.nameMax} characters or fewer.` });
  if (!looksLikeEmail(email)) issues.push({ field: 'email', message: 'Please enter a valid email address so we can reply.' });
  if (subject.length < FORM_LIMITS.subjectMin) issues.push({ field: 'subject', message: 'Please enter a subject.' });
  else if (subject.length > FORM_LIMITS.subjectMax) issues.push({ field: 'subject', message: `Subject must be ${FORM_LIMITS.subjectMax} characters or fewer.` });
  if (message.length < FORM_LIMITS.messageMin) issues.push({ field: 'message', message: `Message must be at least ${FORM_LIMITS.messageMin} characters.` });
  else if (message.length > FORM_LIMITS.messageMax) issues.push({ field: 'message', message: `Message must be ${FORM_LIMITS.messageMax} characters or fewer.` });
  if (!privacy) issues.push({ field: 'privacy', message: 'Please acknowledge the privacy notice.' });
  if ((message.match(/https?:\/\//gi) ?? []).length > 3) issues.push({ field: 'message', message: 'Please include no more than three links.' });

  issues.push(...envelopeIssues(obj, now));
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      name,
      email,
      subject,
      message,
      turnstileToken: readString(obj, 'turnstileToken'),
      website: '',
      renderedAt: Number(obj.renderedAt),
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type FormServiceOutcome =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid'; readonly issues: readonly ValidationIssue[] }
  | { readonly kind: 'verification_failed'; readonly reason: string }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'unavailable' };

export interface FormContext {
  readonly hostname: string;
  /** Opaque, already-hashed client identifier for rate limiting. */
  readonly clientKey: string;
}

export class SubmissionService {
  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly verifier: HumanVerificationService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async submit(body: unknown, ctx: FormContext): Promise<FormServiceOutcome> {
    const parsed = validateSubmission(body);
    if (!parsed.ok) return { kind: 'invalid', issues: parsed.issues };

    if (!(await this.rateLimiter.allow(`submit:${ctx.clientKey}`, FORM_LIMITS.rateLimitPerHour, 3600))) return { kind: 'rate_limited' };

    const verification = await this.verifier.verify({
      token: parsed.value.turnstileToken,
      expectedAction: TURNSTILE.actions.submitQuestion,
      expectedHostname: ctx.hostname,
      remoteIdentifier: ctx.clientKey,
    });
    if (!verification.ok) return { kind: 'verification_failed', reason: verification.reason };

    if (!(await this.submissions.isCategoryAcceptingSubmissions(parsed.value.categoryId))) {
      return { kind: 'invalid', issues: [{ field: 'categoryId', message: 'Please choose a valid category.' }] };
    }

    const { turnstileToken: _t, website: _w, renderedAt: _r, ...submission } = parsed.value;
    const fingerprint = await sha256Hex(questionPairFingerprint(submission.optionA, submission.optionB));
    const outcome = await this.submissions.createSubmission(submission, fingerprint);
    if (outcome.kind === 'ok') return { kind: 'ok' };
    if (outcome.kind === 'duplicate') return { kind: 'duplicate' };
    if (outcome.kind === 'invalid') return { kind: 'invalid', issues: [{ field: '_form', message: 'Please check the form and try again.' }] };
    return { kind: 'unavailable' };
  }
}

export class ContactService {
  constructor(
    private readonly contact: ContactRepository,
    private readonly verifier: HumanVerificationService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async send(body: unknown, ctx: FormContext): Promise<FormServiceOutcome> {
    const parsed = validateContact(body);
    if (!parsed.ok) return { kind: 'invalid', issues: parsed.issues };

    if (!(await this.rateLimiter.allow(`contact:${ctx.clientKey}`, FORM_LIMITS.rateLimitPerHour, 3600))) return { kind: 'rate_limited' };

    const verification = await this.verifier.verify({
      token: parsed.value.turnstileToken,
      expectedAction: TURNSTILE.actions.contact,
      expectedHostname: ctx.hostname,
      remoteIdentifier: ctx.clientKey,
    });
    if (!verification.ok) return { kind: 'verification_failed', reason: verification.reason };

    const { turnstileToken: _t, website: _w, renderedAt: _r, ...message } = parsed.value;
    // Replay protection: same sender + same content within the retention window is a duplicate.
    const fingerprint = await sha256Hex(`${message.email}|${normalizeForComparison(message.subject)}|${normalizeForComparison(message.message)}`);
    const outcome = await this.contact.createMessage(message, fingerprint);
    if (outcome.kind === 'ok') return { kind: 'ok' };
    if (outcome.kind === 'duplicate') return { kind: 'duplicate' };
    if (outcome.kind === 'invalid') return { kind: 'invalid', issues: [{ field: '_form', message: 'Please check the form and try again.' }] };
    return { kind: 'unavailable' };
  }
}
