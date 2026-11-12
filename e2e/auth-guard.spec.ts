import { test, expect } from './support/errorCollector';

// The dev and preview servers answer /api/auth/get-session with a signed-in
// learner unless this cookie is set (see e2e/support/authStubPlugin.ts).
test.describe('required sign-in', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    await context.addCookies([{ name: 'ordboj-e2e-auth', value: 'anonymous', url: baseURL }]);
  });

  test('an empty session leaves practice for sign-in, and public pages stay open', async ({
    page,
  }) => {
    await page.goto('/practice');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Support LÖSEV/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /apple/i })).toHaveCount(0);
    await expect(page.getByText('Email sign-in is not available yet.')).toBeVisible();

    await page.goto('/review');
    await expect(page).toHaveURL(/\/sign-in/);

    await page.goto('/sign-in');
    const privacy = page.getByRole('link', { name: 'Privacy', exact: true });
    await expect(privacy).toHaveAttribute('href', '/privacy');
    await privacy.click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page).toHaveTitle('Privacy — Ordböj');
    await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
    await expect(page.locator('#root')).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(0);
    await expect(
      page.getByText(
        'When you sign in, Ordböj stores the IP address and the user agent with the sign-in session for up to 7 days.',
      ),
    ).toBeVisible();
  });

  test('offline and signed out tells the learner to connect, and practice stays closed', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    });
    await page.goto('/practice');
    await expect(page.getByRole('heading', { name: 'Connect to sign in' })).toBeVisible();
    await expect(page.getByText('Connect to the internet to sign in.')).toBeVisible();
    await expect(page.getByPlaceholder('Type your answer...')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Start Practice/ })).toHaveCount(0);
  });
});
