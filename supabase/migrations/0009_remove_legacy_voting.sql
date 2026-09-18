-- ============================================================================
-- Remove obsolete voting infrastructure and static display counts.
--
-- Historical migrations remain unchanged so existing databases can safely
-- apply every migration in numerical order.
-- ============================================================================

-- Replace the CSV import function before removing display_vote_count.
create or replace function public.import_questions_atomic(p_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  question_id uuid;
  line_number integer;
  imported_count integer := 0;
  error_message text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) > 10000 then
    raise exception 'An import cannot contain more than 10000 questions';
  end if;

  for item in
    select value from jsonb_array_elements(p_rows)
  loop
    line_number := coalesce((item ->> 'line')::integer, 0);

    begin
      if jsonb_typeof(item -> 'category_ids') <> 'array'
        or jsonb_array_length(item -> 'category_ids') = 0 then
        raise exception 'at least one category ID is required';
      end if;

      insert into public.questions (
        option_a,
        option_b,
        status,
        sort_order,
        is_demo
      )
      values (
        item ->> 'option_a',
        item ->> 'option_b',
        (item ->> 'status')::public.content_status,
        (item ->> 'sort_order')::integer,
        (item ->> 'is_demo')::boolean
      )
      returning id into question_id;

      insert into public.question_categories (question_id, category_id)
      select
        question_id,
        category_id::uuid
      from jsonb_array_elements_text(item -> 'category_ids')
        as category(category_id);

      imported_count := imported_count + 1;
    exception
      when others then
        get stacked diagnostics error_message = message_text;

        raise exception using
          errcode = sqlstate,
          message = format('CSV line %s: %s', line_number, error_message);
    end;
  end loop;

  return imported_count;
end;

$$;

revoke all on function public.import_questions_atomic(jsonb)
from public, anon, authenticated;

grant execute on function public.import_questions_atomic(jsonb)
to service_role;

-- Replace the retention function with one that handles only current data.
select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-personal-data-retention';

drop function if exists public.cleanup_expired_personal_data(
  interval,
  interval,
  interval
);

create function public.cleanup_expired_personal_data(
  contact_retention interval default interval '12 months',
  submission_personal_data_retention interval default interval '90 days'
)
returns table (
  contact_messages_deleted bigint,
  submissions_anonymized bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  deleted_contacts bigint := 0;
  anonymized_submissions bigint := 0;
begin
  if contact_retention < interval '1 day'
    or contact_retention > interval '10 years' then
    raise exception 'contact retention must be between 1 day and 10 years';
  end if;

  if submission_personal_data_retention < interval '1 day'
    or submission_personal_data_retention > interval '10 years' then
    raise exception
      'submission personal-data retention must be between 1 day and 10 years';
  end if;

  delete from public.contact_messages
  where created_at < statement_timestamp() - contact_retention;

  get diagnostics deleted_contacts = row_count;

  update public.question_submissions
  set
    submitter_name = null,
    submitter_email = null
  where created_at <
    statement_timestamp() - submission_personal_data_retention
    and (submitter_name is not null or submitter_email is not null);

  get diagnostics anonymized_submissions = row_count;

  return query
    select deleted_contacts, anonymized_submissions;
end;

$$;

revoke all on function public.cleanup_expired_personal_data(
  interval,
  interval
) from public, anon, authenticated;

grant execute on function public.cleanup_expired_personal_data(
  interval,
  interval
) to service_role;

select cron.schedule(
  'daily-personal-data-retention',
  '17 3 * * *',
  $command$
    select public.cleanup_expired_personal_data();
  $command$
);

-- Remove obsolete functions, data, enum and display-count column.
drop function if exists public.cast_vote(
  uuid,
  public.vote_choice,
  text
);

drop function if exists public.get_vote_totals(uuid);

drop table if exists public.votes;

drop type if exists public.vote_choice;

alter table public.questions
  drop column if exists display_vote_count;
