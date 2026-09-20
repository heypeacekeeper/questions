-- Enforce category publication status inside the submission transaction.
--
-- The application performs the same check for a friendly response, but this
-- database check prevents races and accidental direct RPC calls from creating
-- submissions for draft, archived or unknown categories.

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

  -- Prevent the category status from changing between validation and insert.
  perform 1
  from public.categories as category
  where category.id = p_category_id
    and category.status = 'published'
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'submission category must be published';
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

revoke all on function public.create_question_submission_limited(
  text,
  text,
  uuid,
  text,
  text,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.create_question_submission_limited(
  text,
  text,
  uuid,
  text,
  text,
  text,
  integer
) to service_role;
