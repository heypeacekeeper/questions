begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

delete from public.question_submissions;
delete from public.contact_messages;

insert into public.categories (
  id, name, slug, canonical_path, h1, seo_title, meta_description,
  short_description, status
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  'Behavior Test',
  'behavior-test',
  '/behavior-test/',
  'Behavior Test',
  'Behavior Test Category',
  'Published category used for database behavior testing.',
  'Database behavior tests',
  'published'
);

-- Duplicate-window behavior
select is(
  (
    select is_duplicate
    from public.create_question_submission_limited(
      'First option A', 'First option B',
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      'Tester', 'tester@example.com', repeat('a', 64), 3600
    )
  ),
  false,
  'first question submission is accepted'
);

select is(
  (
    select is_duplicate
    from public.create_question_submission_limited(
      'First option A', 'First option B',
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      'Tester', 'tester@example.com', repeat('a', 64), 3600
    )
  ),
  true,
  'question duplicate is rejected inside the window'
);

update public.question_submissions
set created_at = statement_timestamp() - interval '2 hours'
where fingerprint = repeat('a', 64);

select is(
  (
    select is_duplicate
    from public.create_question_submission_limited(
      'First option A', 'First option B',
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      'Tester', 'tester@example.com', repeat('a', 64), 3600
    )
  ),
  false,
  'question is accepted after duplicate window expires'
);

select is(
  (
    select is_duplicate
    from public.create_contact_message_limited(
      'Tester', 'tester@example.com', 'Test subject', 'Test message',
      repeat('b', 64), 3600
    )
  ),
  false,
  'first contact message is accepted'
);

select is(
  (
    select is_duplicate
    from public.create_contact_message_limited(
      'Tester', 'tester@example.com', 'Test subject', 'Test message',
      repeat('b', 64), 3600
    )
  ),
  true,
  'contact duplicate is rejected inside the window'
);

-- Retention behavior
delete from public.question_submissions;
delete from public.contact_messages;

perform public.create_contact_message_limited(
  'Old Tester', 'old@example.com', 'Old subject', 'Old message',
  repeat('c', 64), 3600
);

perform public.create_contact_message_limited(
  'Recent Tester', 'recent@example.com', 'Recent subject', 'Recent message',
  repeat('d', 64), 3600
);

perform public.create_question_submission_limited(
  'Old option A', 'Old option B',
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  'Old Tester', 'old@example.com', repeat('e', 64), 3600
);

perform public.create_question_submission_limited(
  'Recent option A', 'Recent option B',
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  'Recent Tester', 'recent@example.com', repeat('f', 64), 3600
);

update public.contact_messages
set created_at = statement_timestamp() - interval '2 days'
where fingerprint = repeat('c', 64);

update public.question_submissions
set created_at = statement_timestamp() - interval '2 days'
where fingerprint = repeat('e', 64);

select lives_ok(
  $test$
    select *
    from public.cleanup_expired_personal_data(
      interval '1 day',
      interval '1 day'
    )
  $test$,
  'retention cleanup executes'
);

select is(
  (select count(*) from public.contact_messages where fingerprint = repeat('c', 64)),
  0::bigint,
  'expired contact message is deleted'
);

select is(
  (select count(*) from public.contact_messages where fingerprint = repeat('d', 64)),
  1::bigint,
  'recent contact message is preserved'
);

select ok(
  (
    select submitter_name is null and submitter_email is null
    from public.question_submissions
    where fingerprint = repeat('e', 64)
  ),
  'expired submission personal data is anonymized'
);

select ok(
  (
    select submitter_name is not null and submitter_email is not null
    from public.question_submissions
    where fingerprint = repeat('f', 64)
  ),
  'recent submission personal data is preserved'
);

-- Capacity behavior
delete from public.question_submissions;
delete from public.contact_messages;

select lives_ok(
  $test$
    do $block$
    begin
      for i in 1..100 loop
        perform public.create_question_submission_limited(
          'Option A ' || i,
          'Option B ' || i,
          'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
          '',
          '',
          lpad(to_hex(i), 64, '0'),
          3600
        );
      end loop;
    end
    $block$
  $test$,
  'first 100 pending submissions are accepted'
);

select throws_ok(
  $test$
    select public.create_question_submission_limited(
      'Overflow option A',
      'Overflow option B',
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      '',
      '',
      lpad(to_hex(1001), 64, '0'),
      3600
    )
  $test$,
  '54000',
  'pending question submission capacity reached',
  '101st pending submission is rejected'
);

select lives_ok(
  $test$
    do $block$
    begin
      for i in 1..50 loop
        perform public.create_contact_message_limited(
          'Tester',
          'tester@example.com',
          'Subject ' || i,
          'Message ' || i,
          lpad(to_hex(i + 2000), 64, '0'),
          3600
        );
      end loop;
    end
    $block$
  $test$,
  'first 50 unread contact messages are accepted'
);

select throws_ok(
  $test$
    select public.create_contact_message_limited(
      'Overflow',
      'overflow@example.com',
      'Overflow subject',
      'Overflow message',
      lpad(to_hex(3000), 64, '0'),
      3600
    )
  $test$,
  '54000',
  'unread contact message capacity reached',
  '51st unread contact message is rejected'
);

select * from finish();

rollback;
