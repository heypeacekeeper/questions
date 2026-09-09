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
const mockMode = process.env.DATA_PROVIDER === 'mock';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  devToolbar: { enabled: false },
  // No client-side view transitions / SPA router. Native navigation only;
  // prefetch just warms the cache on hover.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
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
    }),
    buildArtifacts(),
  ],
  vite: {
    // Mock commands set DATA_PROVIDER before Astro starts. An empty envDir stops
    // Vite from loading the owner's root .env during isolated mock builds.
    envDir: mockMode ? fileURLToPath(new URL('./tools/mock-env', import.meta.url)) : undefined,
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      // Keep the client bundle honest: no source maps shipped to production.
      sourcemap: false,
    },
  },
});
