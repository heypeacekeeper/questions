# TASKS

## Completed

- [x] Astro + Cloudflare Workers, strict TypeScript, plain CSS, vanilla TypeScript, static content generation, SEO, share pages, pagination, and form/Turnstile protections.
- [x] Display-only result migration (`0004_display_vote_count.sql`): owner-editable per-question display counts with safe backfill and defaults.
- [x] Game result percentages are deterministic per question ID and rendered locally without a request or stored interaction.
- [x] Session storage prevents repeated questions during a game session.
- [x] `FORM_RATE_LIMITER` protects contact and question-submission endpoints.
- [x] Performance budget matching normalizes Windows paths. Site system font stack has zero downloadable font files.
- [x] Worker observability is enabled with 5% production request sampling.

## Owner setup required

- [ ] Create/review the production Supabase project, then manually run `supabase/migrations/0004_display_vote_count.sql` after reviewing it.
- [ ] Regenerate `src/infrastructure/supabase/database.types.ts` from the linked project and conduct real Supabase end-to-end verification.
- [ ] Configure `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, and `FORM_RATE_LIMITER` for the Worker.
- [ ] Replace legal placeholders, create production Turnstile widgets, review visual baselines on Linux, and deploy the Worker/custom domain.
