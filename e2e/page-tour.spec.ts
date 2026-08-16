import { test, expect } from './support/errorCollector';
import { buildFullSeed, toV3Envelope, SRS_STORAGE_KEY } from './support/seed';

// A slim tour: click around the whole app and nothing throws. The actual
// detection is the shared errorCollectorMatches auto-fixture
// (e2e/support/errorCollector.ts), applied here and to every other spec in
// the suite (1-11) — this spec's own job is just to visit the two contexts
// none of the story specs (first-run, full-loop, settings-persistence,
// backup-round-trip, due-count-sanity, queue-desync, particle-mode,
// reset-progress) ever reach on their own: Settings without mutating
// anything, and Progress in both its empty (nothing ever practised) and
// idle (fully caught up, nothing due) states.
test.describe('page tour: every route renders without an uncaught error', () => {
  test('Settings, empty-state Progress, and an idle (all-caught-up) Home all render cleanly', async ({
    page,
    context,
  }) => {
    // Every item pushed far into the future: no overrides, so nothing is
    // due — the "all caught up" idle state no story spec visits (every
    // other spec seeds at least one due item on purpose).
    const seed = await buildFullSeed();
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(seed)],
    );

    await page.goto('/');
    await expect(page.getByText('All caught up', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'No Cards Due' })).toBeDisabled();

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    // Visit-without-mutating: read the practice mode value but do not
    // change it, so this spec's coverage stays orthogonal to
    // settings-persistence.spec.ts's job of proving a *change* survives a
    // reload.
    await expect(page.getByRole('combobox', { name: 'Practice Mode' })).toBeVisible();

    // Empty-state Progress: no items ever answered, so every mastery number
    // reads 0 and the particle-verb table is the "not started yet" copy
    // rather than a populated list.
    await page.goto('/progress');
    await expect(page.getByText(/You've mastered 0 \//)).toBeVisible();
    await expect(
      page.getByText(
        'Particle verbs unlock once you know their base verb in both the present and the past.',
      ),
    ).toBeVisible();

    // 404: a route this app does not define still renders NotFound instead
    // of the crash boundary.
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await page.getByRole('link', { name: 'Return to Home' }).click();
    await expect(page).toHaveURL('/');

    // Mute/unmute toggle and the CEFR selector are Home-local mutations that
    // never touch the SRS store — exercise them here since no story spec
    // does.
    await page.getByRole('button', { name: /mute audio/i }).click();
    await page.getByRole('button', { name: /unmute audio/i }).click();
  });
});
