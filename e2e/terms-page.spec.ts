import { test, expect } from './support/errorCollector';

// /terms must be in the HTTP response itself. The SPA rewrite serves
// index.html for unknown paths, and that shell needs JavaScript.

test.describe('terms of use', () => {
  test('the homepage links to /terms and still describes the product', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ordböj', exact: true })).toBeVisible();
    await expect(page.getByText('Master Swedish verbs with spaced repetition')).toBeVisible();

    const privacy = page.getByRole('link', { name: 'Privacy', exact: true });
    const link = page.getByRole('link', { name: 'Terms', exact: true });
    await expect(privacy).toBeVisible();
    await expect(privacy).toHaveAttribute('href', '/privacy');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/terms');
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await link.click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page).toHaveTitle('Terms of Use — Ordböj');
    await expect(page.getByRole('heading', { name: 'Terms of Use', exact: true })).toBeVisible();
    await expect(
      page.getByText('Ordböj is a free site for practicing Swedish verbs.'),
    ).toBeVisible();
    await expect(page.getByText('To use the site, you must sign in.')).toBeVisible();
    await expect(page.locator('#root')).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(0);
  });

  test('GET /terms is the terms when JavaScript is off', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    const response = await page.goto('/terms');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(page.getByRole('heading', { name: 'Terms of Use', exact: true })).toBeVisible();
    await expect(
      page.getByText('Ordböj is a free site for practicing Swedish verbs.'),
    ).toBeVisible();
    await expect(page).toHaveTitle('Terms of Use — Ordböj');
    await expect(page.getByText('To use the site, you must sign in.')).toBeVisible();
    await expect(page.getByText('We currently offer sign-in with Google.')).toBeVisible();
    await expect(page.getByText(/Do not misuse the service/)).toBeVisible();
    await expect(page.getByText('The service is provided as is.')).toBeVisible();
    await expect(page.getByText('These terms are governed by the laws of Sweden.')).toBeVisible();
    await expect(
      page.getByText('If we change these terms, we will update this page.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await expect(page.getByRole('link', { name: 'Back to Ordböj' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await expect(page.getByText(/needs JavaScript/i)).toHaveCount(0);
    await expect(page.locator('#root')).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(0);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(0);
    await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(0);
    await context.close();
  });
});
