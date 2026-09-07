-- Editable static display count; historical public.votes records remain unchanged.
alter table public.questions add column if not exists display_vote_count integer not null default 2000 check (display_vote_count >= 0);
update public.questions set display_vote_count = 2000 + (abs(hashtext(id::text)) % 5001) where display_vote_count = 2000;
