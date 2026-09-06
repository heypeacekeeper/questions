# Would You Rather Questions

Static Astro site on **Cloudflare Workers** with **Supabase** content, rebuilt from `design-reference/index.reference.html` (visual source of truth — not published).

## Architecture
```
Astro pages/components → application services → repository interfaces → adapters (supabase | mock)
```
- All content pages are **prerendered** at build. Only `src/pages/api/*` run on demand (`prerender = false`).
- Supabase is read **once at build time** (secret key, Node). Workers use the secret key only inside `/api/*`.
- Composition root: `src/repositories/factory.ts`. Supabase-specific code: `src/infrastructure/supabase/`.
- Central config: `src/config/site.ts`; env validation: `src/config/env.ts`.

## Commands
```bash
npm install
cp .env.example .env            # then edit
npm run dev:mock                # local dev with demo fixtures
npm test                        # vitest
npm run check                   # astro check + tsc
npm run build:mock              # mock build (validate → build → budget)
npm run build                   # production (DATA_PROVIDER=supabase)
npm run preview                 # wrangler dev on the build
npx wrangler deploy             # deploy to Cloudflare Workers
```

## Environment variables
See `.env.example`. Required in production: `DATA_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (build + Worker secret), `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (secret), `VOTER_HASH_SECRET` (secret, ≥32 chars). Optional: GA4 / Cloudflare Analytics / AdSense ids behind `FEATURE_*` flags. Build fails if `DATA_PROVIDER=mock` or published demo rows are present in production.

## Supabase setup
1. Create a project at supabase.com → Settings → API: copy URL + **secret** key.
2. Run in order in the SQL editor: `supabase/migrations/0000_functions.sql`, `0001_initial_schema.sql`, `0002_seed_categories.sql`, `0003_cast_vote_function.sql`.
3. Optional demo data: `supabase/seed/demo_questions.sql`. Delete: `delete from questions where is_demo = true;`
4. Add a question: insert into `questions` (option_a, option_b, status='published'); link rows in `question_categories` (one per category). Share codes generate automatically.
5. Create a category: insert into `categories` (status 'draft' until it has questions, then 'published'). Pages, nav, sitemap and game packs regenerate on the next build — no code changes.
6. Archive instead of delete so `/s/<code>/` shows a graceful notice.
7. Rebuild after content changes: `npm run build && npx wrangler deploy` (or trigger CI). A failed build never replaces the live deployment.

## Cloudflare deployment
```bash
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put VOTER_HASH_SECRET
npm run build && npx wrangler deploy
```
Then uncomment `routes` in `wrangler.jsonc` and add the domain to Cloudflare. Create Turnstile widgets (actions `contact`, `submit_question`) for `wouldyouratherquestions.org`. Roll back: Workers → Deployments → Rollback.

## Performance budgets (current, gzip)
JS 7.8/35 KB · CSS 5.7/25 KB · Home HTML 5.9/100 KB · Category HTML 5.0/150 KB · Pack 1.0/25 KB · fonts 0.

## Replacing Supabase
Implement `QuestionRepository`, `CategoryRepository`, `VoteRepository`, `SubmissionRepository`, `ContactRepository` (`src/repositories/interfaces/index.ts`) in a new `src/infrastructure/<provider>/`, mapping records to `src/domain/*` types (see `supabase/mappers.ts`), then swap them in `src/repositories/factory.ts` and set `DATA_PROVIDER`. Preserve constraints: unique share codes/slugs/paths, non-identical options, one vote per (question, voter_hash), valid statuses. Pages, components, services, game, SEO, forms need no changes.

## Backups
Export tables from the Supabase dashboard (CSV) or `pg_dump`; keep `supabase/migrations/` in git; the deployment manifest (`/deployment-manifest.json`) records the content checksum of each build.

## Legal placeholders
Highlighted `<span class="placeholder">` items in Privacy, Terms, Cookie, DMCA pages (entity, address, jurisdiction, DMCA agent, date) must be replaced; templates are not legal advice.

See `TASKS.md` for remaining work.
