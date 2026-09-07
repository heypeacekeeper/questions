# Would You Rather Questions

Static-first Astro site on **Cloudflare Workers** with Supabase content. Pages are prerendered for SEO; only protected form endpoints under `/api/*` run on demand.

## Architecture

```
Astro pages/components → application services → repository interfaces → adapters (supabase | mock)
```

- Supabase content is read at build time with the server-only secret key.
- The game displays deterministic, local-only result percentages and owner-managed display counts. Selecting an option never sends a request or changes stored content.
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

## Environment variables

Production requires `DATA_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, and `TURNSTILE_SECRET_KEY`. Optional GA4 and Cloudflare Web Analytics remain gated behind their `FEATURE_*` flags and consent requirements.

## Display-only results and Supabase migration

Selecting either option immediately reveals a deterministic display result generated from the question ID. Option A is always in the 25.0%–75.0% range, Option B complements it to 100.0%, and the same question always produces the same result. The displayed count is the owner-editable `display_vote_count` stored on each question.

1. For a new database, manually run the historical migrations in order through migration 0003.
2. Review and manually run `supabase/migrations/0004_display_vote_count.sql` in the Supabase SQL editor. Do not apply it automatically from the application.
3. Migration 0004 adds `display_vote_count`, safely backfills only existing `NULL` values with integers from 2,000 through 7,000, gives new rows a value in that range, and then makes the column required. Owners can later set any non-negative integer count directly in Supabase.

Historical migrations and legacy database data are retained unchanged. The active application does not read or write historical vote records.

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
npm run build && npx wrangler deploy
```

Configure the configured rate-limit namespace in the Cloudflare account if it differs from the repository default. Worker observability remains enabled and samples approximately 5% of production requests. Configure Turnstile actions `contact` and `submit_question`, then enable custom routes after the zone is on Cloudflare.

## Performance and fonts

The budget reports **total emitted client JS/CSS**, homepage/category HTML, game-data packs, and font files using gzip. Windows paths are normalized before matching generated assets. Budgets remain: JS 35 KB, CSS 25 KB, homepage HTML 100 KB, category HTML 150 KB, pack 25 KB, and zero font files. The site uses only the system font stack and makes no downloadable font requests.

## Replacing Supabase

Implement repository interfaces in `src/infrastructure/<provider>/`, map provider rows to `src/domain/*`, and swap adapters only in `src/repositories/factory.ts`. Preserve content constraints, static game-data generation, and form protections.

## Owner setup

- Create/review the production Supabase project, then manually run migration 0004 after reviewing it.
- Regenerate `database.types.ts` from the linked project before real Supabase end-to-end testing.
- Configure Worker secrets and the Cloudflare form rate-limit binding.
- Replace legal placeholders and create production Turnstile widgets.
- Run `npm run build` locally with real private credentials before production deployment.
