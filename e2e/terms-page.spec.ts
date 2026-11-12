import { test, expect } from './support/errorCollector';

// /terms is static HTML from the Pages Function. The sign-in screen links
// here with a plain anchor. The homepage footer does not: that link ships
// from main, separately from this login UI.

test.describe('terms of use', () => {
  test('the homepage does not link to terms', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /terms/i })).toHaveCount(0);
  });

  test('GET /terms is the terms page when JavaScript is off', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    const response = await page.goto('/terms');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(page.getByRole('heading', { name: 'Terms of Use', exact: true })).toBeVisible();
    await expect(
      page.getByText('Ordböj is a free site for practicing Swedish verbs.'),
    ).toBeVisible();
    await expect(
      page.getByText('To use the site, you must sign in. We currently offer sign-in with Google.'),
    ).toBeVisible();
    await expect(
      page.getByText(
        'You may use Ordböj for your own learning. Do not misuse the service, try to break it, or harm other users.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('The service is provided as is. We may change or stop it.'),
    ).toBeVisible();
    await expect(page.getByText('These terms are governed by the laws of Sweden.')).toBeVisible();
    await expect(
      page.getByText('If we change these terms, we will update this page.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await expect(page.getByRole('link', { name: 'Back to Ordböj' })).toHaveAttribute('href', '/');
    await expect(page.getByText(/needs JavaScript/i)).toHaveCount(0);
    await expect(page.locator('#root')).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(0);
    await context.close();
  });
});
