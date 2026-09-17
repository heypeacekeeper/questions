-- Generate cryptographically secure, permanent question share codes.
--
-- Existing share codes remain unchanged. New questions receive 10-character
-- codes generated from pgcrypto bytes and checked for collisions.

create extension if not exists "pgcrypto";

create or replace function public.generate_share_code(
  code_length integer default 10
)
returns text
language plpgsql
volatile
set search_path = pg_catalog, extensions
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  result text := '';
  random_bytes bytea;
  byte_value integer;
  byte_index integer;
begin
  if code_length < 6 or code_length > 12 then
    raise exception 'share code length must be between 6 and 12';
  end if;

  -- The alphabet contains 31 characters. Accepting only byte values below 248
  -- avoids modulo bias because 248 is exactly divisible by 31.
  while char_length(result) < code_length loop
    random_bytes := extensions.gen_random_bytes(code_length * 2);

    for byte_index in 0..octet_length(random_bytes) - 1 loop
      byte_value := get_byte(random_bytes, byte_index);

      if byte_value < 248 then
        result := result || substr(
          alphabet,
          (byte_value % char_length(alphabet)) + 1,
          1
        );

        exit when char_length(result) = code_length;
      end if;
    end loop;
  end loop;

  return result;
end;

$$;

create or replace function public.generate_unique_share_code(
  code_length integer default 10,
  max_attempts integer default 16
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempt integer;
begin
  if max_attempts < 1 or max_attempts > 100 then
    raise exception 'share code attempts must be between 1 and 100';
  end if;

  for attempt in 1..max_attempts loop
    candidate := public.generate_share_code(code_length);

    -- Serialize only transactions that happen to generate the same candidate.
    perform pg_advisory_xact_lock(
      hashtextextended('share-code:' || candidate, 0)
    );

    if not exists (
      select 1
      from public.questions as question
      where question.share_code = candidate
    ) then
      return candidate;
    end if;
  end loop;

  raise exception using
    errcode = '23505',
    message = format(
      'Could not generate a unique share code after %s attempts',
      max_attempts
    );
end;

$$;

alter table public.questions
  alter column share_code
  set default public.generate_unique_share_code(10, 16);

revoke all on function public.generate_share_code(integer)
from public, anon, authenticated;

revoke all on function public.generate_unique_share_code(integer, integer)
from public, anon, authenticated;

grant execute on function public.generate_share_code(integer)
to service_role;

grant execute on function public.generate_unique_share_code(integer, integer)
to service_role;
