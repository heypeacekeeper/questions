import { expect, test } from '@playwright/test';

const categoryId = '11111111-1111-4111-8111-000000000001';
const turnstileToken = 'test-turnstile-token-value';

test.beforeEach(async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
});

test('home game shows stable local display results and advances', async ({ page }) => {
  const removedEndpoint = `/${['api', 'vote'].join('/')}/`;
  const removedEndpointRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === removedEndpoint) {
      removedEndpointRequests.push(request.url());
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('wyr_pack', 'for-couples');
  });

  const manifestLoaded = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/game-data/manifest.json',
  );

  await page.goto('/');
  await manifestLoaded;

  await expect(page.locator('#pack-label')).toHaveText('Mixed');
  expect(await page.evaluate(() => localStorage.getItem('wyr_pack'))).toBeNull();

  await expect(page).toHaveTitle(/Would You Rather Questions/);
  await expect(page.locator('main h1').first()).toContainText('Would You Rather Questions');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /wouldyouratherquestions\.org\/$/,
  );
  await expect(page.locator('#choice-a')).toBeVisible();
  await expect(page.locator('#verdict-text')).toHaveCount(1);

  await page.locator('#pack-button').click();
  await expect(page.locator('#pack-dialog')).toBeVisible();
  await page.locator('#close-pack-dialog').click();

  await page.locator('#pack-button').click();
  await page.evaluate(() => {
    const picker = document.getElementById('pack-picker');
    const gate = document.getElementById('age-gate');
    if (picker) picker.hidden = true;
    if (gate) gate.hidden = false;
  });
  await expect(page.locator('#age-gate')).toBeVisible();

  await page.locator('#age-back-button').focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('#pack-dialog')).toBeVisible();
  await expect(page.locator('#pack-picker')).toBeVisible();
  await page.locator('#close-pack-dialog').click();

  const firstQuestionId = await page.locator('#game-stage').getAttribute('data-question-id');
  await page.locator('#choice-a').click();
  await expect(page.locator('#game-stage')).toHaveClass(/answered/);
  await expect(page.locator('#game-stage')).toHaveAttribute('data-result-ready', '1');
  await expect(page.locator('#choice-a')).toHaveClass(/picked/);
  expect(
    await page.locator('#choice-b').evaluate((element) => element.classList.contains('picked')),
  ).toBe(false);
  await expect(page.locator('#choice-b')).toHaveClass(/not-picked/);
  const resultA = await page.locator('#percent-a').textContent();
  const resultB = await page.locator('#percent-b').textContent();
  expect(resultA).toMatch(/^\d+\.\d%$/);
  expect(resultB).toMatch(/^\d+\.\d%$/);

  await page.locator('#choice-b').click();
  await expect(page.locator('#choice-b')).toHaveClass(/picked/);
  expect(
    await page.locator('#choice-a').evaluate((element) => element.classList.contains('picked')),
  ).toBe(false);
  await expect(page.locator('#choice-a')).toHaveClass(/not-picked/);
  await expect(page.locator('#percent-a')).toHaveText(resultA ?? '');
  await expect(page.locator('#percent-b')).toHaveText(resultB ?? '');
  expect(removedEndpointRequests).toEqual([]);

  await page.locator('#next-button').click();
  await expect(page.locator('#game-stage')).not.toHaveClass(/answered/);
  await expect(page.locator('#game-stage')).not.toHaveAttribute(
    'data-question-id',
    firstQuestionId ?? '',
  );
});

test('game milestone counts unique answers and restores keyboard focus', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('wyr_completed_questions', '4');
  });

  await page.goto('/');

  const stage = page.locator('#game-stage');
  const choiceA = page.locator('#choice-a');
  const choiceB = page.locator('#choice-b');
  const milestone = page.locator('#game-milestone');
  const nextButton = page.locator('#next-button');

  await expect(stage).toHaveAttribute('data-entry-ready', '1');
  await choiceA.click();

  await expect(choiceA).toHaveAttribute('aria-pressed', 'true');
  await expect(choiceB).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#option-label-a')).toHaveText('YOUR CHOICE');
  await expect(milestone).toBeVisible();
  await expect(milestone).toBeFocused();
  await expect(milestone).toHaveAttribute('aria-label', '5 questions completed. Continue');

  await choiceB.click({ force: true });

  expect(await page.evaluate(() => sessionStorage.getItem('wyr_completed_questions'))).toBe('5');

  await milestone.click();
  await expect(milestone).toBeHidden();
  await expect(nextButton).toBeFocused();

  const answeredQuestionId = await stage.getAttribute('data-question-id');
  await nextButton.click();
  await expect(stage).not.toHaveAttribute('data-question-id', answeredQuestionId ?? '');

  const skippedQuestionId = await stage.getAttribute('data-question-id');
  await page.locator('#skip-button').click();
  await expect(stage).not.toHaveAttribute('data-question-id', skippedQuestionId ?? '');

  expect(await page.evaluate(() => sessionStorage.getItem('wyr_completed_questions'))).toBe('5');
});

test('single question page does not render a next button', async ({ page }) => {
  await page.goto('/s/demq22a/');

  await expect(page.locator('#choice-a')).toBeVisible();
  await expect(page.locator('#next-button')).toHaveCount(0);
});

test('mobile hamburger opens, closes, and resets reliably', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const menuButton = page.locator('#menu-button');
  const navLinks = page.locator('#nav-links');
  const navScrim = page.locator('#nav-scrim');
  const categoryButton = page.locator('#category-button');
  const categoryMenu = page.locator('#category-menu');

  await menuButton.click();
  await expect(navLinks).toBeVisible();
  await expect(navScrim).toBeVisible();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(menuButton).toHaveAttribute('aria-label', 'Close menu');
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).toBe(
    'hidden',
  );

  await categoryButton.click();
  await expect(categoryButton).toHaveAttribute('aria-expanded', 'true');
  await expect(categoryMenu).toBeVisible();
  await categoryButton.click();
  await expect(categoryButton).toHaveAttribute('aria-expanded', 'false');
  await expect(categoryMenu).toBeHidden();
  await categoryButton.click();
  await expect(categoryMenu).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(categoryMenu).toBeHidden();
  await expect(navLinks).toBeHidden();
  await expect(navScrim).toBeHidden();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toHaveAttribute('aria-label', 'Open menu');
  await expect(menuButton).toBeFocused();
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).not.toBe(
    'hidden',
  );

  await menuButton.click();
  await menuButton.click();
  await expect(navLinks).toBeHidden();

  await menuButton.click();
  await navScrim.click({ position: { x: 5, y: 400 } });
  await expect(navLinks).toBeHidden();

  await menuButton.click();
  await page.setViewportSize({ width: 801, height: 844 });
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toHaveAttribute('aria-label', 'Open menu');
  await expect(navLinks).not.toHaveClass(/open/);
  await expect(navScrim).not.toHaveClass(/open/);
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).not.toBe(
    'hidden',
  );

  for (const path of ['/funny-would-you-rather-questions/', '/about-us/']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await page.locator('#menu-button').click();
    await expect(page.locator('#nav-links')).toBeVisible();
    await page.locator('#nav-scrim').click({ position: { x: 5, y: 400 } });
    await expect(page.locator('#nav-links')).toBeHidden();
  }

  for (const [selector, destination] of [
    ['#nav-links a[href="/about-us/"]', /about-us\/$/],
    ['#nav-links a[href="/contact-us/"]', /contact-us\/$/],
    ['#nav-links a[href="/submit-a-question/"]', /submit-a-question\/$/],
  ] as const) {
    await page.goto('/');
    await page.setViewportSize({ width: 390, height: 844 });
    await menuButton.click();
    await page.locator(selector).click();
    await expect(page).toHaveURL(destination);
    await expect(page.locator('#menu-button')).toHaveAttribute('aria-expanded', 'false');
  }

  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  await menuButton.click();
  await categoryButton.click();
  await page.locator('#category-menu a[href="/funny-would-you-rather-questions/"]').click();
  await expect(page).toHaveURL(/funny-would-you-rather-questions\/$/);
  await expect(page.locator('#menu-button')).toHaveAttribute('aria-expanded', 'false');
});

test('contact and submission APIs remain protected form flows', async ({ page }, testInfo) => {
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '-');
  const contact = await page.request.post('/api/contact/', {
    headers: { origin },
    data: {
      name: 'Smoke Test',
      email: `smoke-${suffix}@example.com`,
      subject: `E2E contact ${suffix}`,
      message: 'This is a browser-flow smoke test message.',
      privacy: true,
      website: '',
      renderedAt: Date.now() - 5_000,
      turnstileToken,
    },
  });
  expect(contact.status()).toBe(200);
  expect((await contact.json()).ok).toBe(true);

  const submission = await page.request.post('/api/submit-question/', {
    headers: { origin },
    data: {
      optionA: `pilot a balloon ${suffix}`,
      optionB: `captain a submarine ${suffix}`,
      categoryId,
      name: '',
      email: '',
      agree: true,
      website: '',
      renderedAt: Date.now() - 5_000,
      turnstileToken,
    },
  });
  expect(submission.status()).toBe(200);
  expect((await submission.json()).ok).toBe(true);
});

test('browser form excludes the automatic Turnstile response field', async ({ page }) => {
  await page.addInitScript(() => {
    const browserWindow = window as Window & {
      __turnstileOptions?: Record<string, unknown>;
    };

    window.turnstile = {
      render(element, options) {
        browserWindow.__turnstileOptions = options;

        // Simulate Turnstile's default hidden form field.
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'cf-turnstile-response';
        hidden.value = 'automatic-response-token';
        element.append(hidden);

        const callback = options.callback;
        if (typeof callback === 'function') {
          callback('test-turnstile-token-value');
        }

        return 'test-widget';
      },
      reset() {},
      getResponse() {
        return 'test-turnstile-token-value';
      },
    };
  });

  let submittedPayload: Record<string, unknown> | null = null;

  await page.route('**/api/contact/', async (route) => {
    submittedPayload = route.request().postDataJSON() as Record<string, unknown>;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, message: 'Test message received.' }),
    });
  });

  await page.goto('/contact-us/');

  await page.locator('#c-name').fill('Browser Test');
  await page.locator('#c-email').fill('browser-test@example.com');
  await page.locator('#c-subject').fill('Turnstile payload test');
  await page
    .locator('#c-message')
    .fill('This verifies the complete browser form payload handling.');
  await page.locator('input[name="privacy"]').check();

  await page.locator('#contact-form button[type="submit"]').click();
  await expect(page.locator('#contact-form [data-status]')).toHaveText('Test message received.');

  const responseField = await page.evaluate(() => {
    const browserWindow = window as Window & {
      __turnstileOptions?: Record<string, unknown>;
    };
    return browserWindow.__turnstileOptions?.['response-field'];
  });

  expect(responseField).toBe(false);
  expect(submittedPayload).not.toBeNull();
  expect(submittedPayload).toMatchObject({
    turnstileToken: 'test-turnstile-token-value',
  });
  expect(submittedPayload).not.toHaveProperty('cf-turnstile-response');
});

test('support pages and 404 render without blank states', async ({ page }) => {
  for (const path of [
    '/contact-us/',
    '/submit-a-question/',
    '/privacy-policy/',
    '/terms-and-conditions/',
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();

    const documentTitle = await page.title();
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      documentTitle,
    );
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
      'content',
      documentTitle,
    );
  }
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
});

test('home question changes after reload and browser history restoration', async ({ page }) => {
  await page.goto('/');

  const stage = page.locator('#game-stage');
  await expect(stage).toHaveAttribute('data-entry-ready', '1');

  const firstQuestionId = await stage.getAttribute('data-question-id');
  expect(firstQuestionId).toBeTruthy();

  await page.reload();
  await expect(stage).toHaveAttribute('data-entry-ready', '1');

  const secondQuestionId = await stage.getAttribute('data-question-id');
  expect(secondQuestionId).toBeTruthy();
  expect(secondQuestionId).not.toBe(firstQuestionId);

  await page.goto('/categories/');
  await page.goBack();

  await expect(page).toHaveURL(/\/$/);
  await expect(stage).not.toHaveAttribute('data-question-id', secondQuestionId ?? '');

  const restoredQuestionId = await stage.getAttribute('data-question-id');
  expect(restoredQuestionId).toBeTruthy();
  expect(restoredQuestionId).not.toBe(secondQuestionId);
});

test('game question can be saved and removed using ID-only storage', async ({ page }) => {
  await page.goto('/');

  const favoriteButton = page.locator('#favorite-button');
  await expect(favoriteButton).toBeVisible();
  await expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');
  await expect(favoriteButton).toHaveAttribute('aria-label', 'Save this question to favorites');

  const questionId = await page.locator('#game-stage').getAttribute('data-question-id');
  expect(questionId).toBeTruthy();

  await favoriteButton.click();
  await expect(favoriteButton).toHaveAttribute('aria-pressed', 'true');
  await expect(favoriteButton).toHaveAttribute('aria-label', 'Remove this question from favorites');

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('wyr_favorites');
    return raw ? (JSON.parse(raw) as { v: number; ids: string[] }) : null;
  });

  expect(saved).toEqual({
    v: 2,
    ids: [questionId],
  });

  await page.reload();
  await expect(page.locator('#game-stage')).toHaveAttribute('data-entry-ready', '1');

  const persisted = await page.evaluate((id) => {
    const raw = localStorage.getItem('wyr_favorites');
    if (!raw) return false;

    const payload = JSON.parse(raw) as { v: number; ids: string[] };
    return payload.v === 2 && payload.ids.includes(id);
  }, questionId!);

  expect(persisted).toBe(true);

  await page.goto('/favorites/');
  await expect(page.locator('#favorites-count')).toHaveText('1 saved question');
  await expect(page.locator('#favorite-list .favorite-card')).toHaveCount(1);

  await page.locator('.favorite-card-actions button').click();
  await expect(page.locator('#favorites-count')).toHaveText('0 saved questions');
  await expect(page.locator('#favorites-empty')).toBeVisible();

  const remaining = await page.evaluate(() => {
    const raw = localStorage.getItem('wyr_favorites');
    return raw ? (JSON.parse(raw) as { ids: string[] }).ids.length : 0;
  });

  expect(remaining).toBe(0);
});

test('favorites migrate, reconcile, and play from the current catalog', async ({ page }) => {
  const firstId = '22222222-2222-4222-8222-000000000001';
  const secondId = '22222222-2222-4222-8222-000000000003';
  const unavailableId = '99999999-9999-4999-8999-999999999999';

  await page.addInitScript(
    ({ firstId, secondId, unavailableId }) => {
      localStorage.setItem(
        'wyr_favorites',
        JSON.stringify({
          v: 1,
          questions: [
            {
              id: firstId,
              a: 'stale option A',
              b: 'stale option B',
              s: 'oldcode1',
            },
            {
              id: secondId,
              a: 'another stale option A',
              b: 'another stale option B',
              s: 'oldcode2',
            },
            {
              id: unavailableId,
              a: 'deleted question A',
              b: 'deleted question B',
              s: 'deleted1',
            },
          ],
        }),
      );
    },
    { firstId, secondId, unavailableId },
  );

  const manifestRequests: string[] = [];
  const packRequests: string[] = [];

  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;

    if (pathname === '/game-data/manifest.json') {
      manifestRequests.push(request.url());
    }

    if (pathname.includes('/game-data/packs/')) {
      packRequests.push(request.url());
    }
  });

  await page.goto('/favorites/');

  await expect(page.locator('#favorites-count')).toHaveText('2 saved questions');
  await expect(page.locator('#favorite-list .favorite-card')).toHaveCount(2);
  await expect(page.locator('#favorite-list')).toContainText('[DEMO] have a pet dragon');
  await expect(page.locator('#favorite-list')).toContainText('[DEMO] sweat maple syrup');
  await expect(page.locator('#favorite-list')).not.toContainText('stale option');
  await expect(page.locator('#play-favorites')).toBeVisible();

  const migrated = await page.evaluate(() => {
    const raw = localStorage.getItem('wyr_favorites');
    return raw ? (JSON.parse(raw) as { v: number; ids: string[] }) : null;
  });

  expect(migrated).toEqual({
    v: 2,
    ids: [firstId, secondId],
  });

  await page.locator('#play-favorites').click();
  await expect(page).toHaveURL(/\/favorites\/play\/$/);
  await expect(page.locator('#game-stage')).toBeVisible();

  const playedFirstId = await page.locator('#game-stage').getAttribute('data-question-id');
  expect([firstId, secondId]).toContain(playedFirstId);
  await expect(page.locator('#favorite-button')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#choice-a').click();
  await page.locator('#next-button').click();

  await expect(page.locator('#game-stage')).not.toHaveAttribute(
    'data-question-id',
    playedFirstId ?? '',
  );

  await page.locator('#choice-b').click();
  await page.locator('#next-button').click();

  await expect(page.locator('#verdict-text')).toHaveText(
    'You have played every saved question. Nice work.',
  );
  await expect(page.locator('#next-label')).toHaveText('Play again');

  await page.locator('#next-button').click();
  await expect(page.locator('#next-label')).toHaveText('Next question');
  await expect(page.locator('#game-stage')).toHaveAttribute(
    'data-question-id',
    /22222222-2222-4222-8222-00000000000[13]/,
  );

  expect(manifestRequests).toEqual([]);
  expect(packRequests).toEqual([]);

  await page.goto('/favorites/');
  await expect(page.locator('#favorites-count')).toHaveText('2 saved questions');

  await page.locator('.favorite-card-actions button').first().click();
  await expect(page.locator('#favorites-count')).toHaveText('1 saved question');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#clear-favorites').click();

  await expect(page.locator('#favorites-count')).toHaveText('0 saved questions');
  await expect(page.locator('#favorites-empty')).toBeVisible();
  await expect(page.locator('#favorite-list')).toBeHidden();
});
