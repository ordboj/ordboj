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
    const notice = page.getByRole('region', { name: 'Cookie notice' });
    const card = page.locator('div.rounded-lg.border').filter({ has: page.getByRole('heading') });
    await expect(google).toBeVisible();
    await expect(ok).toBeVisible();
    await expect(notice).toBeVisible();
    await expect(card.getByRole('link', { name: 'Privacy', exact: true })).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Terms of Use' })).toBeVisible();
    await expect(notice.getByRole('link')).toHaveCount(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const position = await notice.evaluate((element) => getComputedStyle(element).position);
    expect(position).toBe('fixed');
    await expect(card.locator('[data-testid="ordboj-necessary-cookie-notice"]')).toHaveCount(0);

    const googleBox = await google.boundingBox();
    const okBox = await ok.boundingBox();
    const noticeBox = await notice.boundingBox();
    expect(googleBox).not.toBeNull();
    expect(okBox).not.toBeNull();
    expect(noticeBox).not.toBeNull();
    expect(insideViewport(googleBox!)).toBe(true);
    expect(insideViewport(okBox!)).toBe(true);
    expect(intersects(googleBox!, noticeBox!)).toBe(false);
    expect(VIEWPORT.height - (noticeBox!.y + noticeBox!.height)).toBeGreaterThanOrEqual(15);
    expect(VIEWPORT.height - (noticeBox!.y + noticeBox!.height)).toBeLessThanOrEqual(17);
    expect(noticeBox!.x).toBeGreaterThanOrEqual(15);
    expect(noticeBox!.x).toBeLessThanOrEqual(17);

    const pad = await page
      .locator('.min-h-dvh')
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom));
    const gap = VIEWPORT.height - (noticeBox!.y + noticeBox!.height);
    expect(pad).toBeGreaterThanOrEqual(noticeBox!.height - 0.5);
    expect(Math.abs(pad - (noticeBox!.height + gap))).toBeLessThan(2);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const consent = page.getByText('By signing in, you agree to the');
    const losev = page.getByRole('link', { name: /Support LÖSEV/i });
    const consentBox = await consent.boundingBox();
    const losevBox = await losev.boundingBox();
    const noticeAfterScroll = await notice.boundingBox();
    expect(consentBox).not.toBeNull();
    expect(losevBox).not.toBeNull();
    expect(noticeAfterScroll).not.toBeNull();
    expect(intersects(consentBox!, noticeAfterScroll!)).toBe(false);
    expect(intersects(losevBox!, noticeAfterScroll!)).toBe(false);

    const keysBefore = await page.evaluate(() => Object.keys(localStorage));
    await ok.click();
    await expect(notice).toHaveCount(0);
    const keysAfter = await page.evaluate(() => Object.keys(localStorage));
    expect(keysAfter.filter((key) => !keysBefore.includes(key))).toEqual([
      'ordboj-necessary-cookie-notice',
    ]);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cookie notice' })).toHaveCount(0);
  });
});

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

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
