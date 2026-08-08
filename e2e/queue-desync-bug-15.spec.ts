import { test, expect } from '@playwright/test';
import { buildFullSeed, SRS_STORAGE_KEY } from './support/seed';

// Regression #103: the practice queue used to reset/reshuffle after every
// answer.
//
// Root cause (Practice.tsx, since fixed): `getDueItems` was a useCallback
// depending on `srsStates`. Answering a card called `recordAnswer`, which
// updated `srsStates`, which gave `getDueItems` a new identity, which
// re-ran the `useEffect([isLoading, settingsLoading, getDueItems])` that
// loaded `dueItems` — *without* resetting `currentIndex`. With 2 due
// items, answering the first card re-fetched a shorter due list mid-session
// while `currentIndex` still pointed past its end, so the whole Practice
// component rendered null: a blank page with no second card and no
// completion screen.
//
// The fix pins the deck at session load via a ref so a fresh `getDueItems`
// identity after each answer no longer reshuffles/truncates `dueItems`
// mid-session. This test asserts the fixed behavior: answering the first
// of two due cards must reveal the second card, and finishing both must
// reach the completion screen.
const DUE_ITEMS = ['1-presens', '7-imperativ']; // vara/är, göra/gör

test.describe('regression #103: queue no longer desyncs after answering', () => {
  test('answering the first of two due cards shows the second card, then completion', async ({
    page,
    context,
  }) => {
    const seed = await buildFullSeed(
      Object.fromEntries(DUE_ITEMS.map((id) => [id, { dueAt: Date.now() }])),
    );
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, JSON.stringify(seed)],
    );

    await page.goto('/practice');
    await expect(page.getByText('1 / 2')).toBeVisible();

    // Answer wrong (grade 0) via "Check Answer" — the outcome is
    // irrelevant to this regression, only that an answer is recorded.
    await page.getByPlaceholder('Type your answer...').fill('fel');
    await page.getByRole('button', { name: 'Check Answer' }).click();
    await page.getByRole('button', { name: 'Next Card' }).click();

    // Fixed: the second card is shown, not a blank page. The header,
    // progress counter and answer input are all still present.
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
    await expect(page.getByText('2 / 2')).toBeVisible();
    const answerInput = page.getByPlaceholder('Type your answer...');
    await expect(answerInput).toBeVisible();
    await expect(answerInput).toHaveCount(1);

    // Completing the second (and last) card reaches the completion screen.
    await answerInput.fill('fel');
    await page.getByRole('button', { name: 'Check Answer' }).click();
    await page.getByRole('button', { name: 'Next Card' }).click();

    await expect(page.getByText('Great Work!', { exact: false })).toBeVisible();
    await expect(page.getByPlaceholder('Type your answer...')).toHaveCount(0);
  });
});
