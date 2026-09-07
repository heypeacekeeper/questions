/** Shared form controller: Turnstile render/reset, JSON submit, accessible errors. */
interface TurnstileApi { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void; getResponse(id?: string): string | undefined }
declare global { interface Window { turnstile?: TurnstileApi } }
interface ApiResponse { ok: boolean; message?: string; issues?: { field: string; message: string }[] }

export function initForms(): void {
  document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach((form) => {
    if (form.dataset.ready === '1') return;
    form.dataset.ready = '1';
    const renderedAt = Date.now();
    const slot = form.querySelector<HTMLElement>('[data-turnstile]');
    let widgetId: string | undefined;
    let token = '';
    const renderTurnstile = () => {
      if (!slot || widgetId || !window.turnstile) return;
      widgetId = window.turnstile.render(slot, { sitekey: slot.dataset.sitekey, action: slot.dataset.action, callback: (t: string) => { token = t; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; } });
    };
    if (window.turnstile) renderTurnstile(); else { const iv = setInterval(() => { if (window.turnstile) { clearInterval(iv); renderTurnstile(); } }, 200); setTimeout(() => clearInterval(iv), 15000); }
    const resetTurnstile = () => { token = ''; try { window.turnstile?.reset(widgetId); } catch { /* ignore */ } };
    const status = form.querySelector<HTMLElement>('[data-status]');
    const errors = form.querySelectorAll<HTMLElement>('[data-error-for]');
    const clearErrors = () => { errors.forEach((e) => (e.textContent = '')); form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid')); };
    const showIssues = (issues: { field: string; message: string }[]) => {
      let first: HTMLElement | null = null;
      for (const i of issues) {
        const el = form.querySelector<HTMLElement>(`[data-error-for="${i.field}"]`); if (el) el.textContent = i.message;
        const input = form.elements.namedItem(i.field) as HTMLElement | null; if (input && 'setAttribute' in input) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
      }
      first?.focus();
    };
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); clearErrors(); if (status) { status.textContent = ''; status.className = 'form-status'; }
      const data: Record<string, unknown> = {};
      new FormData(form).forEach((v, k) => { data[k] = typeof v === 'string' ? v : ''; });
      for (const k of ['agree', 'privacy']) if (k in data || form.elements.namedItem(k)) data[k] = (form.elements.namedItem(k) as HTMLInputElement | null)?.checked ?? false;
      data.turnstileToken = token || window.turnstile?.getResponse(widgetId) || ''; data.renderedAt = renderedAt;
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]'); if (button) button.disabled = true;
      try {
        const res = await fetch(form.dataset.endpoint ?? '', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(data) });
        const body = (await res.json().catch(() => ({ ok: false }))) as ApiResponse;
        if (res.ok && body.ok) { form.reset(); resetTurnstile(); if (status) { status.textContent = body.message ?? 'Thank you! Your message was sent.'; status.classList.add('success'); status.focus?.(); } }
        else { resetTurnstile(); if (body.issues?.length) showIssues(body.issues); if (status) { status.textContent = body.message ?? 'Please check the form and try again.'; status.classList.add('error'); } }
      } catch { resetTurnstile(); if (status) { status.textContent = 'Something went wrong. Please try again in a moment.'; status.classList.add('error'); } }
      finally { if (button) button.disabled = false; }
    });
  });
}
