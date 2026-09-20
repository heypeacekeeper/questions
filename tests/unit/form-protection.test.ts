import { describe, expect, it, vi } from 'vitest';
import {
  ContactService,
  SubmissionService,
  validateContact,
  validateSubmission,
} from '@/application/submission-service';

const categoryId = '11111111-1111-4111-8111-000000000001';
const envelope = {
  turnstileToken: 'valid-test-token',
  website: '',
  renderedAt: Date.now() - 10_000,
};

const validSubmission = {
  optionA: 'Fly through space',
  optionB: 'Breathe underwater',
  categoryId,
  name: '',
  email: '',
  agree: true,
  ...envelope,
};

const validContact = {
  name: 'Tester',
  email: 'tester@example.com',
  subject: 'Website question',
  message: 'This is a sufficiently long contact message.',
  privacy: true,
  ...envelope,
};

describe('form abuse protections', () => {
  it('rejects filled honeypots before external services run', async () => {
    const allow = vi.fn();
    const verify = vi.fn();
    const createMessage = vi.fn();

    const service = new ContactService(
      { createMessage } as never,
      { verify } as never,
      { allow } as never,
    );

    const outcome = await service.send(
      { ...validContact, website: 'spam.example' },
      { hostname: 'wouldyouratherquestions.org', clientKey: 'client-key' },
    );

    expect(outcome.kind).toBe('invalid');
    expect(allow).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('rejects forms submitted too quickly or after expiry', () => {
    const now = Date.now();

    expect(
      validateSubmission({
        ...validSubmission,
        renderedAt: now - 100,
      }).ok,
    ).toBe(false);

    expect(
      validateContact(
        {
          ...validContact,
          renderedAt: now - 6 * 60 * 60 * 1000 - 1,
        },
        now,
      ).ok,
    ).toBe(false);
  });

  it('stops submission processing when rate limited', async () => {
    const allow = vi.fn().mockResolvedValue(false);
    const verify = vi.fn();
    const isCategoryAcceptingSubmissions = vi.fn();
    const createSubmission = vi.fn();

    const service = new SubmissionService(
      { isCategoryAcceptingSubmissions, createSubmission } as never,
      { verify } as never,
      { allow } as never,
    );

    const outcome = await service.submit(validSubmission, {
      hostname: 'wouldyouratherquestions.org',
      clientKey: 'client-key',
    });

    expect(outcome).toEqual({ kind: 'rate_limited' });
    expect(allow).toHaveBeenCalledWith('submit:client-key', 10, 60);
    expect(verify).not.toHaveBeenCalled();
    expect(isCategoryAcceptingSubmissions).not.toHaveBeenCalled();
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('stops contact processing when human verification fails', async () => {
    const allow = vi.fn().mockResolvedValue(true);
    const verify = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'invalid',
    });
    const createMessage = vi.fn();

    const service = new ContactService(
      { createMessage } as never,
      { verify } as never,
      { allow } as never,
    );

    const outcome = await service.send(validContact, {
      hostname: 'wouldyouratherquestions.org',
      clientKey: 'client-key',
    });

    expect(outcome).toEqual({
      kind: 'verification_failed',
      reason: 'invalid',
    });
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('rejects a category that no longer accepts submissions', async () => {
    const allow = vi.fn().mockResolvedValue(true);
    const verify = vi.fn().mockResolvedValue({ ok: true });
    const isCategoryAcceptingSubmissions = vi.fn().mockResolvedValue(false);
    const createSubmission = vi.fn();

    const service = new SubmissionService(
      { isCategoryAcceptingSubmissions, createSubmission } as never,
      { verify } as never,
      { allow } as never,
    );

    const outcome = await service.submit(validSubmission, {
      hostname: 'wouldyouratherquestions.org',
      clientKey: 'client-key',
    });

    expect(outcome.kind).toBe('invalid');
    expect(createSubmission).not.toHaveBeenCalled();
  });
});
