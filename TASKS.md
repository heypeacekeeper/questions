# TASKS

## Done
- [x] Reference `design-reference/index.reference.html` preserved (not in `public/`, never published)
- [x] Astro 7.3 + @astrojs/cloudflare 14 (Workers + static assets) + TS strict + Vitest + Wrangler 4
- [x] Domain types, repository ports, application services (questions, categories, voting, submissions, game-data, manifest, content validation)
- [x] Mock adapter (3 labelled demo questions + procedural filler) and Supabase adapter (build client + Worker client, mappers)
- [x] SQL migrations: schema, constraints, RLS, `cast_vote()` RPC, seed categories (11 launch published, 23 future drafts incl. Dr. Seuss unpublished), demo seed
- [x] Central config (`src/config/site.ts`) + validated env (`src/config/env.ts`) + typed feature flags
- [x] Design ported to Astro components (header/nav, game, lists, pagination, sidebar, footer) + a11y (focus rings, live region, skip link, dialog)
- [x] Routes: `/`, `/categories/`, generic `[...category]` with `/page/N/`, `/s/[code]/` (noindex), 9 supporting/legal pages, 404
- [x] SSR initial question; hashed game-data packs + manifest; vanilla TS game engine (no repeats, share, fullscreen, keyboard)
- [x] API: `/api/vote`, `/api/contact`, `/api/submit-question` (POST-only, origin check, body limits, schema, rate limit, no-store, HttpOnly voter cookie + HMAC)
- [x] Turnstile server verify (hostname/action/expiry), honeypot, time-to-submit, duplicate fingerprints
- [x] Consent banner (accept/reject/manage), consent-gated GA4, cookieless CF Analytics, disabled AdSlot components
- [x] SEO: canonical, OG/Twitter, prev/next, BreadcrumbList/WebSite/Organization JSON-LD, sitemap filter, robots.txt, `_headers` (CSP/HSTS/caching)
- [x] `validate:content`, `budget` scripts; 21 unit tests; production build passing

## Completed in the final implementation pass
- [x] CSV import/export tools (`tools/import-csv.ts`, `tools/export-questions.ts`) with normalized, order-independent duplicate detection
- [x] Playwright smoke + visual regression configs and browser flows in `tests/e2e/`
- [x] PNG/ICO favicon, apple-touch icon, 192/512 app icons, and 1200×630 default social image
- [x] Strict TypeScript errors fixed across the game, vote API, and Supabase adapter types
- [x] Cloudflare rate-limit binding (`FORM_RATE_LIMITER`) configured in `wrangler.jsonc`

## Owner setup required
- [ ] Create the production Supabase project, run migrations, and provide project credentials
- [ ] Regenerate `database.types.ts` from the linked project and run the real Supabase end-to-end verification
- [ ] Replace legal placeholders (entity, address, jurisdiction, dates, and DMCA agent)
- [ ] Create production Turnstile widgets and add Cloudflare Worker secrets
- [ ] Review visual baselines on the deployment/CI Linux image and deploy the Worker/custom domain
