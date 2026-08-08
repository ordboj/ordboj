import { test, expect } from '@playwright/test';
import { buildFullSeed, SRS_STORAGE_KEY } from './support/seed';

// Due-count sanity: with a seeded localStorage blob naming exactly two due
// items, Home's due-count must reflect 2 — not "however many items happen
// to be due", which would let a due-date/filtering regression pass
// unnoticed. Practice's header no longer shows queue position: since issue
// #26 it reads "answeredToday / dailyGoal", which with nothing answered yet
// and no stored settings is 0 / 50 (the doc default).
const DUE_ITEMS = ['1-presens', '7-imperativ']; // vara/är, göra/gör

test.describe('due-count reflects seeded state', () => {
  test('Home and Practice both show exactly the seeded due count', async ({ page, context }) => {
    const seed = await buildFullSeed(
      Object.fromEntries(DUE_ITEMS.map((id) => [id, { dueAt: Date.now() }])),
    );
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, JSON.stringify(seed)],
    );

    await page.goto('/');
    await expect(page.getByText('2 conjugations due for review')).toBeVisible();

    await page.getByRole('button', { name: /Start Practice/ }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(page.getByText('0 / 50')).toBeVisible();
  });
});
