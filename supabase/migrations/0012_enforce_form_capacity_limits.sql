-- Prevent unreviewed form records from growing without bound.
-- Advisory transaction locks make each capacity check concurrency-safe.

create index if not exists question_submissions_pending_idx
  on public.question_submissions (status)
  where status = 'pending';

create index if not exists contact_messages_unread_idx
  on public.contact_messages (is_read)
  where is_read = false;

create or replace function public.enforce_question_submission_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'pending' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('capacity:pending-question-submissions', 0)
  );

  if (
    select count(*)
    from public.question_submissions
    where status = 'pending'
  ) >= 100 then
    raise exception using
      errcode = '54000',
      message = 'pending question submission capacity reached';
  end if;

  return new;
end;

$$;

create or replace function public.enforce_contact_message_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_read then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.is_read = false then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('capacity:unread-contact-messages', 0)
  );

  if (
    select count(*)
    from public.contact_messages
    where is_read = false
  ) >= 50 then
    raise exception using
      errcode = '54000',
      message = 'unread contact message capacity reached';
  end if;

  return new;
end;

$$;

drop trigger if exists enforce_question_submission_capacity
  on public.question_submissions;

create trigger enforce_question_submission_capacity
before insert or update of status
on public.question_submissions
for each row
execute function public.enforce_question_submission_capacity();

drop trigger if exists enforce_contact_message_capacity
  on public.contact_messages;

create trigger enforce_contact_message_capacity
before insert or update of is_read
on public.contact_messages
for each row
execute function public.enforce_contact_message_capacity();

revoke all on function public.enforce_question_submission_capacity()
  from public, anon, authenticated;

revoke all on function public.enforce_contact_message_capacity()
  from public, anon, authenticated;
