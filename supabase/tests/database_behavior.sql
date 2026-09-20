begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- RPC permissions
select ok(
  not has_function_privilege(
    'anon',
    'public.create_contact_message_limited(text,text,text,text,text,integer)',
    'EXECUTE'
  ),
  'anon cannot execute contact RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_contact_message_limited(text,text,text,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated cannot execute contact RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_contact_message_limited(text,text,text,text,text,integer)',
    'EXECUTE'
  ),
  'service role can execute contact RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_question_submission_limited(text,text,uuid,text,text,text,integer)',
    'EXECUTE'
  ),
  'anon cannot execute submission RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_question_submission_limited(text,text,uuid,text,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated cannot execute submission RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_question_submission_limited(text,text,uuid,text,text,text,integer)',
    'EXECUTE'
  ),
  'service role can execute submission RPC'
);

-- Dedicated categories; transaction rollback removes them.
insert into public.categories (
  id, name, slug, canonical_path, h1, seo_title, meta_description,
  short_description, status
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    'Test Published', 'test-published', '/test-published/',
    'Test Published', 'Test Published Category',
    'Published category used by database behavior tests.',
    'Published test category', 'published'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
    'Test Draft', 'test-draft', '/test-draft/',
    'Test Draft', 'Test Draft Category',
    'Draft category used by database behavior tests.',
    'Draft test category', 'draft'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
    'Test Archived', 'test-archived', '/test-archived/',
    'Test Archived', 'Test Archived Category',
    'Archived category used by database behavior tests.',
    'Archived test category', 'archived'
  );

select lives_ok(
  $test$
    select public.create_question_submission_limited(
      'Published option A',
      'Published option B',
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      '',
      '',
      repeat('a', 64),
      3600
    )
  $test$,
  'published category accepts submissions'
);

select throws_ok(
  $test$
    select public.create_question_submission_limited(
      'Draft option A',
      'Draft option B',
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
      '',
      '',
      repeat('b', 64),
      3600
    )
  $test$,
  '23514',
  'submission category must be published',
  'draft category rejects submissions'
);

select throws_ok(
  $test$
    select public.create_question_submission_limited(
      'Archived option A',
      'Archived option B',
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
      '',
      '',
      repeat('c', 64),
      3600
    )
  $test$,
  '23514',
  'submission category must be published',
  'archived category rejects submissions'
);

select throws_ok(
  $test$
    select public.create_question_submission_limited(
      'Unknown option A',
      'Unknown option B',
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000099',
      '',
      '',
      repeat('d', 64),
      3600
    )
  $test$,
  '23514',
  'submission category must be published',
  'unknown category rejects submissions'
);

select * from finish();

rollback;
