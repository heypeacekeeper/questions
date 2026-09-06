-- ============================================================================
-- cast_vote: transaction-safe insert-or-lookup + totals in one call.
--
-- 1. Validates the question exists
-- 2. Confirms it is published
-- 3. Checks for an existing vote by this voter_hash
-- 4. Inserts the vote (ON CONFLICT DO NOTHING handles races)
-- 5/6. Counts A and B
-- 7. Returns totals + percentages (largest-remainder rounding, sums to 100)
--
-- SECURITY DEFINER so the caller needs EXECUTE only. Execution is granted to
-- service_role only; the browser never calls this directly.
-- ============================================================================

create or replace function public.cast_vote(
  p_question_id uuid,
  p_choice public.vote_choice,
  p_voter_hash text
)
returns table (
  status      text,           -- 'ok' | 'not_found' | 'not_published'
  accepted    boolean,        -- true when a new vote row was inserted
  your_choice public.vote_choice,
  votes_a     bigint,
  votes_b     bigint,
  total       bigint,
  percent_a   integer,
  percent_b   integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   public.content_status;
  v_existing public.vote_choice;
  v_a        bigint := 0;
  v_b        bigint := 0;
  v_total    bigint := 0;
  v_pa       integer := 0;
  v_pb       integer := 0;
  v_fa       numeric;
  v_fb       numeric;
  v_inserted boolean := false;
begin
  if p_voter_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid voter hash';
  end if;

  select q.status into v_status from public.questions q where q.id = p_question_id;
  if not found then
    return query select 'not_found'::text, false, p_choice, 0::bigint, 0::bigint, 0::bigint, 0, 0;
    return;
  end if;
  if v_status <> 'published' then
    return query select 'not_published'::text, false, p_choice, 0::bigint, 0::bigint, 0::bigint, 0, 0;
    return;
  end if;

  insert into public.votes (question_id, choice, voter_hash)
  values (p_question_id, p_choice, p_voter_hash)
  on conflict (question_id, voter_hash) do nothing;
  v_inserted := found;

  select v.choice into v_existing from public.votes v
   where v.question_id = p_question_id and v.voter_hash = p_voter_hash;

  select
    count(*) filter (where v.choice = 'A'),
    count(*) filter (where v.choice = 'B')
  into v_a, v_b
  from public.votes v where v.question_id = p_question_id;

  v_total := v_a + v_b;
  if v_total > 0 then
    v_fa := v_a * 100.0 / v_total;
    v_fb := v_b * 100.0 / v_total;
    v_pa := floor(v_fa);
    v_pb := floor(v_fb);
    if v_pa + v_pb < 100 then
      if (v_fa - v_pa) >= (v_fb - v_pb) then v_pa := v_pa + (100 - v_pa - v_pb);
      else v_pb := v_pb + (100 - v_pa - v_pb);
      end if;
    end if;
  end if;

  return query select 'ok'::text, v_inserted, coalesce(v_existing, p_choice), v_a, v_b, v_total, v_pa, v_pb;
end;
$$;

revoke all on function public.cast_vote(uuid, public.vote_choice, text) from public, anon, authenticated;
grant execute on function public.cast_vote(uuid, public.vote_choice, text) to service_role;

-- ----------------------------------------------------------------------------
-- Read-only totals (used by tests/tools; NOT called on page view).
-- ----------------------------------------------------------------------------
create or replace function public.get_vote_totals(p_question_id uuid)
returns table (votes_a bigint, votes_b bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where choice = 'A'),
    count(*) filter (where choice = 'B')
  from public.votes where question_id = p_question_id;
$$;

revoke all on function public.get_vote_totals(uuid) from public, anon, authenticated;
grant execute on function public.get_vote_totals(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Build-time helper: published categories with published question counts.
-- ----------------------------------------------------------------------------
create or replace view public.category_question_counts as
select
  c.id as category_id,
  count(q.id) filter (where q.status = 'published') as published_question_count
from public.categories c
left join public.question_categories qc on qc.category_id = c.id
left join public.questions q on q.id = qc.question_id
group by c.id;

grant select on public.category_question_counts to service_role;
