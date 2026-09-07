-- ============================================================================
-- Repeat voting with compact aggregate totals.
--
-- public.votes is retained as historical legacy data and is no longer written
-- after this migration. New votes are stored only as per-question aggregates.
-- ============================================================================

create table if not exists public.question_vote_totals (
  question_id uuid primary key references public.questions (id) on delete cascade,
  votes_a bigint not null default 0 check (votes_a >= 0),
  votes_b bigint not null default 0 check (votes_b >= 0),
  updated_at timestamptz not null default now()
);

-- Transfer the exact legacy counts once without deleting historical rows.
insert into public.question_vote_totals (question_id, votes_a, votes_b, updated_at)
select
  v.question_id,
  count(*) filter (where v.choice = 'A'),
  count(*) filter (where v.choice = 'B'),
  now()
from public.votes v
group by v.question_id
on conflict (question_id) do update set
  votes_a = excluded.votes_a,
  votes_b = excluded.votes_b,
  updated_at = excluded.updated_at;

alter table public.question_vote_totals enable row level security;
revoke all on public.question_vote_totals from public, anon, authenticated;
-- Historical vote rows are not needed at runtime after this migration.
revoke all on public.votes from public, anon, authenticated, service_role;

-- Disable the former three-argument, one-vote-per-voter RPC.
revoke all on function public.cast_vote(uuid, public.vote_choice, text) from public, anon, authenticated, service_role;

create or replace function public.cast_vote(
  p_question_id uuid,
  p_choice public.vote_choice
)
returns table (
  status text,
  votes_a bigint,
  votes_b bigint,
  total bigint,
  percent_a integer,
  percent_b integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.content_status;
  v_a bigint := 0;
  v_b bigint := 0;
  v_total bigint := 0;
  v_percent_a integer := 0;
  v_percent_b integer := 0;
  v_raw_a numeric;
  v_raw_b numeric;
begin
  select q.status into v_status from public.questions q where q.id = p_question_id;
  if not found then
    return query select 'not_found'::text, 0::bigint, 0::bigint, 0::bigint, 0, 0;
    return;
  end if;
  if v_status <> 'published' then
    return query select 'not_published'::text, 0::bigint, 0::bigint, 0::bigint, 0, 0;
    return;
  end if;

  -- UPSERT increments a single row atomically; no read-modify-write race exists.
  insert into public.question_vote_totals as totals (question_id, votes_a, votes_b, updated_at)
  values (
    p_question_id,
    case when p_choice = 'A' then 1 else 0 end,
    case when p_choice = 'B' then 1 else 0 end,
    now()
  )
  on conflict (question_id) do update set
    votes_a = totals.votes_a + case when p_choice = 'A' then 1 else 0 end,
    votes_b = totals.votes_b + case when p_choice = 'B' then 1 else 0 end,
    updated_at = now()
  returning totals.votes_a, totals.votes_b into v_a, v_b;

  v_total := v_a + v_b;
  if v_total > 0 then
    v_raw_a := v_a * 100.0 / v_total;
    v_raw_b := v_b * 100.0 / v_total;
    v_percent_a := floor(v_raw_a);
    v_percent_b := floor(v_raw_b);
    if v_percent_a + v_percent_b < 100 then
      if (v_raw_a - v_percent_a) >= (v_raw_b - v_percent_b) then
        v_percent_a := v_percent_a + (100 - v_percent_a - v_percent_b);
      else
        v_percent_b := v_percent_b + (100 - v_percent_a - v_percent_b);
      end if;
    end if;
  end if;

  return query select 'ok'::text, v_a, v_b, v_total, v_percent_a, v_percent_b;
end;
$$;

revoke all on function public.cast_vote(uuid, public.vote_choice) from public, anon, authenticated;
grant execute on function public.cast_vote(uuid, public.vote_choice) to service_role;

create or replace function public.get_vote_totals(p_question_id uuid)
returns table (votes_a bigint, votes_b bigint)
language sql
security definer
set search_path = public
stable
as $$
  select totals.votes_a, totals.votes_b
  from public.question_vote_totals totals
  where totals.question_id = p_question_id;
$$;

revoke all on function public.get_vote_totals(uuid) from public, anon, authenticated;
grant execute on function public.get_vote_totals(uuid) to service_role;
