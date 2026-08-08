import { test, expect } from '@playwright/test';
import { buildSingleDueSeed, SRS_STORAGE_KEY } from './support/seed';

// Full loop: answer a card -> Progress reflects the review.
//
// Seeded to exactly one due item so the assertion doesn't depend on which
// card the shuffle serves first, and sidesteps the known queue-desync bug
// (#15, see queue-desync-bug-15.spec.ts) which only triggers with 2+ due
// items in the same session.
const ITEM_ID = '1-presens'; // VERB_DATA[0] = vara, presens = "är"
const VERB = 'vara';
const ANSWER = 'är';

test.describe('full loop: practice -> progress', () => {
  test("answering a card updates that verb's repetitions on the Progress page", async ({
    page,
    context,
  }) => {
    const seed = await buildSingleDueSeed(ITEM_ID);
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, JSON.stringify(seed)],
    );

    await page.goto('/');
    await expect(page.getByText('1 conjugations due for review')).toBeVisible();
    await page.getByRole('button', { name: /Start Practice/ }).click();

    await expect(page).toHaveURL(/\/practice$/);
    const answerInput = page.getByPlaceholder('Type your answer...');
    await expect(answerInput).toBeVisible();

    // Typing the correct answer auto-submits (PracticeCard's own effect),
    // so no explicit "Check Answer" click is needed here.
    await answerInput.pressSequentially(ANSWER);
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: 'Next Card' }).click();

    // Only one item was due, so the session ends immediately.
    await expect(page.getByText('Great Work!', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL('/');

    await page.getByText('Progress', { exact: true }).click();
    await expect(page).toHaveURL(/\/progress$/);

    await page.getByPlaceholder('Search by verb...').fill(VERB);
    // Both projects in playwright.config.ts run at the 360x640 mobile
    // viewport, where the Progress page hides its <table> (`hidden
    // sm:block`, #113) in favor of a card list below sm. The desktop table
    // row stays in the DOM but not visible/clickable at this width, so this
    // opens the modal via the mobile card (role="button", same click
    // semantics) rather than the table row.
    await page.getByRole('button', { name: new RegExp(`^${VERB}\\b`) }).click();

    // The modal shows per-form SRS detail, in the fixed order
    // [presens, preteritum, supinum, imperativ] (VerbDetailsModal.tsx), so
    // the first "Repetitions:" line is presens — the form we actually
    // answered — and must read 1. This is a sharper assertion than the
    // aggregated table badge, which averages across all 4 forms and would
    // still read "New" after a single review.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const repetitionLines = dialog.locator('p', { hasText: /^Repetitions:/ });
    await expect(repetitionLines).toHaveCount(4);
    await expect(repetitionLines.first()).toHaveText('Repetitions: 1');
    await expect(repetitionLines.nth(1)).toHaveText('Repetitions: 0');
  });
});
