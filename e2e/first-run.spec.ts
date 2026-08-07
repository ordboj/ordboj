import { test, expect } from '@playwright/test';

// First-run user: empty localStorage (Playwright gives every test its own
// clean browser context, so no seeding needed here — this *is* the "brand
// new install" state). Verifies Home reports the un-reviewed deck as due,
// Practice renders a real card, and typing a Swedish answer (å ä ö) round-
// trips through submit -> feedback without caring which of the ~150 due
// items the shuffle happens to serve first.
test.describe('first-run user', () => {
  test('sees cards due, starts practice, and gets feedback on a typed answer', async ({ page }) => {
    await page.goto('/');

    // Zero progress on a fresh install still means every item is due
    // (initializeSrsState sets dueAt = now), so Home should never show
    // "All caught up" on first run.
    await expect(page.getByText('All caught up', { exact: false })).toHaveCount(0);
    await expect(page.getByText(/conjugations due for review/)).toBeVisible();

    const startButton = page.getByRole('button', { name: /Start Practice/ });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await expect(page).toHaveURL(/\/practice$/);

    // Wait for the real card to replace the "Loading..." placeholder.
    const answerInput = page.getByPlaceholder('Type your answer...');
    await expect(answerInput).toBeVisible();

    // Swedish special characters typed as a user would, via the keyboard —
    // not programmatic value assignment — so this exercises actual input
    // events, not just React state being poked from outside.
    await answerInput.pressSequentially('åäö-fel-svar');
    await page.getByRole('button', { name: 'Check Answer' }).click();

    // This nonsense string is not a valid conjugation for any verb in
    // VERB_DATA, so feedback must be the "wrong" branch — proving the
    // submit -> grade -> feedback pipeline actually ran.
    await expect(page.getByText('Not quite')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next Card' })).toBeVisible();
  });
});
