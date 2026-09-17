-- Automatically remove personal and legacy interaction data that is no longer
-- needed.
--
-- Contact messages: delete after 12 months.
-- Submission names/emails: anonymize after 90 days.
-- Historical vote records: delete after 90 days.
-- Submitted question text and moderation status are preserved.

create extension if not exists pg_cron with schema pg_catalog;

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at);

create index if not exists question_submissions_personal_data_created_idx
  on public.question_submissions (created_at)
  where submitter_name is not null or submitter_email is not null;

create index if not exists votes_created_at_idx
  on public.votes (created_at);

create or replace function public.cleanup_expired_personal_data(
  contact_retention interval default interval '12 months',
  submission_personal_data_retention interval default interval '90 days',
  vote_retention interval default interval '90 days'
)
returns table (
  contact_messages_deleted bigint,
  submissions_anonymized bigint,
  votes_deleted bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  deleted_contacts bigint := 0;
  anonymized_submissions bigint := 0;
  deleted_votes bigint := 0;
begin
  if contact_retention < interval '1 day'
    or contact_retention > interval '10 years' then
    raise exception 'contact retention must be between 1 day and 10 years';
  end if;

  if submission_personal_data_retention < interval '1 day'
    or submission_personal_data_retention > interval '10 years' then
    raise exception 'submission personal-data retention must be between 1 day and 10 years';
  end if;

  if vote_retention < interval '1 day'
    or vote_retention > interval '10 years' then
    raise exception 'vote retention must be between 1 day and 10 years';
  end if;

  delete from public.contact_messages
  where created_at < statement_timestamp() - contact_retention;

  get diagnostics deleted_contacts = row_count;

  update public.question_submissions
  set
    submitter_name = null,
    submitter_email = null
  where created_at < statement_timestamp() - submission_personal_data_retention
    and (submitter_name is not null or submitter_email is not null);

  get diagnostics anonymized_submissions = row_count;

  delete from public.votes
  where created_at < statement_timestamp() - vote_retention;

  get diagnostics deleted_votes = row_count;

  return query
    select deleted_contacts, anonymized_submissions, deleted_votes;
end;

$$;

revoke all on function public.cleanup_expired_personal_data(
  interval,
  interval,
  interval
) from public, anon, authenticated;

grant execute on function public.cleanup_expired_personal_data(
  interval,
  interval,
  interval
) to service_role;

-- Keep the migration safe to reapply by replacing an existing job with the
-- same name.
select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-personal-data-retention';

select cron.schedule(
  'daily-personal-data-retention',
  '17 3 * * *',
  $command$
    select public.cleanup_expired_personal_data();
  $command$
);
