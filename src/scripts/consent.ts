import { CookieConsentStore } from '@/infrastructure/consent/consent-store';

export function initConsentBanner(): void {
  const banner = document.getElementById('consent-banner');
  if (!banner || banner.dataset.ready === '1') return;
  banner.dataset.ready = '1';

  const store = new CookieConsentStore();
  const prefs = banner.querySelector<HTMLFormElement>('#consent-prefs');
  const manageBtn = banner.querySelector<HTMLButtonElement>('[data-consent="manage"]');
  const saveBtn = banner.querySelector<HTMLButtonElement>('[data-consent="save"]');

  const show = () => {
    const state = store.read();
    if (prefs) {
      const a = prefs.elements.namedItem('analytics') as HTMLInputElement | null;
      const ad = prefs.elements.namedItem('advertising') as HTMLInputElement | null;
      if (a) a.checked = state.analytics;
      if (ad) ad.checked = state.advertising;
    }
    banner.hidden = false;
  };
  const hide = () => {
    banner.hidden = true;
    if (prefs) prefs.hidden = true;
    if (saveBtn) saveBtn.hidden = true;
    manageBtn?.setAttribute('aria-expanded', 'false');
  };

  banner.addEventListener('click', (event) => {
    const btn = (event.target as Element).closest<HTMLButtonElement>('[data-consent]');
    if (!btn) return;
    const action = btn.dataset.consent;
    if (action === 'accept') {
      store.write({ decided: true, analytics: true, advertising: true });
      hide();
    } else if (action === 'reject') {
      store.write({ decided: true, analytics: false, advertising: false });
      hide();
    } else if (action === 'manage' && prefs && saveBtn) {
      const open = prefs.hidden;
      prefs.hidden = !open;
      saveBtn.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    } else if (action === 'save' && prefs) {
      const a = prefs.elements.namedItem('analytics') as HTMLInputElement | null;
      const ad = prefs.elements.namedItem('advertising') as HTMLInputElement | null;
      store.write({ decided: true, analytics: Boolean(a?.checked), advertising: Boolean(ad?.checked) });
      hide();
    }
  });

  // Footer "Cookie preferences" link(s) reopen the banner.
  document.querySelectorAll<HTMLButtonElement>('[data-consent-open]').forEach((el) => el.addEventListener('click', show));

  if (!store.read().decided) show();
}
