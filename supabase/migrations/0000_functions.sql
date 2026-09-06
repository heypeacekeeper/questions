-- ============================================================================
-- Helper functions that the schema depends on (share codes).
-- ============================================================================

create extension if not exists "pgcrypto";

-- Random permanent share code from an unambiguous alphabet (no 0/1/i/l/o).
-- Independent of question text by design.
create or replace function public.generate_share_code(code_length integer default 7)
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  result text := '';
  i integer;
begin
  if code_length < 6 or code_length > 12 then
    raise exception 'share code length must be between 6 and 12';
  end if;
  for i in 1..code_length loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

revoke all on function public.generate_share_code(integer) from public, anon, authenticated;
