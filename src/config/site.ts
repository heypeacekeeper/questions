/**
 * Central, typed site configuration. Non-secret, compile-time constants.
 *
 * Nothing in the UI, services, or infrastructure may hardcode these values;
 * import from here instead.
 */
import type { SiteConfiguration, SeasonalWindow } from '@/domain/site';

export const BRAND_NAME = 'Would You Rather Questions';
export const BRAND_SHORT = 'WouldYouRather';
export const BRAND_DOMAIN_SUFFIX = 'Questions.org';
export const BRAND_DISPLAY_DOMAIN = 'WouldYouRatherQuestions.org';
export const PUBLIC_EMAIL = 'hello@wouldyouratherquestions.org';
export const DEFAULT_SITE_URL = 'https://wouldyouratherquestions.org';

export const API_PATHS = {
  contact: '/api/contact/',
  submitQuestion: '/api/submit-question/',
} as const;

export const ROUTES = {
  home: '/',
  categories: '/categories/',
  about: '/about-us/',
  contact: '/contact-us/',
  submit: '/submit-a-question/',
  editorialPolicy: '/editorial-policy/',
  privacy: '/privacy-policy/',
  terms: '/terms-and-conditions/',
  cookies: '/cookie-policy/',
  accessibility: '/accessibility/',
  dmca: '/dmca/',
  sharePrefix: '/s/',
  gameDataPrefix: '/game-data/',
  blog: '/blog/',
} as const;

export const PAGINATION = {
  /** Static list rows per category page. */
  questionsPerPage: 50,
  /** Segment appended for page ≥ 2 → /category/page/2/ */
  pageSegment: 'page',
} as const;

export const HOMEPAGE = {
  /** Questions in each compact homepage section. */
  questionsPerSection: 10,
  /** Category slugs (in order) shown as compact homepage sections. */
  sectionSlugs: ['for-kids', 'for-adults', 'funny'] as const,
} as const;

export const NAVIGATION = {
  /** Max categories inside the header "Categories" dropdown. */
  navCategoryLimit: 6,
  /** Max categories in the sidebar "Popular categories" block. */
  popularCategoryLimit: 8,
  /** Max related categories under a category page. */
  relatedCategoryLimit: 6,
  /** Quick-link pills under the H1. */
  quickLinkLimit: 5,
} as const;

export const GAME_DATA = {
  /** Questions per static game-data chunk. Tuned for the 25 KB gzip budget. */
  questionsPerPack: 40,
  /** Prefetch the next pack when fewer than this many unseen questions remain. */
  refillThreshold: 8,
  /** Maximum mixed packs generated for the homepage. */
  maxMixedPacks: 10,
  /** Hash length appended to filenames. */
  hashLength: 10,
  /** Manifest file (unhashed, short cache) that maps packs → hashed URLs. */
  manifestFile: 'manifest.json',
} as const;

export const FORM_LIMITS = {
  optionMin: 2,
  optionMax: 200,
  nameMax: 80,
  emailMax: 254,
  subjectMin: 2,
  subjectMax: 150,
  messageMin: 10,
  messageMax: 4000,
  /** Reject submissions faster than this (ms since form render). */
  minTimeToSubmitMs: 3000,
  /** Max request body accepted by form endpoints (bytes). */
  maxBodyBytes: 16 * 1024,
  /** Per-IP-hash request cap for form endpoints per rolling hour. */
  rateLimitPerHour: 10,
} as const;

export const TURNSTILE = {
  actions: { contact: 'contact', submitQuestion: 'submit_question' } as const,
  siteverifyUrl: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
  /** Cloudflare documented test keys (always pass). */
  testSiteKey: '1x00000000000000000000AA',
  testSecretKey: '1x0000000000000000000000000000000AA',
} as const;

export const COOKIES = {
  consent: 'wyr_consent',
  consentMaxAgeSeconds: 60 * 60 * 24 * 180, // 6 months
} as const;

export const STORAGE_KEYS = {
  pack: 'wyr_pack',
  adultConfirmed: 'wyr_adult',
  /** sessionStorage: seen question ids for repeat-prevention. */
  seen: 'wyr_seen',
} as const;

export const SOCIAL = {
  defaultImagePath: '/og-default.png',
  imageWidth: 1200,
  imageHeight: 630,
  twitterCard: 'summary_large_image',
} as const;

/**
 * Seasonal category windows (month/day, inclusive). Category slugs must match
 * the seeded seasonal categories. Windows may cross a year boundary.
 */
export const SEASONAL_WINDOWS: readonly SeasonalWindow[] = [
  { slug: 'valentines', label: "Valentine's Day", start: { month: 1, day: 1 }, end: { month: 2, day: 28 } },
  { slug: 'halloween', label: 'Halloween', start: { month: 9, day: 1 }, end: { month: 10, day: 31 } },
  { slug: 'thanksgiving', label: 'Thanksgiving', start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
  { slug: 'christmas', label: 'Christmas', start: { month: 11, day: 1 }, end: { month: 12, day: 31 } },
];

export const ADS = {
  /** Slot ids are placeholders; owner fills these after AdSense approval. */
  slots: {
    belowGame: { id: 'below-game', width: 728, height: 90, lazy: false },
    inContent: { id: 'in-content', width: 336, height: 280, lazy: true },
    sidebarTall: { id: 'sidebar-tall', width: 300, height: 600, lazy: true },
    sidebarBox: { id: 'sidebar-box', width: 300, height: 250, lazy: true },
    footer: { id: 'footer', width: 728, height: 90, lazy: true },
  },
  scriptUrl: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
} as const;

export const CONTENT_LIMITS = {
  /** Max characters allowed in a stored option (mirrors DB check). */
  optionMax: 200,
  seoTitleMax: 70,
  metaDescriptionMax: 170,
} as const;

/** Assemble the provider-independent SiteConfiguration domain object. */
export function buildSiteConfiguration(siteUrl: string = DEFAULT_SITE_URL): SiteConfiguration {
  return {
    brandName: BRAND_NAME,
    siteUrl: siteUrl.replace(/\/+$/, ''),
    publicEmail: PUBLIC_EMAIL,
    questionsPerPage: PAGINATION.questionsPerPage,
    popularCategoryLimit: NAVIGATION.popularCategoryLimit,
    navigationCategoryLimit: NAVIGATION.navCategoryLimit,
    questionsPerPack: GAME_DATA.questionsPerPack,
    defaultSocialImage: SOCIAL.defaultImagePath,
    seasonalWindows: SEASONAL_WINDOWS,
  };
}

/** Build an absolute URL from a site-relative path. */
export function absoluteUrl(path: string, siteUrl: string = DEFAULT_SITE_URL): string {
  const base = siteUrl.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Path for page N of a category (page 1 = canonical category path). */
export function categoryPagePath(canonicalPath: string, page: number): string {
  const base = canonicalPath.endsWith('/') ? canonicalPath : `${canonicalPath}/`;
  return page <= 1 ? base : `${base}${PAGINATION.pageSegment}/${page}/`;
}

export function sharePath(shareCode: string): string {
  return `${ROUTES.sharePrefix}${shareCode}/`;
}
