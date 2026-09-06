import { expect, test } from '@playwright/test';

async function prepare(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('wyr_consent', JSON.stringify({ analytics: false, updatedAt: Date.now() }));
  });
}

test('home page visual', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.locator('main').waitFor();
  await expect(page).toHaveScreenshot('home.png', { fullPage: true });
});

test('category page visual', async ({ page }) => {
  await prepare(page);
  await page.goto('/funny-would-you-rather-questions/');
  await page.locator('main h1').waitFor();
  await expect(page).toHaveScreenshot('category-funny.png', { fullPage: true });
});

test('game result visual', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.locator('#choice-a').click();
  await expect(page.locator('#game-stage')).toHaveClass(/voted/);
  await expect(page.locator('#game-shell')).toHaveScreenshot('game-result.png');
});
