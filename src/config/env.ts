/**
 * Central environment-variable access and validation.
 *
 * This is the ONLY module allowed to read `process.env` / `import.meta.env` /
 * Cloudflare `env` bindings. Everything else consumes the typed `AppEnv`.
 *
 * Two execution contexts share this module:
 *  - Build time (Node, prerendering static pages, tools/ scripts)
 *  - Cloudflare Worker runtime (on-demand API endpoints, `locals.runtime.env`)
 */

export type DataProvider = 'supabase' | 'mock';

export interface AppEnv {
  /** 'production' | 'development' | 'test' */
  readonly mode: string;
  readonly isProduction: boolean;
  readonly siteUrl: string;
  readonly dataProvider: DataProvider;

  readonly supabaseUrl: string | undefined;
  /** Server/build only. Never exposed to the client. */
  readonly supabaseSecretKey: string | undefined;

  readonly turnstileSiteKey: string | undefined;
  /** Server only. */
  readonly turnstileSecretKey: string | undefined;

  readonly ga4MeasurementId: string | undefined;
  readonly cloudflareAnalyticsToken: string | undefined;
  readonly searchConsoleVerification: string | undefined;
  readonly adsensePublisherId: string | undefined;

  readonly features: FeatureFlags;

  /** Explicitly allow demo fixtures in a production build (default false). */
  readonly allowDemoContent: boolean;
}

export interface FeatureFlags {
  readonly FEATURE_SUBMISSIONS: boolean;
  readonly FEATURE_CONTACT_FORM: boolean;
  readonly FEATURE_ADS: boolean;
  readonly FEATURE_GA4: boolean;
  readonly FEATURE_CLOUDFLARE_ANALYTICS: boolean;
}

export type RawEnv = Record<string, string | undefined>;

const FEATURE_DEFAULTS: FeatureFlags = {
  FEATURE_SUBMISSIONS: true,
  FEATURE_CONTACT_FORM: true,
  FEATURE_ADS: false,
  FEATURE_GA4: false,
  FEATURE_CLOUDFLARE_ANALYTICS: false,
};

export class EnvValidationError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
    this.name = 'EnvValidationError';
  }
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/**
 * Build a typed, validated `AppEnv` from a raw key/value record.
 * Pure function — easy to unit test.
 */
export function buildAppEnv(raw: RawEnv, options: { mode?: string; context?: 'build' | 'worker' | 'tool' } = {}): AppEnv {
  const mode = options.mode ?? raw.NODE_ENV ?? raw.MODE ?? 'production';
  const isProduction = mode === 'production';
  const context = options.context ?? 'build';
  const problems: string[] = [];

  const providerRaw = (raw.DATA_PROVIDER ?? (isProduction ? 'supabase' : 'mock')).trim().toLowerCase();
  if (providerRaw !== 'supabase' && providerRaw !== 'mock') {
    problems.push(`DATA_PROVIDER must be "supabase" or "mock" (received "${providerRaw}")`);
  }
  const dataProvider = (providerRaw === 'mock' ? 'mock' : 'supabase') as DataProvider;

  const siteUrl = (trimOrUndefined(raw.PUBLIC_SITE_URL) ?? 'https://wouldyouratherquestions.org').replace(/\/+$/, '');
  try {
    const u = new URL(siteUrl);
    if (isProduction && u.protocol !== 'https:') problems.push('PUBLIC_SITE_URL must use https in production');
  } catch {
    problems.push(`PUBLIC_SITE_URL is not a valid URL: "${siteUrl}"`);
  }

  const features: FeatureFlags = {
    FEATURE_SUBMISSIONS: parseBool(raw.FEATURE_SUBMISSIONS, FEATURE_DEFAULTS.FEATURE_SUBMISSIONS),
    FEATURE_CONTACT_FORM: parseBool(raw.FEATURE_CONTACT_FORM, FEATURE_DEFAULTS.FEATURE_CONTACT_FORM),
    FEATURE_ADS: parseBool(raw.FEATURE_ADS, FEATURE_DEFAULTS.FEATURE_ADS),
    FEATURE_GA4: parseBool(raw.FEATURE_GA4, FEATURE_DEFAULTS.FEATURE_GA4),
    FEATURE_CLOUDFLARE_ANALYTICS: parseBool(raw.FEATURE_CLOUDFLARE_ANALYTICS, FEATURE_DEFAULTS.FEATURE_CLOUDFLARE_ANALYTICS),
  };

  const supabaseUrl = trimOrUndefined(raw.SUPABASE_URL);
  const supabaseSecretKey = trimOrUndefined(raw.SUPABASE_SECRET_KEY);
  const turnstileSiteKey = trimOrUndefined(raw.PUBLIC_TURNSTILE_SITE_KEY);
  const turnstileSecretKey = trimOrUndefined(raw.TURNSTILE_SECRET_KEY);
  const ga4MeasurementId = trimOrUndefined(raw.PUBLIC_GA4_MEASUREMENT_ID);
  const cloudflareAnalyticsToken = trimOrUndefined(raw.PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN);
  const searchConsoleVerification = trimOrUndefined(raw.PUBLIC_SEARCH_CONSOLE_VERIFICATION);
  const adsensePublisherId = trimOrUndefined(raw.PUBLIC_ADSENSE_PUBLISHER_ID);
  const allowDemoContent = parseBool(raw.ALLOW_DEMO_CONTENT, !isProduction);

  // --- Provider requirements -------------------------------------------------
  if (dataProvider === 'supabase') {
    if (!supabaseUrl) problems.push('SUPABASE_URL is required when DATA_PROVIDER=supabase');
    else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in|red)$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(supabaseUrl)) {
      problems.push(`SUPABASE_URL does not look like a Supabase project URL: "${supabaseUrl}"`);
    }
    if (!supabaseSecretKey) {
      problems.push('SUPABASE_SECRET_KEY is required when DATA_PROVIDER=supabase (build-time content + Worker writes)');
    }
  }
  if (dataProvider === 'mock' && isProduction && context !== 'tool' && !parseBool(raw.ALLOW_MOCK_IN_PRODUCTION, false)) {
    problems.push('DATA_PROVIDER=mock is not allowed in a production build. Set ALLOW_MOCK_IN_PRODUCTION=true only for deliberate test deployments.');
  }

  // --- Runtime secrets (Worker) ----------------------------------------------
  if (context === 'worker' && isProduction) {
    if ((features.FEATURE_SUBMISSIONS || features.FEATURE_CONTACT_FORM) && !turnstileSecretKey) {
      problems.push('TURNSTILE_SECRET_KEY is required when forms are enabled');
    }
  }

  // --- Feature-dependent public IDs -----------------------------------------
  if (features.FEATURE_GA4 && !ga4MeasurementId) problems.push('PUBLIC_GA4_MEASUREMENT_ID is required when FEATURE_GA4=true');
  if (features.FEATURE_CLOUDFLARE_ANALYTICS && !cloudflareAnalyticsToken) {
    problems.push('PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN is required when FEATURE_CLOUDFLARE_ANALYTICS=true');
  }
  if (features.FEATURE_ADS && !adsensePublisherId) problems.push('PUBLIC_ADSENSE_PUBLISHER_ID is required when FEATURE_ADS=true');
  if (adsensePublisherId && !/^ca-pub-\d{10,20}$/.test(adsensePublisherId)) {
    problems.push('PUBLIC_ADSENSE_PUBLISHER_ID must look like ca-pub-XXXXXXXXXXXXXXXX');
  }
  if ((features.FEATURE_SUBMISSIONS || features.FEATURE_CONTACT_FORM) && isProduction && context === 'build' && !turnstileSiteKey) {
    problems.push('PUBLIC_TURNSTILE_SITE_KEY is required to render forms when FEATURE_SUBMISSIONS/FEATURE_CONTACT_FORM are enabled');
  }

  if (problems.length > 0) throw new EnvValidationError(problems);

  return Object.freeze({
    mode,
    isProduction,
    siteUrl,
    dataProvider,
    supabaseUrl,
    supabaseSecretKey,
    turnstileSiteKey,
    turnstileSecretKey,
    ga4MeasurementId,
    cloudflareAnalyticsToken,
    searchConsoleVerification,
    adsensePublisherId,
    features,
    allowDemoContent,
  });
}

/** Collect raw variables from `process.env` (Node build/tools). */
export function readProcessEnv(): RawEnv {
  // eslint-disable-next-line no-restricted-globals
  const p = typeof process !== 'undefined' ? process.env : {};
  return { ...p } as RawEnv;
}

/** Astro/Vite inlines direct property reads into prerender chunks, whose process.env is intentionally sparse. */
export function readImportMetaEnv(): RawEnv {
  const env = (import.meta as unknown as { env?: ImportMetaEnv }).env ?? ({} as ImportMetaEnv);
  const values: RawEnv = {
    MODE: env.MODE,
    ASTRO_MODE: env.MODE,
    DATA_PROVIDER: env.DATA_PROVIDER,
    ALLOW_MOCK_IN_PRODUCTION: env.ALLOW_MOCK_IN_PRODUCTION,
    ALLOW_DEMO_CONTENT: env.ALLOW_DEMO_CONTENT,
    PUBLIC_SITE_URL: env.PUBLIC_SITE_URL,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY,
    PUBLIC_TURNSTILE_SITE_KEY: env.PUBLIC_TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
    FEATURE_SUBMISSIONS: env.FEATURE_SUBMISSIONS,
    FEATURE_CONTACT_FORM: env.FEATURE_CONTACT_FORM,
    FEATURE_ADS: env.FEATURE_ADS,
    FEATURE_GA4: env.FEATURE_GA4,
    FEATURE_CLOUDFLARE_ANALYTICS: env.FEATURE_CLOUDFLARE_ANALYTICS,
    PUBLIC_GA4_MEASUREMENT_ID: env.PUBLIC_GA4_MEASUREMENT_ID,
    PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN: env.PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN,
    PUBLIC_SEARCH_CONSOLE_VERIFICATION: env.PUBLIC_SEARCH_CONSOLE_VERIFICATION,
    PUBLIC_ADSENSE_PUBLISHER_ID: env.PUBLIC_ADSENSE_PUBLISHER_ID,
  };
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

let cachedBuildEnv: AppEnv | undefined;

/**
 * Build-time environment (used by pages/components during prerendering and by
 * tools). Astro loads `.env` into `process.env` for the prerender step.
 */
export function getBuildEnv(): AppEnv {
  if (!cachedBuildEnv) {
    const raw = { ...readProcessEnv(), ...readImportMetaEnv() };
    const mode = raw.NODE_ENV ?? (raw.ASTRO_MODE || undefined) ?? 'production';
    cachedBuildEnv = buildAppEnv(raw, { mode, context: 'build' });
  }
  return cachedBuildEnv;
}

/** Reset the cached env (tests only). */
export function __resetEnvCache(): void {
  cachedBuildEnv = undefined;
}

/**
 * Worker-runtime environment: merges Cloudflare bindings (`vars` + secrets)
 * over any build-time values compiled into the bundle.
 */
export function getWorkerEnv(bindings: RawEnv | undefined): AppEnv {
  const raw: RawEnv = { ...readProcessEnv(), ...(bindings ?? {}) };
  const mode = raw.NODE_ENV ?? 'production';
  return buildAppEnv(raw, { mode, context: 'worker' });
}
