import { test, expect } from './support/errorCollector';
import { SRS_STORAGE_KEY } from './support/seed';

// The cheapest high-value case in the catalog: a learner's SRS store gets
// corrupted (a failed write, a hand-edit, a bug in an older build) and the
// app must still render instead of white-screening — the worst learner-
// facing failure mode CLAUDE.md's "user progress is irreplaceable" fact
// implies (a corrupt store plus a crash on top would leave a learner with
// no way to even see the export button and rescue what's left). Unit-level
// coverage already exists for the parse path (useSrsProgress.test.ts); this
// is the "does a real page actually boot against this exact on-disk bytes"
// case malformed JSON at the SRS key represents, the same class of value
// legacy-migration-boot.spec.ts exercises for a different bad shape.
test.describe('malformed SRS storage does not white-screen the app', () => {
  test('invalid JSON at the SRS key: the app still boots and renders Home', async ({
    page,
    context,
  }) => {
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, '{ this is not valid JSON'],
    );

    await page.goto('/');

    // A real render, not a blank page or the app-crash fallback: the due
    // count is a genuine number (parseStoredProgress swallows the parse
    // error and falls back to an empty store, so every item is due, same as
    // first-run), and the practice entry point works.
    await expect(page.getByText(/conjugations due for review/)).toBeVisible();
    const startButton = page.getByRole('button', { name: /Start Practice/ });
    await expect(startButton).toBeEnabled();
    await startButton.click();
    await expect(page).toHaveURL(/\/practice$/);
    await expect(page.getByPlaceholder('Type your answer...')).toBeVisible();
  });

  test('an SRS value that is valid JSON but not an object (a bare number) also still boots', async ({
    page,
    context,
  }) => {
    // parseStoredProgress's `!parsed || typeof parsed !== 'object'` guard:
    // valid JSON, wrong shape entirely, distinct from a parse failure.
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, '42'],
    );

    await page.goto('/');
    await expect(page.getByText(/conjugations due for review/)).toBeVisible();
  });
});
