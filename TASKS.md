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

## Remaining (needs owner credentials or time)
- [ ] CSV import/export tools (`tools/import-csv.ts`, `tools/export-questions.ts`) — package scripts exist; implement using `questionPairFingerprint` for dupes
- [ ] Playwright smoke + visual regression configs (`playwright.config.ts`, `playwright.visual.config.ts`) and `tests/e2e/`
- [ ] PNG favicon/apple-touch-icon/og-default.png (favicon.svg exists; layout references PNGs)
- [ ] Verify Supabase adapter end-to-end against a real project; regenerate `database.types.ts`
- [ ] Optional: Cloudflare rate-limit binding (`FORM_RATE_LIMITER`) in wrangler.jsonc
