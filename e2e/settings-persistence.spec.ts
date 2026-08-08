import { test, expect } from '@playwright/test';
import { buildSingleDueSeed, SRS_STORAGE_KEY } from './support/seed';

// Settings: switching to multiple-choice mode survives a reload, and
// Practice actually renders that mode afterwards — proving the setting
// round-trips through localStorage, not just React state in one tab.
const ITEM_ID = 'vara-presens'; // vara, presens = "är"

test.describe('settings persist across reload', () => {
  test('multiple-choice mode survives a reload and Practice uses it', async ({ page, context }) => {
    const seed = await buildSingleDueSeed(ITEM_ID);
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, JSON.stringify(seed)],
    );

    await page.goto('/settings');
    await page.getByLabel('Practice Mode').click();
    await page.getByRole('option', { name: 'Multiple Choice' }).click();

    // Full reload, not SPA navigation: this is the only way to prove the
    // setting was actually written to localStorage and re-read on boot,
    // rather than merely held in the still-mounted component's state.
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Practice Mode' })).toHaveText(
      'Multiple Choice',
    );

    await page.goto('/practice');

    // Typing mode's input must not be present, and the correct answer
    // ("är") must appear as one of the four option buttons.
    await expect(page.getByPlaceholder('Type your answer...')).toHaveCount(0);
    const correctOption = page.getByRole('button', { name: 'är', exact: true });
    await expect(correctOption).toBeVisible();

    await correctOption.click();
    await expect(page.getByText('Correct!')).toBeVisible();
  });
});
