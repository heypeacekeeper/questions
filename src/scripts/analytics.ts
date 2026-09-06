/**
 * Client analytics bootstrap: consent-gated loading + privacy-conscious
 * monitoring hooks (Core Web Vitals, JS errors, API timings). Configuration is
 * injected via data-* attributes on the <script> host element so no IDs are
 * hardcoded and nothing loads in development.
 */
import { CONSENT_EVENT, CookieConsentStore, type ConsentState } from '@/infrastructure/consent/consent-store';
import { CloudflareWebAnalyticsProvider, CompositeAnalytics, GoogleAnalytics4Provider } from '@/infrastructure/analytics/providers';
import type { AnalyticsEventName } from '@/repositories/interfaces';

export interface AnalyticsConfig {
  ga4Id: string | null;
  cfToken: string | null;
  /** Load Cloudflare Web Analytics only after analytics consent (default: no). */
  cfRequiresConsent: boolean;
}

type Params = Record<string, string | number | boolean>;

let composite: CompositeAnalytics | null = null;

/** Global, safe tracking entry point used by the game and forms. */
export function track(event: AnalyticsEventName, params: Params = {}): void {
  composite?.track(event, sanitize(params));
}

/** Whitelist parameter keys and clamp values so PII can't leak by accident. */
function sanitize(params: Params): Params {
  const allowed = new Set(['category', 'choice', 'status', 'endpoint', 'ms', 'name', 'value', 'rating', 'code', 'source']);
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (!allowed.has(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 60) : v;
  }
  return out;
}

export function initAnalytics(config: AnalyticsConfig): void {
  if (composite) return;
  const providers = [];
  if (config.ga4Id) providers.push(new GoogleAnalytics4Provider(config.ga4Id));
  if (config.cfToken) {
    const cf = new CloudflareWebAnalyticsProvider(config.cfToken);
    if (config.cfRequiresConsent) Object.defineProperty(cf, 'requiresConsent', { value: true });
    providers.push(cf);
  }
  if (providers.length === 0) return;
  composite = new CompositeAnalytics(providers);

  composite.loadConsentFree();
  const store = new CookieConsentStore();
  const apply = (state: ConsentState) => {
    if (state.decided && state.analytics) composite?.loadConsented();
  };
  apply(store.read());
  document.addEventListener(CONSENT_EVENT, (e) => apply((e as CustomEvent<ConsentState>).detail));

  installMonitoring();
}

function installMonitoring(): void {
  // JS errors (message only — no stack, no URLs with query strings).
  window.addEventListener('error', (e) => {
    track('js_error', { name: String(e.message ?? 'error').slice(0, 60) });
  });
  window.addEventListener('unhandledrejection', () => track('js_error', { name: 'unhandledrejection' }));

  // Core Web Vitals via PerformanceObserver (no library).
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') track('web_vital', { name: 'LCP', value: Math.round(entry.startTime) });
        if (entry.entryType === 'layout-shift' && !(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
          track('web_vital', { name: 'CLS', value: Math.round(((entry as PerformanceEntry & { value: number }).value ?? 0) * 1000) / 1000 });
        }
        if (entry.entryType === 'event' && (entry as PerformanceEntry & { interactionId?: number }).interactionId) {
          track('web_vital', { name: 'INP', value: Math.round(entry.duration) });
        }
      }
    });
    po.observe({ type: 'largest-contentful-paint', buffered: true });
    po.observe({ type: 'layout-shift', buffered: true });
    po.observe({ type: 'event', buffered: true, durationThreshold: 200 } as PerformanceObserverInit);
  } catch {
    /* unsupported browser */
  }
}

/** Called by fetch wrappers to report API latency/failures without payloads. */
export function reportApiTiming(endpoint: string, ms: number, status: number): void {
  track('api_timing', { endpoint, ms: Math.round(ms), status: String(status) });
  if (status >= 500 || status === 0) {
    track(endpoint.includes('vote') ? 'vote_failed' : 'form_failed', { endpoint, status: String(status) });
  }
}
