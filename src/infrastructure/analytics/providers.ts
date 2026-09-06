/**
 * Analytics provider adapters (client-side). Both are optional and
 * independently configurable. GA4 requires consent; Cloudflare Web Analytics
 * is cookieless and can be configured to load without consent.
 *
 * Nothing here ever receives personal data, question text, IPs or voter tokens —
 * `track()` only accepts short enums/ids/numbers (enforced by callers).
 */
import type { AnalyticsEventName, AnalyticsProvider } from '@/repositories/interfaces';

type Params = Record<string, string | number | boolean>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export class GoogleAnalytics4Provider implements AnalyticsProvider {
  readonly id = 'ga4';
  readonly requiresConsent = true;
  private loaded = false;
  constructor(private readonly measurementId: string) {}

  load(): void {
    if (this.loaded || !this.measurementId) return;
    this.loaded = true;
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', this.measurementId, { anonymize_ip: true, send_page_view: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.measurementId)}`;
    document.head.appendChild(s);
  }

  track(event: AnalyticsEventName, params: Params = {}): void {
    if (!this.loaded) return;
    window.gtag?.('event', event, params);
  }
}

export class CloudflareWebAnalyticsProvider implements AnalyticsProvider {
  readonly id = 'cloudflare';
  /** Cookieless; may be configured to load without consent. */
  readonly requiresConsent = false;
  private loaded = false;
  constructor(private readonly token: string) {}

  load(): void {
    if (this.loaded || !this.token) return;
    this.loaded = true;
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: this.token }));
    document.head.appendChild(s);
  }

  track(): void {
    // Cloudflare Web Analytics does not support custom events.
  }
}

/** No-op provider for development. */
export class NullAnalyticsProvider implements AnalyticsProvider {
  readonly id = 'null';
  readonly requiresConsent = false;
  load(): void {}
  track(): void {}
}

/** Fan-out to every configured provider. */
export class CompositeAnalytics implements AnalyticsProvider {
  readonly id = 'composite';
  readonly requiresConsent = false;
  constructor(private readonly providers: readonly AnalyticsProvider[]) {}
  load(): void {
    this.providers.forEach((p) => p.load());
  }
  loadConsentFree(): void {
    this.providers.filter((p) => !p.requiresConsent).forEach((p) => p.load());
  }
  loadConsented(): void {
    this.providers.filter((p) => p.requiresConsent).forEach((p) => p.load());
  }
  track(event: AnalyticsEventName, params?: Params): void {
    this.providers.forEach((p) => p.track(event, params));
  }
}
