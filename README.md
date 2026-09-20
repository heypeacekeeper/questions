# Would You Rather Questions

Static-first Astro site on **Cloudflare Workers** with Supabase content. Pages are prerendered for SEO; only protected form endpoints under `/api/*` run on demand.

## Architecture

```
Astro pages/components → application services → repository interfaces → adapters (supabase | mock)
```

- Supabase content is read at build time with the server-only secret key.
- The game displays deterministic, local-only for-fun percentages. Selecting an option never sends a request or changes stored content.
- The composition root is `src/repositories/factory.ts`; environment validation is `src/config/env.ts`.

## Commands

```bash
npm install
cp .env.example .env            # edit locally; never commit this file
npm run dev:mock                # builds mock artifacts, then serves the Worker at http://127.0.0.1:8787
npm run test:runtime:mock       # built-Worker HTTP smoke test
npm test
npm run check
npm run build:mock              # validation, mock Astro build, performance budget
npm run build                   # production Supabase build
npm run preview
npx wrangler deploy
```

## Caching policy

- HTML uses Cloudflare's default revalidation policy: cached responses must be checked before reuse.
- Hashed Astro assets and hashed game-data packs are cached for one year as immutable files.
- The mutable game-data manifest and Favorites catalog are cached for five minutes with revalidation.
- API responses and the deployment manifest use `no-store`.
- Cache rules for static files live in `public/_headers`; API protection lives in `src/middleware.ts`.

## Environment variables

Production requires `DATA_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and the server-only `RATE_LIMIT_PEPPER`. Optional GA4 and Cloudflare Web Analytics remain gated behind their `FEATURE_*` flags and consent requirements.

## Production database migrations

A production Supabase database must have every migration in
`supabase/migrations/` applied in numerical order:

1. `0000_functions.sql` — shared database functions
2. `0001_initial_schema.sql` — tables, indexes, constraints, RLS and grants
3. `0002_seed_categories.sql` — initial category definitions
4. `0003_cast_vote_function.sql` — historical voting support
5. `0004_display_vote_count.sql` — historical display-count support
6. `0005_atomic_question_import.sql` — atomic CSV question imports
7. `0006_limited_duplicate_windows.sql` — time-limited duplicate protection
8. `0007_secure_share_codes.sql` — cryptographically secure share codes
9. `0008_personal_data_retention.sql` — scheduled deletion and anonymization
10. `0009_remove_legacy_voting.sql` — removes obsolete voting infrastructure
11. `0010_finalize_category_catalog.sql` — installs the approved 27-category catalog
12. `0011_enforce_published_submission_categories.sql` — rejects submissions to draft, archived or unknown categories

Review each migration before applying it to production. Apply all twelve using
the Supabase CLI or SQL editor. Historical migrations must not be edited.

`tools/generate-seed-sql.ts` writes the current category snapshot to
`supabase/seed/categories.sql`; it does not overwrite migration `0002`.
Do not run `supabase/seed/demo_questions.sql` in production.

After applying the migrations:

- confirm all migrations completed successfully;
- confirm RLS is enabled on protected tables;
- confirm service-role RPC permissions are present;
- confirm the `daily-personal-data-retention` cron job exists;
- regenerate `src/infrastructure/supabase/database.types.ts` from the linked project;
- run a production build using the real Supabase credentials.

Selecting either game option reveals deterministic for-fun percentages generated
from the question ID. Selecting an option does not send a request or modify
database content.

## Isolated mock development

`npm run dev:mock` deliberately builds the mock site and serves the generated Cloudflare Worker instead of using `astro dev`. It starts Wrangler from an isolated empty directory, passes only tracked safe mock values plus `.env.mock`, and uses a process environment allowlist. Therefore an owner `.env` at the repository root cannot override mock runtime values. This also makes generated `/game-data/manifest.json` and hashed packs available exactly as they are in deployment.

Use this command on Windows, macOS, and Linux:

```bash
npm run dev:mock
```

Use `npm run test:runtime:mock` for a non-browser Worker smoke test of `/` and `/game-data/manifest.json`. Do not use `npx astro dev --mode mock` for Worker verification: it does not serve the generated Worker/artifacts and can load root dotenv files. There is no tracked `src/fetch.ts` custom fetch handler; the previously observed actions/middleware warnings are source-mode Astro dev diagnostics and are avoided by the generated Worker path.

## Cloudflare deployment

`wrangler.jsonc` provides `FORM_RATE_LIMITER` for `/api/contact` and `/api/submit-question`.

Set server-only secrets without committing values:

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
openssl rand -hex 32
npx wrangler secret put RATE_LIMIT_PEPPER
npm run build && npx wrangler deploy
```

Configure the configured rate-limit namespace in the Cloudflare account if it differs from the repository default. Generate `RATE_LIMIT_PEPPER` from at least 32 random bytes and store it only as a Cloudflare Worker secret and GitHub production secret. Rotating it resets the effective per-client rate-limit buckets. Worker observability remains enabled and samples approximately 5% of production requests. Configure Turnstile actions `contact` and `submit_question`, then enable custom routes after the zone is on Cloudflare.

## Performance and fonts

The budget reports **total emitted client JS/CSS**, homepage/category HTML, game-data packs, and font files using gzip. Windows paths are normalized before matching generated assets. Budgets remain: JS 35 KB, CSS 25 KB, homepage HTML 100 KB, category HTML 150 KB, pack 25 KB, and zero font files. The site uses only the system font stack and makes no downloadable font requests.

## Replacing Supabase

Implement repository interfaces in `src/infrastructure/<provider>/`, map provider rows to `src/domain/*`, and swap adapters only in `src/repositories/factory.ts`. Preserve content constraints, static game-data generation, and form protections.

## Owner setup

- Create/review the production Supabase project, then apply migrations 0000–0011 in numerical order.
- Regenerate `database.types.ts` from the linked project before real Supabase end-to-end testing.
- Configure Worker secrets and the Cloudflare form rate-limit binding.
- Replace legal placeholders and create production Turnstile widgets.
- Run `npm run build` locally with real private credentials before production deployment.
