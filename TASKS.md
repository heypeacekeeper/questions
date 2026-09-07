# TASKS

## Completed
- [x] Astro + Cloudflare Workers, strict TypeScript, plain CSS, vanilla TypeScript, static content generation, SEO, share pages, pagination, and form/Turnstile protections.
- [x] Repeat-voting migration (`0004_repeat_voting.sql`): compact per-question aggregate totals, atomic two-argument RPC, and historical transfer from `public.votes`.
- [x] Browser vote history removed. Session storage continues to prevent repeated questions during a game session; visitors may vote repeatedly on any question.
- [x] Separate Worker rate-limit bindings: `VOTE_RATE_LIMITER` (60/minute) and `FORM_RATE_LIMITER` (10/minute).
- [x] Performance budget matching normalizes Windows paths. Site system font stack has zero downloadable font files.
- [x] Worker observability is enabled with 5% production request sampling.

## Owner setup required
- [ ] Create/review the production Supabase project, then manually run `supabase/migrations/0004_repeat_voting.sql`. It retains legacy historical vote rows and transfers their totals.
- [ ] Regenerate `src/infrastructure/supabase/database.types.ts` from the linked project and conduct real Supabase end-to-end verification.
- [ ] Configure `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, `VOTER_HASH_SECRET`, `VOTE_RATE_LIMITER`, and `FORM_RATE_LIMITER` for the Worker.
- [ ] Replace legal placeholders, create production Turnstile widgets, review visual baselines on Linux, and deploy the Worker/custom domain.
