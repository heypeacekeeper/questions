-- Replace permanent fingerprint uniqueness with concurrency-safe time windows.
--
-- Contact messages: block identical content for 24 hours.
-- Question submissions: block identical/reversed pairs for 30 days.
--
-- The application passes the configured window to these functions. Advisory
-- transaction locks prevent simultaneous matching requests from both inserting.

alter table public.contact_messages
  drop constraint if exists contact_fingerprint_unique;

alter table public.question_submissions
  drop constraint if exists submissions_fingerprint_unique;

create index if not exists contact_messages_fingerprint_created_idx
  on public.contact_messages (fingerprint, created_at desc);

create index if not exists submissions_fingerprint_created_idx
  on public.question_submissions (fingerprint, created_at desc);

create or replace function public.create_contact_message_limited(
  p_name text,
  p_email text,
  p_subject text,
  p_message text,
  p_fingerprint text,
  p_duplicate_window_seconds integer
)
returns table (
  id uuid,
  created_at timestamptz,
  is_duplicate boolean
)
language plpgsql
set search_path = ''
as $$
declare
  inserted_id uuid;
  inserted_at timestamptz;
begin
  if p_duplicate_window_seconds < 60
    or p_duplicate_window_seconds > 604800 then
    raise exception 'contact duplicate window must be between 60 and 604800 seconds';
  end if;

  if p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid contact fingerprint';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('contact:' || p_fingerprint, 0)
  );

  if exists (
    select 1
    from public.contact_messages as existing
    where existing.fingerprint = p_fingerprint
      and existing.created_at >=
        statement_timestamp() - make_interval(secs => p_duplicate_window_seconds)
  ) then
    return query
      select null::uuid, null::timestamptz, true;
    return;
  end if;

  insert into public.contact_messages (
    name,
    email,
    subject,
    message,
    fingerprint
  )
  values (
    p_name,
    p_email,
    p_subject,
    p_message,
    p_fingerprint
  )
  returning
    contact_messages.id,
    contact_messages.created_at
  into inserted_id, inserted_at;

  return query
    select inserted_id, inserted_at, false;
end;

$$;

create or replace function public.create_question_submission_limited(
  p_option_a text,
  p_option_b text,
  p_category_id uuid,
  p_submitter_name text,
  p_submitter_email text,
  p_fingerprint text,
  p_duplicate_window_seconds integer
)
returns table (
  id uuid,
  status public.submission_status,
  created_at timestamptz,
  is_duplicate boolean
)
language plpgsql
set search_path = ''
as $$
declare
  inserted_id uuid;
  inserted_status public.submission_status;
  inserted_at timestamptz;
begin
  if p_duplicate_window_seconds < 60
    or p_duplicate_window_seconds > 7776000 then
    raise exception 'submission duplicate window must be between 60 and 7776000 seconds';
  end if;

  if p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid submission fingerprint';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('submission:' || p_fingerprint, 0)
  );

  if exists (
    select 1
    from public.question_submissions as existing
    where existing.fingerprint = p_fingerprint
      and existing.created_at >=
        statement_timestamp() - make_interval(secs => p_duplicate_window_seconds)
  ) then
    return query
      select
        null::uuid,
        null::public.submission_status,
        null::timestamptz,
        true;
    return;
  end if;

  insert into public.question_submissions (
    option_a,
    option_b,
    category_id,
    submitter_name,
    submitter_email,
    agreed_to_terms,
    fingerprint
  )
  values (
    p_option_a,
    p_option_b,
    p_category_id,
    nullif(p_submitter_name, ''),
    nullif(p_submitter_email, ''),
    true,
    p_fingerprint
  )
  returning
    question_submissions.id,
    question_submissions.status,
    question_submissions.created_at
  into inserted_id, inserted_status, inserted_at;

  return query
    select inserted_id, inserted_status, inserted_at, false;
end;

$$;

revoke all on function public.create_contact_message_limited(
  text,
  text,
  text,
  text,
  text,
  integer
) from public, anon, authenticated;

revoke all on function public.create_question_submission_limited(
  text,
  text,
  uuid,
  text,
  text,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.create_contact_message_limited(
  text,
  text,
  text,
  text,
  text,
  integer
) to service_role;

grant execute on function public.create_question_submission_limited(
  text,
  text,
  uuid,
  text,
  text,
  text,
  integer
) to service_role;
