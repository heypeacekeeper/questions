import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/0012_enforce_form_capacity_limits.sql', import.meta.url),
  'utf8',
);

describe('form capacity migration', () => {
  it('caps pending question submissions at 100', () => {
    expect(migration).toContain("where status = 'pending'");
    expect(migration).toMatch(/\)\s*>= 100 then/);
    expect(migration).toContain("hashtextextended('capacity:pending-question-submissions', 0)");
    expect(migration).toMatch(
      /before insert or update of status\s+on public\.question_submissions/,
    );
  });

  it('caps unread contact messages at 50', () => {
    expect(migration).toContain('where is_read = false');
    expect(migration).toMatch(/\)\s*>= 50 then/);
    expect(migration).toContain("hashtextextended('capacity:unread-contact-messages', 0)");
    expect(migration).toMatch(/before insert or update of is_read\s+on public\.contact_messages/);
  });

  it('uses partial indexes and keeps trigger functions private', () => {
    expect(migration).toContain('question_submissions_pending_idx');
    expect(migration).toContain('contact_messages_unread_idx');
    expect(migration).toMatch(
      /revoke all on function public\.enforce_question_submission_capacity\(\)\s+from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.enforce_contact_message_capacity\(\)\s+from public, anon, authenticated;/,
    );
  });
});
