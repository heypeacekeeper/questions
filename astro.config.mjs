// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import { SITE_URL, isSitemapEligible } from './src/config/site-static.mjs';
import buildArtifacts from './src/scripts/build-artifacts.ts';

/**
 * Astro configuration.
 *
 * Rendering model:
 *  - Every content/SEO page is prerendered (Astro default, `output: 'static'`).
 *  - Only the API endpoints under `src/pages/api/` opt into on-demand rendering
 *    via `export const prerender = false`.
 *  - The Cloudflare adapter targets Workers with static assets (not the
 *    deprecated Pages integration).
 */
export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  // No client-side view transitions / SPA router. Native navigation only.
  prefetch: false,
  // Sessions would provision a KV namespace we do not need.
  session: false,
  adapter: cloudflare({
    // Build-time content loading uses Node (process.env, crypto) — run the
    // prerender step in Node instead of workerd.
    prerenderEnvironment: 'node',
    imageService: 'compile',
  }),
  integrations: [
    sitemap({
      filter: isSitemapEligible,
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
    buildArtifacts(),
  ],
  vite: {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      // Keep the client bundle honest: no source maps shipped to production.
      sourcemap: false,
    },
  },
});
