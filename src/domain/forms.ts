/** Form-related domain models (submissions and contact). */

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface QuestionSubmission {
  readonly optionA: string;
  readonly optionB: string;
  readonly categoryId: string;
  readonly submitterName: string | null;
  /** Optional, private, follow-up only. Never public. */
  readonly submitterEmail: string | null;
  readonly agreedToTerms: true;
}

export interface StoredQuestionSubmission extends QuestionSubmission {
  readonly id: string;
  readonly status: SubmissionStatus;
  /** Normalized fingerprint for duplicate detection. */
  readonly fingerprint: string;
  readonly createdAt: string;
}

export interface ContactMessage {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
}

export interface StoredContactMessage extends ContactMessage {
  readonly id: string;
  readonly createdAt: string;
}

/** A field-level validation problem. `field` is `_form` for whole-form errors. */
export interface ValidationIssue {
  readonly field: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
