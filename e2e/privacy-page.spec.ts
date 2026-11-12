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
    await expect(page).toHaveTitle('Privacy — Ordböj');
    await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
    await expect(page.getByText('Ordböj does not sell this data.')).toBeVisible();
    await expect(page.locator('#root')).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(0);
  });

  test('GET /privacy is the policy when JavaScript is off', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    const response = await page.goto('/privacy');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(page).toHaveTitle('Privacy — Ordböj');
    await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
    await expect(page.getByText(/email address and basic profile/i)).toBeVisible();
    await expect(page.getByText(/openid/i)).toBeVisible();
    await expect(page.getByText(/sign-in cookie/i)).toBeVisible();
    await expect(page.getByText(/Practice progress is stored in this browser/i)).toBeVisible();
    await expect(
      page.getByText(
        'After you sign in, Ordböj stores practice events in a first-party database in the EU.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('Ordböj keeps these events for 13 months and then deletes them.'),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Ordböj ties these events to an internal account id, not to your email address.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText("The legal basis is Ordböj's legitimate interest in improving the trainer."),
    ).toBeVisible();
    await expect(
      page.getByText('You can object in Settings. Turn off Store practice events.'),
    ).toBeVisible();
    await expect(
      page.getByText(
        "These events are stored on Ordböj's servers, not as cookies in your browser.",
      ),
    ).toBeVisible();
    await expect(page.getByText('This is not a consent banner.')).toHaveCount(0);
    await expect(page.getByText('Practice events are not cookies.')).toHaveCount(0);
    await expect(
      page.getByText(
        'When you sign in, Ordböj stores the IP address and the user agent with the sign-in session for up to 7 days.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText('A visit after the first day can extend that session by another 7 days.'),
    ).toBeVisible();
    await expect(page.getByText(/Cloudflare Web Analytics/)).toBeVisible();
    await expect(
      page.getByText(/does not use cookies, including advertising cookies/),
    ).toBeVisible();
    await expect(
      page.getByText(/does not fingerprint you by IP address or user agent/),
    ).toBeVisible();
    await expect(page.getByText(/Cloudflare D1/i)).toHaveCount(0);
    await expect(page.getByText('Ordböj does not sell this data.')).toBeVisible();
    await expect(page.getByText(/needs JavaScript/i)).toHaveCount(0);
    await expect(page.locator('#root')).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(0);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(0);
    await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(0);
    await context.close();
  });
});
