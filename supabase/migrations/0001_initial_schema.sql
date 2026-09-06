-- ============================================================================
-- Would You Rather Questions — initial schema
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.content_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vote_choice as enum ('A', 'B');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.submission_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- updated_at trigger helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- categories
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(btrim(name)) between 2 and 60),
  slug                  text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 80),
  canonical_path        text not null check (canonical_path ~ '^/[a-z0-9]+(?:-[a-z0-9]+)*/$' and char_length(canonical_path) <= 120),
  h1                    text not null check (char_length(btrim(h1)) between 2 and 120),
  seo_title             text not null check (char_length(btrim(seo_title)) between 2 and 70),
  meta_description      text not null check (char_length(btrim(meta_description)) between 20 and 170),
  introduction          text not null default '' check (char_length(introduction) <= 4000),
  short_description     text not null check (char_length(btrim(short_description)) between 2 and 80),
  icon                  text not null default '❓' check (char_length(icon) <= 8),
  status                public.content_status not null default 'draft',
  nav_featured          boolean not null default false,
  include_in_mixed_game boolean not null default true,
  requires_age_gate     boolean not null default false,
  is_child_safe         boolean not null default false,
  is_mature             boolean not null default false,
  seasonal_start        date,
  seasonal_end          date,
  sort_order            integer not null default 1000 check (sort_order >= 0 and sort_order <= 1000000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint categories_slug_unique unique (slug),
  constraint categories_canonical_path_unique unique (canonical_path),
  constraint categories_seasonal_pair check ((seasonal_start is null) = (seasonal_end is null)),
  -- A category cannot be both child-safe and mature, and age-gated implies mature.
  constraint categories_child_vs_mature check (not (is_child_safe and is_mature)),
  constraint categories_age_gate_implies_mature check (not requires_age_gate or is_mature)
);

create index if not exists categories_status_sort_idx on public.categories (status, sort_order);
create index if not exists categories_nav_idx on public.categories (nav_featured) where status = 'published';

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- questions
-- ----------------------------------------------------------------------------
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  option_a      text not null check (char_length(btrim(option_a)) between 2 and 200),
  option_b      text not null check (char_length(btrim(option_b)) between 2 and 200),
  status        public.content_status not null default 'draft',
  -- Permanent random short code; NEVER derived from question text.
  share_code    text not null default public.generate_share_code(),
  sort_order    integer not null default 1000 check (sort_order >= 0 and sort_order <= 10000000),
  -- Demo fixtures are flagged so production builds can refuse them.
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,

  constraint questions_share_code_unique unique (share_code),
  constraint questions_share_code_format check (share_code ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{6,12}$'),
  constraint questions_options_differ check (lower(btrim(option_a)) <> lower(btrim(option_b))),
  constraint questions_published_at_when_published check (status <> 'published' or published_at is not null)
);

create index if not exists questions_status_sort_idx on public.questions (status, sort_order, created_at);
create index if not exists questions_share_code_idx on public.questions (share_code);

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

-- Auto-fill published_at the first time a question is published.
create or replace function public.set_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists questions_set_published_at on public.questions;
create trigger questions_set_published_at before insert or update on public.questions
  for each row execute function public.set_published_at();

-- ----------------------------------------------------------------------------
-- question_categories (many-to-many)
-- ----------------------------------------------------------------------------
create table if not exists public.question_categories (
  question_id uuid not null references public.questions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (question_id, category_id)
);

create index if not exists question_categories_category_idx on public.question_categories (category_id, question_id);

-- ----------------------------------------------------------------------------
-- votes
-- voter_hash is an HMAC computed server-side from an anonymous token. Raw
-- tokens and IP addresses are never stored.
-- ----------------------------------------------------------------------------
create table if not exists public.votes (
  id          bigint generated always as identity primary key,
  question_id uuid not null references public.questions (id) on delete cascade,
  choice      public.vote_choice not null,
  voter_hash  text not null check (voter_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  constraint votes_one_per_voter unique (question_id, voter_hash)
);

create index if not exists votes_question_choice_idx on public.votes (question_id, choice);

-- ----------------------------------------------------------------------------
-- question_submissions (private; reviewed in the Supabase dashboard)
-- ----------------------------------------------------------------------------
create table if not exists public.question_submissions (
  id              uuid primary key default gen_random_uuid(),
  option_a        text not null check (char_length(btrim(option_a)) between 2 and 200),
  option_b        text not null check (char_length(btrim(option_b)) between 2 and 200),
  category_id     uuid not null references public.categories (id) on delete restrict,
  submitter_name  text check (submitter_name is null or char_length(submitter_name) <= 80),
  submitter_email text check (submitter_email is null or (char_length(submitter_email) <= 254 and submitter_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')),
  agreed_to_terms boolean not null default true check (agreed_to_terms),
  status          public.submission_status not null default 'pending',
  -- sha256 of the normalized, order-independent A/B pair. Blocks exact + reversed duplicates.
  fingerprint     text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  reviewer_notes  text check (reviewer_notes is null or char_length(reviewer_notes) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint submissions_options_differ check (lower(btrim(option_a)) <> lower(btrim(option_b))),
  constraint submissions_fingerprint_unique unique (fingerprint)
);

create index if not exists submissions_status_idx on public.question_submissions (status, created_at);

drop trigger if exists submissions_set_updated_at on public.question_submissions;
create trigger submissions_set_updated_at before update on public.question_submissions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- contact_messages (private)
-- ----------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  email       text not null check (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  subject     text not null check (char_length(btrim(subject)) between 2 and 150),
  message     text not null check (char_length(btrim(message)) between 10 and 4000),
  -- Replay / duplicate guard (sha256 of email + normalized subject + message).
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint contact_fingerprint_unique unique (fingerprint)
);

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

-- ----------------------------------------------------------------------------
-- Row Level Security — deny everything to anon/authenticated by default.
-- The site never talks to the database from the browser. The build and the
-- Worker use the secret (service-role) key which bypasses RLS.
-- If a publishable-key read path is ever needed, add explicit SELECT policies
-- limited to published rows.
-- ----------------------------------------------------------------------------
alter table public.categories           enable row level security;
alter table public.questions            enable row level security;
alter table public.question_categories  enable row level security;
alter table public.votes                enable row level security;
alter table public.question_submissions enable row level security;
alter table public.contact_messages     enable row level security;

-- Optional read-only public policies for PUBLISHED content (safe; no private data).
drop policy if exists "public read published categories" on public.categories;
create policy "public read published categories" on public.categories
  for select to anon, authenticated using (status = 'published');

drop policy if exists "public read published questions" on public.questions;
create policy "public read published questions" on public.questions
  for select to anon, authenticated using (status = 'published');

drop policy if exists "public read question_categories of published" on public.question_categories;
create policy "public read question_categories of published" on public.question_categories
  for select to anon, authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and q.status = 'published'));

-- votes, question_submissions, contact_messages: NO policies → anon/authenticated get nothing.

-- Belt and braces: revoke table privileges from public roles on private tables.
revoke all on public.votes from anon, authenticated;
revoke all on public.question_submissions from anon, authenticated;
revoke all on public.contact_messages from anon, authenticated;
