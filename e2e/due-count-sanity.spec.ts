import { test, expect } from './support/errorCollector';
import { buildFullSeed, toV3Envelope, SRS_STORAGE_KEY } from './support/seed';

// Due-count sanity: with a seeded localStorage blob naming exactly two due
// items, both Home's due-count and Practice's "N / total" header must
// reflect 2 — not "however many items happen to be due", which would let a
// due-date/filtering regression pass unnoticed.
const DUE_ITEMS = ['vara-presens', 'komma-imperativ']; // issue #53: item ids are infinitive-keyed

test.describe('due-count reflects seeded state', () => {
  test('Home and Practice both show exactly the seeded due count', async ({ page, context }) => {
    const seed = await buildFullSeed(
      Object.fromEntries(DUE_ITEMS.map((id) => [id, { dueAt: Date.now() }])),
    );
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(seed)],
    );

    await page.goto('/');
    await expect(page.getByText('2 conjugations due for review')).toBeVisible();

    await page.getByRole('button', { name: /Start Practice/ }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(page.getByText('1 / 2')).toBeVisible();
  });
});

// CEFR extension: `vara` (A1) and `unna` (B2, verbData.ts:67) are due
// together, so the due count must actually reflect the *filtered* deck once
// the learner narrows to A1 only — not just "however many are due" (the test
// above), and not a claim about which verbs appear at A1 (that's
// Home.derivedLevels.test.tsx's job) — only that the same seeded due count
// survives the real Home -> Practice pipeline both before and after the
// level filter changes, and again once it's reverted.
const CEFR_DUE_ITEMS = ['vara-presens', 'unna-presens']; // vara = A1, unna = B2

test.describe('due-count reflects CEFR level narrowing', () => {
  test('narrowing to A1 halves the due count through the real Home -> Practice pipeline, and widening it back restores it', async ({
    page,
    context,
  }) => {
    const seed = await buildFullSeed(
      Object.fromEntries(CEFR_DUE_ITEMS.map((id) => [id, { dueAt: Date.now() }])),
    );
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(seed)],
    );

    await page.goto('/');
    await expect(page.getByText('2 conjugations due for review')).toBeVisible();

    // Narrow to A1 only: uncheck every other level via Home's own CEFR
    // selector (settings persist through useSettings, same store Settings.tsx
    // writes — this is the real pipeline, not a seeded settings blob).
    for (const level of ['A2', 'B1', 'B2', 'C1', 'C2']) {
      await page.getByLabel(level, { exact: true }).uncheck();
    }
    await expect(page.getByText('Selected: A1')).toBeVisible();

    // unna (B2) is filtered out; only vara (A1) remains due.
    await expect(page.getByText('1 conjugations due for review')).toBeVisible();
    await page.getByRole('button', { name: /Start Practice/ }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(page.getByText('1 / 1')).toBeVisible();

    // Widen back to every level: the seeded due count is restored exactly,
    // proving the filter narrows and un-narrows the same underlying set
    // rather than having dropped or duplicated an item along the way.
    await page.goto('/');
    for (const level of ['A2', 'B1', 'B2', 'C1', 'C2']) {
      await page.getByLabel(level, { exact: true }).check();
    }
    await expect(page.getByText('All levels selected')).toBeVisible();
    await expect(page.getByText('2 conjugations due for review')).toBeVisible();
  });
});
