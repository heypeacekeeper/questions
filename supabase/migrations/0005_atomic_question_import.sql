-- Import an entire validated CSV batch in one PostgreSQL transaction.
-- If any question or category link fails, the complete RPC call rolls back.

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

      if item ? 'display_vote_count' then
        insert into public.questions (
          option_a,
          option_b,
          status,
          sort_order,
          display_vote_count,
          is_demo
        )
        values (
          item ->> 'option_a',
          item ->> 'option_b',
          (item ->> 'status')::public.content_status,
          (item ->> 'sort_order')::integer,
          (item ->> 'display_vote_count')::integer,
          (item ->> 'is_demo')::boolean
        )
        returning id into question_id;
      else
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
      end if;

      insert into public.question_categories (question_id, category_id)
      select
        question_id,
        category_id::uuid
      from jsonb_array_elements_text(item -> 'category_ids') as category(category_id);

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
