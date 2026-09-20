-- ============================================================================
-- Finalize the approved 27-category catalog.
--
-- Historical migrations remain unchanged. Existing linked legacy categories
-- are archived instead of deleted so no submitted or published data is lost.
-- ============================================================================

insert into public.categories (
  id,
  name,
  slug,
  canonical_path,
  h1,
  seo_title,
  meta_description,
  introduction,
  short_description,
  icon,
  status,
  nav_featured,
  include_in_mixed_game,
  requires_age_gate,
  is_child_safe,
  is_mature,
  seasonal_start,
  seasonal_end,
  sort_order
)
values
  ('11111111-1111-4111-8111-000000000001', 'For Kids', 'for-kids', '/would-you-rather-questions-for-kids/', 'Would You Rather Questions for Kids', 'Would You Rather Questions for Kids – Fun & Clean', 'Clean, silly Would You Rather questions for kids. Great for classrooms, birthday parties, car rides and family game nights.', 'Kids love a good either-or debate, and these questions keep things silly, safe and easy to understand. Every option here is suitable for younger children, so you can hand the screen to a seven-year-old without worrying about what comes up next.

Use them to fill the last ten minutes of class, keep a car ride cheerful, or get a birthday party talking. Ask everyone to explain their pick — that is where the real fun (and the giggles) start.', 'Clean and family friendly', '🦄', 'published', true, true, false, true, false, null, null, 10),
  ('11111111-1111-4111-8111-000000000002', 'For Teens', 'for-teens', '/would-you-rather-questions-for-teens/', 'Would You Rather Questions for Teens', 'Would You Rather Questions for Teens', 'Would You Rather questions for teens: school, friends, phones, music and awkward moments. Clean enough for youth groups and sleepovers.', 'Teenagers want questions that feel relevant — phones, friends, music, school and the occasional embarrassing scenario — without being babyish or crossing into adult territory. This set aims for exactly that middle ground.

They work well at sleepovers, on the bus to a game, or as a quick warm-up in a youth group. Expect strong opinions and plenty of "wait, no, let me change my answer."', 'School, friends and awkward moments', '🎧', 'published', false, true, false, true, false, null, null, 20),
  ('11111111-1111-4111-8111-000000000003', 'For Adults', 'for-adults', '/would-you-rather-questions-for-adults/', 'Would You Rather Questions for Adults', 'Would You Rather Questions for Adults – Parties & Game Nights', 'Would You Rather questions for adults: awkward, honest and slightly spicy dilemmas for parties, date nights and groups of friends.', 'These questions are written for grown-ups: money, careers, relationships, embarrassing confessions and the kind of trade-offs you only understand after paying your own bills. They are suggestive at most, never graphic, so they still work at a mixed dinner party.

Try them as a warm-up before a game night, on a long drive with friends, or whenever a conversation needs a jolt. The best answers usually come with a story attached.', 'Awkward and grown-up dilemmas', '🌶️', 'published', true, false, false, false, true, null, null, 30),
  ('11111111-1111-4111-8111-000000000004', 'For Couples', 'for-couples', '/would-you-rather-questions-for-couples/', 'Would You Rather Questions for Couples', 'Would You Rather Questions for Couples – Date Night Fun', 'Would You Rather questions for couples. Playful, romantic and revealing dilemmas for date nights, road trips and getting to know each other.', 'Whether you have been together for three weeks or thirty years, a good either-or question can reveal something new. This set mixes playful, romantic and slightly cheeky dilemmas that give you both something to laugh and argue about.

Play it over dinner, on a road trip, or as a low-key date night at home. Keep score if you like — or just enjoy finding out how differently you think.', 'Playful and romantic', '💞', 'published', false, false, false, false, false, null, null, 40),
  ('11111111-1111-4111-8111-000000000005', 'For Friends', 'for-friends', '/would-you-rather-questions-for-friends/', 'Would You Rather Questions for Friends', 'Would You Rather Questions for Friends – Group Fun', 'Would You Rather questions to play with friends: funny, competitive and revealing dilemmas for hangouts, parties and group chats.', 'Friend groups already have running jokes, old grudges and strong opinions — these questions just give them somewhere to go. Expect debates about loyalty, embarrassment, superpowers and who would survive longest in a zombie movie.

They are perfect for hangouts, parties, and group chats when the conversation has gone quiet. Everyone answers, everyone explains, nobody gets to say "neither."', 'Loyalty, laughs and rivalries', '🎉', 'published', false, true, false, false, false, null, null, 50),
  ('11111111-1111-4111-8111-000000000006', 'For Family', 'for-family', '/would-you-rather-questions-for-family/', 'Would You Rather Questions for Family', 'Would You Rather Questions for Family Game Night', 'Family-friendly Would You Rather questions everyone from grandparents to little kids can enjoy. Great for dinner tables, holidays and road trips.', 'Family time works best when everyone can join in, so these questions are clean, easy to understand and fun for a mix of ages. Grandparents and five-year-olds can debate the same dilemma and disagree just as loudly.

Bring them to the dinner table, a holiday gathering, or the back seat of a long drive. They are also a gentle way to get quieter family members talking.', 'Fun for every age at the table', '🏠', 'published', false, true, false, true, false, null, null, 60),
  ('11111111-1111-4111-8111-000000000007', 'Funny', 'funny', '/funny-would-you-rather-questions/', 'Funny Would You Rather Questions', 'Funny Would You Rather Questions – Silly & Ridiculous', 'Funny Would You Rather questions that are weird, silly and ridiculous. Perfect icebreakers for parties, classrooms and anyone who needs a laugh.', 'Some dilemmas are not meant to be deep — they are meant to make the whole room laugh. This collection leans into the absurd: strange bodies, ridiculous superpowers, embarrassing habits and choices nobody should ever have to make.

Use them to break the ice at a party, wake up a sleepy classroom, or settle a bored group chat. Bonus points for defending your answer with a completely straight face.', 'Silly and ridiculous', '😂', 'published', true, true, false, true, false, null, null, 90),
  ('11111111-1111-4111-8111-000000000008', 'Hard Choices', 'hard', '/hard-would-you-rather-questions/', 'Hard Would You Rather Questions', 'Hard Would You Rather Questions – Impossible Choices', 'Hard Would You Rather questions with no easy answer. Tough trade-offs about money, time, love and life that will split any group.', 'These are the questions people groan at before answering. Both options cost you something, and the fun is watching everyone squirm while they work out which loss they can live with.

Great for long conversations, late nights and anyone who thinks they are decisive. Give people a minute to think — the first answer is rarely the final one.', 'No easy answers', '😬', 'published', true, true, false, false, false, null, null, 100),
  ('11111111-1111-4111-8111-000000000009', 'Deep', 'deep', '/deep-would-you-rather-questions/', 'Deep Would You Rather Questions', 'Deep Would You Rather Questions – Thought-Provoking', 'Deep Would You Rather questions about memory, meaning, relationships and the future. Thought-provoking dilemmas for real conversations.', 'Not every round has to be silly. These questions dig into what people value — memory, honesty, ambition, comfort, connection — and tend to start conversations that last long after the game ends.

They suit quiet evenings, road trips and getting to know someone properly. There are no right answers, but there are usually very revealing ones.', 'Questions that make you think', '🧠', 'published', true, true, false, false, false, null, null, 110),
  ('11111111-1111-4111-8111-000000000010', 'For Work', 'for-work', '/would-you-rather-questions-for-work/', 'Would You Rather Questions for Work', 'Would You Rather Questions for Work & Team Meetings', 'Office-safe Would You Rather questions for team meetings, remote stand-ups and workplace icebreakers. Light, inclusive and quick to run.', 'Workplace icebreakers need to be quick, inclusive and safe for a mixed audience. These questions stick to office life, commutes, coffee, meetings and harmless hypotheticals so nobody has to share more than they want to.

Drop one into a remote stand-up, a training session or the first five minutes of a team meeting. They are a low-effort way to get people talking before the real agenda begins.', 'Office-safe team icebreakers', '💼', 'published', false, true, false, true, false, null, null, 70),
  ('11111111-1111-4111-8111-000000000011', 'Icebreakers', 'icebreakers', '/would-you-rather-icebreaker-questions/', 'Would You Rather Icebreaker Questions', 'Would You Rather Icebreaker Questions for Any Group', 'Easy Would You Rather icebreaker questions for new groups, first meetings, classrooms and events. Quick to answer and simple to explain.', 'When a group does not know each other yet, the best icebreakers are quick to answer and easy to explain. These questions are light, universal and free of anything awkward, so they work for students, colleagues and strangers alike.

Use them at the start of a workshop, a first meeting or an orientation day. One round is usually enough to get the room comfortable.', 'Easy questions for new groups', '🧊', 'published', true, true, false, true, false, null, null, 80),
  ('11111111-1111-4111-8111-000000000107', 'Extreme', 'extreme', '/extreme-would-you-rather-questions/', 'Extreme Would You Rather Questions', 'Extreme Would You Rather Questions', 'Extreme Would You Rather questions.', '', 'Pushed to the limit', '🔥', 'draft', false, false, false, false, false, null, null, 140),
  ('11111111-1111-4111-8111-000000000108', 'Crazy', 'crazy', '/crazy-would-you-rather-questions/', 'Crazy Would You Rather Questions', 'Crazy Would You Rather Questions', 'Crazy Would You Rather questions.', '', 'Wild scenarios', '🤪', 'draft', false, false, false, false, false, null, null, 130),
  ('11111111-1111-4111-8111-000000000109', 'Weird', 'weird', '/weird-would-you-rather-questions/', 'Weird Would You Rather Questions', 'Weird Would You Rather Questions', 'Weird Would You Rather questions.', '', 'Strange and surreal', '👽', 'draft', false, false, false, false, false, null, null, 120),
  ('11111111-1111-4111-8111-000000000110', 'Gross', 'gross', '/gross-would-you-rather-questions/', 'Gross Would You Rather Questions', 'Gross Would You Rather Questions', 'Gross Would You Rather questions.', '', 'Not for the squeamish', '🤢', 'draft', false, false, false, false, false, null, null, 150),
  ('11111111-1111-4111-8111-000000000111', 'Scary', 'scary', '/scary-would-you-rather-questions/', 'Scary Would You Rather Questions', 'Scary Would You Rather Questions – Creepy Choices', 'Scary Would You Rather questions featuring creepy places, mysterious sounds, monsters and supernatural choices.', '', 'Creepy and supernatural choices', '👻', 'draft', false, false, false, false, false, null, null, 160),
  ('11111111-1111-4111-8111-000000000112', 'Spicy', 'spicy', '/spicy-would-you-rather-questions/', 'Spicy Would You Rather Questions', 'Spicy Would You Rather Questions', 'Spicy Would You Rather questions.', '', 'Flirty and bold', '🌶️', 'draft', false, false, true, false, true, null, null, 170),
  ('11111111-1111-4111-8111-000000000113', 'Dirty', 'dirty', '/dirty-would-you-rather-questions/', 'Dirty Would You Rather Questions', 'Dirty Would You Rather Questions (18+)', 'Dirty Would You Rather questions for adults.', '', '18+ suggestive questions', '🔞', 'draft', false, false, true, false, true, null, null, 180),
  ('11111111-1111-4111-8111-000000000115', 'Food', 'food', '/food-would-you-rather-questions/', 'Food Would You Rather Questions', 'Food Would You Rather Questions', 'Food Would You Rather questions.', '', 'Delicious dilemmas', '🍕', 'draft', false, false, false, true, false, null, null, 190),
  ('11111111-1111-4111-8111-000000000124', 'Animals', 'animals', '/animal-would-you-rather-questions/', 'Animal Would You Rather Questions', 'Animal Would You Rather Questions – Wild & Funny', 'Animal Would You Rather questions about pets, wildlife, unusual creatures and funny animal adventures for groups of all ages.', '', 'Pets, wildlife and wild choices', '🐾', 'draft', false, false, false, true, false, null, null, 200),
  ('11111111-1111-4111-8111-000000000116', 'Halloween', 'halloween', '/halloween-would-you-rather-questions/', 'Halloween Would You Rather Questions', 'Halloween Would You Rather Questions', 'Halloween Would You Rather questions.', '', 'Spooky-season picks', '🎃', 'draft', false, false, false, true, false, '2026-09-01', '2026-10-31', 250),
  ('11111111-1111-4111-8111-000000000117', 'Christmas', 'christmas', '/christmas-would-you-rather-questions/', 'Christmas Would You Rather Questions', 'Christmas Would You Rather Questions', 'Christmas Would You Rather questions.', '', 'Festive dilemmas', '🎄', 'draft', false, false, false, true, false, '2026-11-01', '2026-12-31', 260),
  ('11111111-1111-4111-8111-000000000119', 'Valentine''s Day', 'valentines', '/valentines-would-you-rather-questions/', 'Valentine''s Day Would You Rather Questions', 'Valentine''s Would You Rather Questions', 'Valentine''s Day Would You Rather questions.', '', 'Sweet and romantic', '💘', 'draft', false, false, false, false, false, '2026-01-01', '2026-02-28', 270),
  ('11111111-1111-4111-8111-000000000125', 'Spring', 'spring', '/spring-would-you-rather-questions/', 'Spring Would You Rather Questions', 'Spring Would You Rather Questions', 'Spring Would You Rather questions about flowers, rainy days, outdoor adventures, animals and the return of warmer weather.', '', 'Fresh and cheerful spring choices', '🌷', 'draft', false, false, false, true, false, '2026-03-01', '2026-05-31', 210),
  ('11111111-1111-4111-8111-000000000120', 'Summer', 'summer', '/summer-would-you-rather-questions/', 'Summer Would You Rather Questions', 'Summer Would You Rather Questions', 'Summer Would You Rather questions.', '', 'Sunshine and vacations', '☀️', 'draft', false, false, false, true, false, '2026-06-01', '2026-08-31', 220),
  ('11111111-1111-4111-8111-000000000121', 'Winter', 'winter', '/winter-would-you-rather-questions/', 'Winter Would You Rather Questions', 'Winter Would You Rather Questions', 'Winter Would You Rather questions.', '', 'Snow-day dilemmas', '❄️', 'draft', false, false, false, true, false, '2026-12-01', '2026-02-28', 240),
  ('11111111-1111-4111-8111-000000000122', 'Fall', 'fall', '/fall-would-you-rather-questions/', 'Fall Would You Rather Questions', 'Fall Would You Rather Questions', 'Fall Would You Rather questions.', '', 'Cozy autumn picks', '🍂', 'draft', false, false, false, true, false, '2026-09-01', '2026-11-30', 230)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  canonical_path = excluded.canonical_path,
  h1 = excluded.h1,
  seo_title = excluded.seo_title,
  meta_description = excluded.meta_description,
  introduction = excluded.introduction,
  short_description = excluded.short_description,
  icon = excluded.icon,
  nav_featured = excluded.nav_featured,
  include_in_mixed_game = excluded.include_in_mixed_game,
  requires_age_gate = excluded.requires_age_gate,
  is_child_safe = excluded.is_child_safe,
  is_mature = excluded.is_mature,
  seasonal_start = excluded.seasonal_start,
  seasonal_end = excluded.seasonal_end,
  sort_order = excluded.sort_order;

-- Remove obsolete categories when they have never been used.
delete from public.categories as category
where category.slug in ('for-students', 'kindergarten', 'middle-school', 'high-school', 'school', 'impossible', 'dark', 'freaky', 'thanksgiving', 'dr-seuss')
  and not exists (
    select 1
    from public.question_categories as link
    where link.category_id = category.id
  )
  and not exists (
    select 1
    from public.question_submissions as submission
    where submission.category_id = category.id
  );

-- Preserve historical data by archiving any obsolete category still in use.
update public.categories
set
  status = 'archived',
  nav_featured = false,
  include_in_mixed_game = false
where slug in ('for-students', 'kindergarten', 'middle-school', 'high-school', 'school', 'impossible', 'dark', 'freaky', 'thanksgiving', 'dr-seuss');
