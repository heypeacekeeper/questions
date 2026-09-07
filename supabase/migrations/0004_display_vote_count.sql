-- Owner-editable static display content. This does not record clicks or alter legacy votes.
alter table public.questions add column if not exists display_vote_count integer;
update public.questions
set display_vote_count = 2000 + (('x' || substr(md5(id::text), 1, 8))::bit(32)::bigint % 5001)
where display_vote_count is null;
alter table public.questions alter column display_vote_count set default (2000 + floor(random() * 5001)::integer);
alter table public.questions alter column display_vote_count set not null;
alter table public.questions drop constraint if exists questions_display_vote_count_nonnegative;
alter table public.questions add constraint questions_display_vote_count_nonnegative check (display_vote_count >= 0);
