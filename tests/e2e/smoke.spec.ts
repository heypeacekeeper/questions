import { expect, test } from '@playwright/test';

const categoryId = '11111111-1111-4111-8111-000000000001';
const turnstileToken = 'test-turnstile-token-value';

test.beforeEach(async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
});

test('home game, pack picker, navigation, and metadata work', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Would You Rather Questions/);
  await expect(page.locator('main h1').first()).toContainText('Would You Rather Questions');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /wouldyouratherquestions\.org\/$/);
  await expect(page.locator('#choice-a')).toBeVisible();

  await page.locator('#pack-button').click();
  await expect(page.locator('#pack-dialog')).toBeVisible();
  await page.locator('#close-pack-dialog').click();

  await page.locator('#choice-a').click();
  await expect(page.locator('#game-stage')).toHaveClass(/voted/);
  await expect(page.locator('#percent-a')).toContainText('%');
  await page.locator('#next-button').click();
  await expect(page.locator('#game-stage')).not.toHaveClass(/voted/);

  await page.goto('/categories/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Categories');
  const categoryLink = page.locator('a[href="/funny-would-you-rather-questions/"]').first();
  await expect(categoryLink).toBeVisible();
  await categoryLink.click();
  await expect(page).toHaveURL(/funny-would-you-rather-questions\/$/);
  await expect(page.locator('h1')).toContainText('Funny');
});

test('API methods, vote cookie, contact, and submission flows work', async ({ page }, testInfo) => {
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  const questionId = await page.locator('#game-stage').getAttribute('data-question-id');
  expect(questionId).toBeTruthy();

  const vote = await page.request.post('/api/vote/', {
    headers: { origin },
    data: { questionId, choice: 'A' },
  });
  expect(vote.status()).toBe(200);
  expect((await vote.json()).result.accepted).toBe(true);
  expect(vote.headers()['set-cookie']).toContain('wyr_voter=');

  const duplicate = await page.request.post('/api/vote/', {
    headers: { origin },
    data: { questionId, choice: 'B' },
  });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).result.accepted).toBe(false);

  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '-');
  const contact = await page.request.post('/api/contact/', {
    headers: { origin },
    data: {
      name: 'Smoke Test', email: `smoke-${suffix}@example.com`, subject: `E2E contact ${suffix}`,
      message: 'This is a browser-flow smoke test message.', privacy: true,
      website: '', renderedAt: Date.now() - 5_000, turnstileToken,
    },
  });
  expect(contact.status()).toBe(200);
  expect((await contact.json()).ok).toBe(true);

  const submission = await page.request.post('/api/submit-question/', {
    headers: { origin },
    data: {
      optionA: `pilot a balloon ${suffix}`, optionB: `captain a submarine ${suffix}`, categoryId,
      name: '', email: '', agree: true, website: '', renderedAt: Date.now() - 5_000, turnstileToken,
    },
  });
  expect(submission.status()).toBe(200);
  expect((await submission.json()).ok).toBe(true);

  const getVote = await page.request.get('/api/vote/');
  expect([404, 405]).toContain(getVote.status());
});

test('support pages and 404 render without blank states', async ({ page }) => {
  for (const path of ['/contact-us/', '/submit-a-question/', '/privacy-policy/', '/terms-and-conditions/']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  }
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
});
