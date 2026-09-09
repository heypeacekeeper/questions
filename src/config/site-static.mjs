// @ts-check
/**
 * Framework-neutral constants that must be importable from `astro.config.mjs`
 * (which runs before Astro's env system is available) AND from application
 * code. Keep this file dependency-free and JavaScript-only.
 *
 * Everything else lives in `src/config/site.ts`.
 */

/** Canonical production origin, no trailing slash. */
export const SITE_URL = (
  process.env.PUBLIC_SITE_URL || 'https://wouldyouratherquestions.org'
).replace(/\/+$/, '');

/** Route prefixes that must never appear in the XML sitemap. */
export const SITEMAP_EXCLUDED_PREFIXES = ['/s/', '/api/', '/__', '/preview/', '/mock/', '/test/'];

/** Exact paths excluded from the sitemap. */
export const SITEMAP_EXCLUDED_PATHS = ['/404/', '/404.html'];

/**
 * Sitemap filter used by @astrojs/sitemap. Receives absolute page URLs.
 * @param {string} page
 * @returns {boolean}
 */
export function isSitemapEligible(page) {
  let pathname;
  try {
    pathname = new URL(page).pathname;
  } catch {
    return false;
  }
  if (SITEMAP_EXCLUDED_PATHS.includes(pathname)) return false;
  return !SITEMAP_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
