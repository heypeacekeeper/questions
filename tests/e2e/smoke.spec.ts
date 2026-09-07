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
  expect(displayCount).toBe('2,438 votes');

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
