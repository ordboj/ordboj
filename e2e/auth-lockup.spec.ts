import type { Page } from '@playwright/test';
import { test, expect } from './support/errorCollector';

// ORD-148: the shared auth header shows the official mark above the live
// wordmark, and the first-ship sign-in screen (Google only, cookie notice
// open) keeps the Google pill and the cookie OK inside 360×640.

const VIEWPORT = { width: 360, height: 640 };

test.describe('ORD-148 auth lockup', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    await context.addCookies([{ name: 'ordboj-e2e-auth', value: 'anonymous', url: baseURL }]);
  });

  test('sign-in, offline, and verify show the logo above the live wordmark', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expectLockup(page);

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    });
    await page.goto('/practice');
    await expect(page.getByRole('heading', { name: 'Connect to sign in' })).toBeVisible();
    await expectLockup(page);

    await page.goto('/verify-email');
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expectLockup(page);
  });

  test('at 360×640 the Google pill and the cookie OK are fully visible', async ({ page }) => {
    await page.route('**/api/auth-config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          oauth: { google: true, github: false, microsoft: false },
          mail: false,
        }),
      });
    });

    await page.goto('/sign-in');
    expect(page.viewportSize()).toEqual(VIEWPORT);
    await expect(page.getByText('Loading…')).toHaveCount(0);
    await expect(page.getByText('Email sign-in is not available yet.')).toHaveCount(0);
    await expect(page.getByLabel('Email')).toHaveCount(0);

    const google = page.getByRole('button', { name: 'Sign in with Google' });
    const ok = page.getByRole('button', { name: 'OK' });
    await expect(google).toBeVisible();
    await expect(ok).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const googleBox = await google.boundingBox();
    const okBox = await ok.boundingBox();
    expect(googleBox).not.toBeNull();
    expect(okBox).not.toBeNull();
    expect(insideViewport(googleBox!)).toBe(true);
    expect(insideViewport(okBox!)).toBe(true);
  });
});

function insideViewport(box: { x: number; y: number; width: number; height: number }) {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= VIEWPORT.width + 0.5 &&
    box.y + box.height <= VIEWPORT.height + 0.5
  );
}

async function expectLockup(page: Page) {
  const logo = page.locator('img[src="/favicon.svg"]');
  const wordmark = page.locator('p.text-4xl.font-bold.text-primary');
  await expect(logo).toBeVisible();
  await expect(wordmark).toHaveText('Ordböj');
  await expect(logo).toHaveAttribute('alt', '');
  await expect(logo).toHaveAttribute('aria-hidden', 'true');
  await expect(logo).toHaveAttribute('width', '64');
  await expect(logo).toHaveAttribute('height', '64');
  await expect(logo).toHaveClass(/size-16/);
  await expect(logo).toHaveClass(/rounded-2xl/);
  await expect(logo).not.toHaveClass(/rounded-full/);
  await expect(logo).not.toHaveClass(/shadow/);

  const loaded = await logo.evaluate(
    (element: HTMLImageElement) => element.complete && element.naturalWidth > 0,
  );
  expect(loaded).toBe(true);
  const radius = await logo.evaluate((element) => getComputedStyle(element).borderRadius);
  const shadow = await logo.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(radius).toBe('16px');
  expect(shadow).toBe('none');

  const logoBox = await logo.boundingBox();
  const wordBox = await wordmark.boundingBox();
  expect(logoBox).not.toBeNull();
  expect(wordBox).not.toBeNull();
  expect(logoBox!.width).toBeGreaterThanOrEqual(63);
  expect(logoBox!.width).toBeLessThanOrEqual(65);
  expect(logoBox!.height).toBeGreaterThanOrEqual(63);
  expect(logoBox!.height).toBeLessThanOrEqual(65);
  expect(wordBox!.y - (logoBox!.y + logoBox!.height)).toBeGreaterThanOrEqual(11);
  expect(wordBox!.y - (logoBox!.y + logoBox!.height)).toBeLessThanOrEqual(13);

  const card = page.locator('div.rounded-lg.border').first();
  await expect(card.locator('img[src="/favicon.svg"]')).toHaveCount(0);
  await expect(wordmark).toHaveCount(1);
}
