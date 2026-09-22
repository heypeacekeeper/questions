/** Shared form controller: Turnstile render/reset, JSON submit, accessible errors. */
interface TurnstileApi {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  reset(id?: string): void;
  getResponse(id?: string): string | undefined;
  ready?(callback: () => void): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
interface ApiResponse {
  ok: boolean;
  message?: string;
  issues?: { field: string; message: string }[];
}

export function initForms(): void {
  document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach((form) => {
    if (form.dataset.ready === '1') return;
    form.dataset.ready = '1';
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    let renderedAt = Date.now();
    const slot = form.querySelector<HTMLElement>('[data-turnstile]');
    const turnstileError = form.querySelector<HTMLElement>('[data-error-for="turnstile"]');
    let widgetId: string | undefined;
    let token = '';
    let loadTimer: number | null = null;

    const setTurnstileError = (message: string) => {
      if (turnstileError) turnstileError.textContent = message;
    };

    const clearLoadTimer = () => {
      if (loadTimer === null) return;
      window.clearTimeout(loadTimer);
      loadTimer = null;
    };

    const turnstileUnavailable = () => {
      clearLoadTimer();
      token = '';
      if (button) button.disabled = true;
      setTurnstileError('Human verification could not load. Please refresh and try again.');
    };

    const renderTurnstile = () => {
      if (!slot || widgetId || !window.turnstile) return;

      widgetId = window.turnstile.render(slot, {
        sitekey: slot.dataset.sitekey,
        action: slot.dataset.action,
        'response-field': false,
        callback: (t: string) => {
          token = t;
          setTurnstileError('');
          if (button) button.disabled = false;
        },
        'expired-callback': () => {
          token = '';
          if (button) button.disabled = true;
          setTurnstileError('Verification expired. Please complete it again.');
        },
        'error-callback': () => {
          token = '';
          if (button) button.disabled = true;
          setTurnstileError('Human verification failed to load. Please try again.');
        },
      });
    };

    const initializeTurnstile = () => {
      clearLoadTimer();

      const api = window.turnstile;
      if (!api) {
        turnstileUnavailable();
        return;
      }

      if (typeof api.ready === 'function') {
        api.ready(renderTurnstile);
      } else {
        renderTurnstile();
      }
    };

    const turnstileScript = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile-script]',
    );

    if (window.turnstile) {
      initializeTurnstile();
    } else if (turnstileScript) {
      turnstileScript.addEventListener('load', initializeTurnstile, { once: true });
      turnstileScript.addEventListener('error', turnstileUnavailable, { once: true });
      loadTimer = window.setTimeout(turnstileUnavailable, 15000);
    } else {
      turnstileUnavailable();
    }
    const resetTurnstile = () => {
      token = '';
      try {
        window.turnstile?.reset(widgetId);
      } catch {
        /* ignore */
      }
    };
    const status = form.querySelector<HTMLElement>('[data-status]');
    const errors = form.querySelectorAll<HTMLElement>('[data-error-for]');

    type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    const isFormControl = (value: unknown): value is FormControl =>
      value instanceof HTMLInputElement ||
      value instanceof HTMLTextAreaElement ||
      value instanceof HTMLSelectElement;

    const errorFor = (field: string): HTMLElement | null =>
      form.querySelector<HTMLElement>(`[data-error-for="${field}"]`);

    const appendDescription = (control: HTMLElement, id: string) => {
      const descriptions = new Set(
        (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
      );
      descriptions.add(id);
      control.setAttribute('aria-describedby', [...descriptions].join(' '));
    };

    for (const error of errors) {
      const field = error.dataset.errorFor;
      if (!field) continue;

      error.id ||= `${form.id}-${field.replace(/[^a-z0-9_-]/gi, '-')}-error`;

      if (field === 'turnstile') {
        if (slot) appendDescription(slot, error.id);
        continue;
      }

      const control = form.elements.namedItem(field);
      if (!isFormControl(control)) continue;

      appendDescription(control, error.id);

      const hint = control.closest<HTMLElement>('.form-field')?.querySelector<HTMLElement>('.hint');
      if (hint) {
        hint.id ||= `${control.id}-hint`;
        appendDescription(control, hint.id);
      }
    }

    if (status) status.tabIndex = -1;

    const clearFieldIssue = (control: FormControl) => {
      const field = control.name;
      if (!field) return;

      const error = errorFor(field);
      if (error) error.textContent = '';

      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-errormessage');
    };

    const clearErrors = () => {
      errors.forEach((error) => {
        error.textContent = '';
      });

      form.querySelectorAll('[aria-invalid]').forEach((element) => {
        element.removeAttribute('aria-invalid');
        element.removeAttribute('aria-errormessage');
      });
    };

    const localValidationMessage = (control: FormControl): string => {
      const value =
        control instanceof HTMLInputElement && control.type === 'checkbox'
          ? ''
          : control.value.trim();

      if (control.required && !value && control.type !== 'checkbox') {
        return 'Please complete this field.';
      }

      if (control instanceof HTMLInputElement && control.type === 'checkbox' && !control.checked) {
        return 'Please check this box to continue.';
      }

      if (control.validity.typeMismatch && control.type === 'email') {
        return 'Enter a valid email address.';
      }

      if (
        (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
        control.validity.tooShort
      ) {
        return `Enter at least ${control.minLength} characters.`;
      }

      if (
        (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
        control.validity.tooLong
      ) {
        return `Enter no more than ${control.maxLength} characters.`;
      }

      return control.validationMessage || 'Please check this field.';
    };

    const validateClientFields = (): { field: string; message: string }[] => {
      const issues: { field: string; message: string }[] = [];

      for (const element of Array.from(form.elements)) {
        if (!isFormControl(element) || !element.name || element.type === 'hidden') continue;

        const hasBlankRequiredText =
          element.required && element.type !== 'checkbox' && element.value.trim().length === 0;

        if (!element.checkValidity() || hasBlankRequiredText) {
          issues.push({
            field: element.name,
            message: localValidationMessage(element),
          });
        }
      }

      return issues;
    };

    const showIssues = (issues: { field: string; message: string }[]) => {
      let first: FormControl | null = null;

      for (const issue of issues) {
        const error = errorFor(issue.field);
        if (error) error.textContent = issue.message;

        const control = form.elements.namedItem(issue.field);
        if (!isFormControl(control)) continue;

        control.setAttribute('aria-invalid', 'true');

        if (error?.id) {
          control.setAttribute('aria-errormessage', error.id);
        }

        first ??= control;
      }

      first?.focus();
    };

    const clearCorrectedIssue = (event: Event) => {
      const control = event.target;
      if (!isFormControl(control)) return;

      const hasBlankRequiredText =
        control.required && control.type !== 'checkbox' && control.value.trim().length === 0;

      if (control.checkValidity() && !hasBlankRequiredText) {
        clearFieldIssue(control);
      }
    };

    form.addEventListener('input', clearCorrectedIssue);
    form.addEventListener('change', clearCorrectedIssue);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors();
      if (status) {
        status.textContent = '';
        status.className = 'form-status';
      }

      const clientIssues = validateClientFields();

      if (clientIssues.length > 0) {
        showIssues(clientIssues);

        if (status) {
          status.textContent = 'Please check the highlighted fields.';
          status.classList.add('error');
        }

        return;
      }

      const data: Record<string, unknown> = {};
      new FormData(form).forEach((v, k) => {
        data[k] = typeof v === 'string' ? v : '';
      });
      delete data['cf-turnstile-response'];
      for (const k of ['agree', 'privacy'])
        if (k in data || form.elements.namedItem(k))
          data[k] = (form.elements.namedItem(k) as HTMLInputElement | null)?.checked ?? false;
      data.turnstileToken = token || window.turnstile?.getResponse(widgetId) || '';
      data.renderedAt = renderedAt;
      if (button) button.disabled = true;
      try {
        const res = await fetch(form.dataset.endpoint ?? '', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(data),
        });
        const body = (await res.json().catch(() => ({ ok: false }))) as ApiResponse;
        if (res.ok && body.ok) {
          form.reset();
          renderedAt = Date.now();
          resetTurnstile();
          if (status) {
            status.textContent = body.message ?? 'Thank you! Your message was sent.';
            status.classList.add('success');
            status.focus?.();
          }
        } else {
          resetTurnstile();
          if (body.issues?.length) showIssues(body.issues);
          if (status) {
            status.textContent = body.message ?? 'Please check the form and try again.';
            status.classList.add('error');
          }
        }
      } catch {
        resetTurnstile();
        if (status) {
          status.textContent = 'Something went wrong. Please try again in a moment.';
          status.classList.add('error');
        }
      } finally {
        if (button) button.disabled = !token;
      }
    });

    window.addEventListener('pageshow', (event) => {
      if (event.persisted) renderedAt = Date.now();
    });
  });
}
