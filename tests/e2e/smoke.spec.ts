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

  await page.goto('/');
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

  const firstQuestionId = await page.locator('#game-stage').getAttribute('data-question-id');
  await page.locator('#choice-a').click();
  await expect(page.locator('#game-stage')).toHaveClass(/voted/);
  await expect(page.locator('#choice-a')).toHaveClass(/picked/);
  expect(await page.locator('#choice-b').evaluate((element) => element.classList.contains('picked'))).toBe(false);
  await expect(page.locator('#choice-b')).toHaveClass(/not-picked/);
  const resultA = await page.locator('#percent-a').textContent();
  const resultB = await page.locator('#percent-b').textContent();
  const displayCount = await page.locator('#vote-count').textContent();
  expect(resultA).toMatch(/^\d+\.\d%$/);
  expect(resultB).toMatch(/^\d+\.\d%$/);
  expect(displayCount).toMatch(/^\d{1,3}(?:,\d{3})* votes$/);


  await page.locator('#choice-b').click();
  await expect(page.locator('#choice-b')).toHaveClass(/picked/);
  expect(await page.locator('#choice-a').evaluate((element) => element.classList.contains('picked'))).toBe(false);
  await expect(page.locator('#choice-a')).toHaveClass(/not-picked/);
  await expect(page.locator('#percent-a')).toHaveText(resultA ?? '');
  await expect(page.locator('#percent-b')).toHaveText(resultB ?? '');
  await expect(page.locator('#vote-count')).toHaveText(displayCount ?? '');
  expect(removedEndpointRequests).toEqual([]);

  await page.locator('#next-button').click();
  await expect(page.locator('#game-stage')).not.toHaveClass(/voted/);
  await expect(page.locator('#game-stage')).not.toHaveAttribute('data-question-id', firstQuestionId ?? '');
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
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).toBe('hidden');

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
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).not.toBe('hidden');

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
  expect(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow)).not.toBe('hidden');

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
  }
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
});
