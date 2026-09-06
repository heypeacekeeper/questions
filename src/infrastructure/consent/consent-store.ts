/**
 * Consent state persistence (client-side). Replaceable adapter: a certified
 * CMP can later implement the same `ConsentStore` interface and dispatch the
 * same `wyr:consent` event.
 */
import { COOKIES } from '@/config/site';

export interface ConsentState {
  /** Visitor made an explicit decision. */
  readonly decided: boolean;
  readonly analytics: boolean;
  readonly advertising: boolean;
  readonly updatedAt: string | null;
  readonly version: 1;
}

export const DEFAULT_CONSENT: ConsentState = { decided: false, analytics: false, advertising: false, updatedAt: null, version: 1 };

export interface ConsentStore {
  read(): ConsentState;
  write(state: Omit<ConsentState, 'updatedAt' | 'version'>): ConsentState;
}

export const CONSENT_EVENT = 'wyr:consent';

export class CookieConsentStore implements ConsentStore {
  constructor(private readonly cookieName: string = COOKIES.consent, private readonly maxAge: number = COOKIES.consentMaxAgeSeconds) {}

  read(): ConsentState {
    try {
      const raw = document.cookie.split('; ').find((c) => c.startsWith(`${this.cookieName}=`));
      if (!raw) return DEFAULT_CONSENT;
      const parsed = JSON.parse(decodeURIComponent(raw.slice(this.cookieName.length + 1))) as Partial<ConsentState>;
      if (parsed.version !== 1) return DEFAULT_CONSENT;
      return {
        decided: Boolean(parsed.decided),
        analytics: Boolean(parsed.analytics),
        advertising: Boolean(parsed.advertising),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
        version: 1,
      };
    } catch {
      return DEFAULT_CONSENT;
    }
  }

  write(state: Omit<ConsentState, 'updatedAt' | 'version'>): ConsentState {
    const full: ConsentState = { ...state, updatedAt: new Date().toISOString(), version: 1 };
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${this.cookieName}=${encodeURIComponent(JSON.stringify(full))}; Max-Age=${this.maxAge}; Path=/; SameSite=Lax${secure}`;
    document.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: full }));
    return full;
  }
}
