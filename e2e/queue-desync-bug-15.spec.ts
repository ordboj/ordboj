import { test, expect } from '@playwright/test';
import { buildFullSeed, SRS_STORAGE_KEY } from './support/seed';

// Pins known bug #15: the practice queue resets/reshuffles after every
// answer.
//
// Root cause (Practice.tsx): `getDueItems` is a useCallback depending on
// `srsStates`. Answering a card calls `recordAnswer`, which updates
// `srsStates`, which gives `getDueItems` a new identity, which re-runs the
// `useEffect([isLoading, settingsLoading, getDueItems])` that loads
// `dueItems` — *without* resetting `currentIndex`. With 2 due items:
//   1. dueItems = [A, B], currentIndex = 0.
//   2. Answer A correctly -> recordAnswer pushes A's dueAt into the
//      future -> setCurrentIndex(1) (Practice.tsx's own advance).
//   3. The srsStates change also re-triggers the load effect, which
//      re-fetches due items. A is no longer due, so dueItems = [B]
//      (length 1) -> setDueItems([B]).
//   4. Render: currentIndex is 1, dueItems.length is 1, dueItems[1] is
//      undefined, and `practiceComplete` was never set (items.length !== 0
//      at the time it was checked) -> `if (dueItems.length === 0 ||
//      !dueItems[currentIndex]) return null` -> the *entire* Practice
//      component renders null (no header, no back button, nothing but the
//      toast portal). The user is stuck on a blank page with no card, no
//      completion screen, and no way to answer B.
//
// This test pins the CURRENT broken behavior. It must be rewritten (not
// deleted) the moment #15 is fixed — a fixed Practice.tsx would show
// either card B or the completion screen at this point, and this test
// would then correctly fail as a signal to update it.
const DUE_ITEMS = ['1-presens', '7-imperativ']; // vara/är, göra/gör

test.describe('known bug #15: queue desyncs after answering', () => {
  test('answering the first of two due cards leaves a blank Practice page', async ({
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
    // irrelevant to the bug, only that an answer is recorded.
    await page.getByPlaceholder('Type your answer...').fill('fel');
    await page.getByRole('button', { name: 'Check Answer' }).click();
    await page.getByRole('button', { name: 'Next Card' }).click();

    // Broken: neither a second card nor the completion screen appears, and
    // the whole Practice component — including its own header/back button
    // — has unmounted to nothing. This is a silent content gap, not a
    // crash: no error toast, no console-visible failure to the user, just
    // an empty page. That silence is exactly what makes it dangerous.
    await expect(page.getByPlaceholder('Type your answer...')).toHaveCount(0);
    await expect(page.getByText('Great Work!', { exact: false })).toHaveCount(0);
    await expect(page.getByText(/^\d+ \/ \d+$/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await expect(page.locator('body')).toHaveText('');
  });
});
