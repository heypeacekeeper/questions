# Would You Rather Questions

Static-first Astro site on **Cloudflare Workers** with Supabase content. Pages are prerendered for SEO; only `/api/*` runs on demand.

## Architecture
```
Astro pages/components → application services → repository interfaces → adapters (supabase | mock)
```
- Supabase content is read at build time with the server-only secret key. Worker mutations use that key only inside `/api/*`.
- Browser clients never receive Supabase credentials and cannot write vote totals directly.
- The composition root is `src/repositories/factory.ts`; environment validation is `src/config/env.ts`.

## Commands
```bash
npm install
cp .env.example .env            # edit locally; never commit this file
npm run dev:mock
npm test
npm run check
npm run build:mock              # validation, mock Astro build, performance budget
npm run build                   # production Supabase build
npm run preview
npx wrangler deploy
```

## Environment variables
Production requires `DATA_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and a ≥32-character `VOTER_HASH_SECRET`. `VOTER_HASH_SECRET` HMACs anonymous tokens only for abuse-rate-limit keys; it does not identify or restrict voters. Optional GA4 and Cloudflare Web Analytics remain gated behind their `FEATURE_*` flags and consent requirements.

## Repeat-vote architecture and Supabase migration
Repeat voting is intentional: every successful request increments one aggregate counter, including repeated clicks from the same browser and votes that switch choices. The browser stores no voting history.

1. Manually run migrations in order through `supabase/migrations/0003_cast_vote_function.sql` if this is a new database.
2. **Manually run `supabase/migrations/0004_repeat_voting.sql` in the Supabase SQL editor. Do not apply it automatically from the application.**
3. Migration 0004 creates `public.question_vote_totals`, transfers every existing A/B total from `public.votes` exactly once, and installs the two-argument aggregate `cast_vote(uuid, vote_choice)` RPC.
4. `public.votes` remains as legacy historical data and receives no further runtime writes. The migration revokes unnecessary access to it. The aggregate table and RPC are restricted to `service_role`.

## Cloudflare deployment
`wrangler.jsonc` requires both independent rate-limit bindings:
- `VOTE_RATE_LIMITER`: 60 requests per 60 seconds, used only by `/api/vote`.
- `FORM_RATE_LIMITER`: 10 requests per 60 seconds, used by `/api/contact` and `/api/submit-question`.

Set server-only secrets without committing values:
```bash
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put VOTER_HASH_SECRET
npm run build && npx wrangler deploy
```
Configure the configured unique rate-limit namespaces in the Cloudflare account if they differ from the repository defaults. Worker observability remains enabled and samples approximately 5% of production requests. Configure Turnstile actions `contact` and `submit_question`, then enable custom routes after the zone is on Cloudflare.

## Performance and fonts
The budget reports **total emitted client JS/CSS**, homepage/category HTML, game-data packs, and font files using gzip. Windows paths are normalized before matching generated assets. Budgets remain: JS 35 KB, CSS 25 KB, homepage HTML 100 KB, category HTML 150 KB, pack 25 KB, and zero font files. The site uses only the system font stack and makes no downloadable font requests.

## Replacing Supabase
Implement repository interfaces in `src/infrastructure/<provider>/`, map provider rows to `src/domain/*`, and swap adapters only in `src/repositories/factory.ts`. Preserve content constraints, aggregate vote semantics, static content validation, and form protections.

## Owner setup
- Create the Supabase project and manually run migration 0004 after reviewing it.
- Regenerate `database.types.ts` from the linked project before real Supabase end-to-end testing.
- Configure Worker secrets and both Cloudflare rate-limit bindings.
- Replace legal placeholders and create production Turnstile widgets.
- Run `npm run build` locally with real private credentials before production deployment.
