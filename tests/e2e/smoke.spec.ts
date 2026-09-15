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
  await expect(page.locator('#game-stage')).toHaveClass(/voted/);
  await expect(page.locator('#choice-a')).toHaveClass(/picked/);
  expect(
    await page.locator('#choice-b').evaluate((element) => element.classList.contains('picked')),
  ).toBe(false);
  await expect(page.locator('#choice-b')).toHaveClass(/not-picked/);
  const resultA = await page.locator('#percent-a').textContent();
  const resultB = await page.locator('#percent-b').textContent();
  const displayCount = await page.locator('#vote-count').textContent();
  expect(resultA).toMatch(/^\d+\.\d%$/);
  expect(resultB).toMatch(/^\d+\.\d%$/);
  expect(displayCount).toMatch(/^\d{1,3}(?:,\d{3})* votes$/);

  await page.locator('#choice-b').click();
  await expect(page.locator('#choice-b')).toHaveClass(/picked/);
  expect(
    await page.locator('#choice-a').evaluate((element) => element.classList.contains('picked')),
  ).toBe(false);
  await expect(page.locator('#choice-a')).toHaveClass(/not-picked/);
  await expect(page.locator('#percent-a')).toHaveText(resultA ?? '');
  await expect(page.locator('#percent-b')).toHaveText(resultB ?? '');
  await expect(page.locator('#vote-count')).toHaveText(displayCount ?? '');
  expect(removedEndpointRequests).toEqual([]);

  await page.locator('#next-button').click();
  await expect(page.locator('#game-stage')).not.toHaveClass(/voted/);
  await expect(page.locator('#game-stage')).not.toHaveAttribute(
    'data-question-id',
    firstQuestionId ?? '',
  );
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

test('game question can be saved and removed from favorites', async ({ page }) => {
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
  await expect(page.locator('#favorite-icon')).toHaveText('♥');

  const savedRaw = await page.evaluate(() => localStorage.getItem('wyr_favorites'));
  expect(savedRaw).not.toBeNull();

  const saved = JSON.parse(savedRaw ?? '{}') as {
    v: number;
    questions: { id: string }[];
  };
  expect(saved.v).toBe(1);
  expect(saved.questions[0]?.id).toBe(questionId);

  await page.reload();
  await expect(page.locator('#favorite-button')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#favorite-button').click();
  await expect(page.locator('#favorite-button')).toHaveAttribute('aria-pressed', 'false');

  const remaining = await page.evaluate(() => {
    const raw = localStorage.getItem('wyr_favorites');
    return raw ? (JSON.parse(raw) as { questions: unknown[] }).questions.length : 0;
  });
  expect(remaining).toBe(0);
});

test('favorites list and saved-question game work without pack downloads', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'wyr_favorites',
      JSON.stringify({
        v: 1,
        questions: [
          {
            id: 'favorite-test-1',
            a: 'explore outer space',
            b: 'explore the deepest ocean',
            s: 'demq22a',
            d: 2500,
          },
          {
            id: 'favorite-test-2',
            a: 'have a pet dragon',
            b: 'have a friendly robot',
            s: 'demq22b',
            d: 3500,
          },
        ],
      }),
    );
  });

  const manifestRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/game-data/manifest.json') {
      manifestRequests.push(request.url());
    }
  });

  await page.goto('/favorites/');

  await expect(page.locator('#favorites-count')).toHaveText('2 saved questions');
  await expect(page.locator('#favorite-list .favorite-card')).toHaveCount(2);
  await expect(page.locator('#play-favorites')).toBeVisible();

  await page.locator('#play-favorites').click();
  await expect(page).toHaveURL(/\/favorites\/play\/$/);
  await expect(page.locator('#game-stage')).toBeVisible();

  const firstId = await page.locator('#game-stage').getAttribute('data-question-id');
  expect(['favorite-test-1', 'favorite-test-2']).toContain(firstId);

  await expect(page.locator('#favorite-button')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#choice-a').click();
  await page.locator('#next-button').click();

  await expect(page.locator('#game-stage')).not.toHaveAttribute('data-question-id', firstId ?? '');

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
    /favorite-test-[12]/,
  );

  expect(manifestRequests).toEqual([]);

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
