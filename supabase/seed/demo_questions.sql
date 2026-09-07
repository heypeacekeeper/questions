-- ============================================================================
-- DEMO QUESTIONS — optional. Three clearly labelled fixtures so the game,
-- sharing and static lists can be tested against a real database.
--
-- Every row has is_demo = true and option text starting with "[DEMO]".
-- Production builds FAIL if demo rows are published unless ALLOW_DEMO_CONTENT=true.
--
-- Load:   paste into the SQL editor, or: supabase db execute -f supabase/seed/demo_questions.sql
-- Delete: delete from public.questions where is_demo = true;
-- ============================================================================

insert into public.questions (id, option_a, option_b, status, share_code, sort_order, is_demo, published_at) values
  ('22222222-2222-4222-8222-000000000001', '[DEMO] have a pet dragon', '[DEMO] have a pet unicorn', 'published', 'demq22a', 10, true, now()),
  ('22222222-2222-4222-8222-000000000002', '[DEMO] always know when someone is lying', '[DEMO] always get away with lying', 'published', 'demq22b', 20, true, now()),
  ('22222222-2222-4222-8222-000000000003', '[DEMO] sweat maple syrup', '[DEMO] sneeze glitter', 'published', 'demq22c', 30, true, now())
on conflict (id) do nothing;

insert into public.question_categories (question_id, category_id) values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000006'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000007'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000003'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000009'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000008'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000007'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000005'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000011'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000010'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000002')
on conflict do nothing;
