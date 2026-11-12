import { test, expect } from './support/errorCollector';

// Google's OAuth review fetches https://ordboj.com/privacy. The live homepage
// is the trainer. The policy has to be in the HTTP response itself: the SPA
// rewrite currently serves index.html, whose only no-JavaScript text is the
// "needs JavaScript" notice.

test.describe('privacy policy', () => {
  test('the homepage links to /privacy', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Privacy', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/privacy');
    await link.click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
    await expect(page.getByText('Ordböj does not sell this data.')).toBeVisible();
  });

  test('GET /privacy is the policy when JavaScript is off', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    const response = await page.goto('/privacy');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
    await expect(page.getByText(/email address and basic profile/i)).toBeVisible();
    await expect(page.getByText(/openid/i)).toBeVisible();
    await expect(page.getByText(/sign-in cookie/i)).toBeVisible();
    await expect(page.getByText(/Practice progress is stored in this browser/i)).toBeVisible();
    await expect(page.getByText(/Cloudflare D1/i)).toHaveCount(0);
    await expect(page.getByText('Ordböj does not sell this data.')).toBeVisible();
    await expect(page.getByText(/needs JavaScript/i)).toHaveCount(0);
    await expect(page.locator('#root')).toHaveCount(0);
    await context.close();
  });
});
