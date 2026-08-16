import { test, expect } from './support/errorCollector';
import { buildFullSeed, toV3Envelope, SRS_STORAGE_KEY } from './support/seed';

// Settings' "Reset All Progress" is a real, destructive, one-shot action on
// the learner's only copy of their progress (CLAUDE.md: "irreplaceable").
// This spec is deliberately not about exporting first — that's
// backup-round-trip.spec.ts's job — only about the gate (cancel really does
// nothing, confirm really wipes) and about the wipe surviving a reload, so
// the assertion is against what actually persisted, not merely in-memory
// React state that a stale tab could still be showing.
const ITEM_ID = 'vara-presens'; // vara, presens = "är"
const LEGACY_BACKUP_KEY = 'swedish-verbs-srs-progress-backup-pre-v3';

test.describe('Reset All Progress', () => {
  test('Cancel leaves progress untouched', async ({ page, context }) => {
    const seed = await buildFullSeed({ [ITEM_ID]: { dueAt: Date.now() } });
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, toV3Envelope(seed)],
    );

    await page.goto('/settings');
    await page.getByRole('button', { name: /reset all progress/i }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();

    // Still the one due item this test seeded — cancel touched nothing.
    await page.goto('/');
    await expect(page.getByText('1 conjugations due for review')).toBeVisible();
  });

  test('Confirm wipes progress, and a reload afterward proves it was actually persisted', async ({
    page,
  }) => {
    const seed = await buildFullSeed({ [ITEM_ID]: { dueAt: Date.now() } });
    // Deliberately NOT `context.addInitScript` here: that script re-runs
    // before *every* navigation this context makes, which would silently
    // resurrect the seeded (pre-reset) SRS store on the reload below and
    // make this whole test vacuous. A one-shot `evaluate` + single `reload`
    // seeds the very first mount only, exactly like every other spec's
    // addInitScript does for their single mount, but without an ongoing
    // side effect that would fight this test's later wipe/reset/reload
    // sequence.
    //
    // The v3 envelope (determinism rule 2: every spec but
    // legacy-migration-boot.spec.ts seeds the current shape) plus a
    // directly-seeded LEGACY_BACKUP_KEY, simulating an install that already
    // carries the one-shot pre-v3 backup from an earlier migration. This
    // isolates what this test actually checks — reset deletes that key too
    // (PR #311, "reset means reset": it is a migration safety net, not a
    // second undo history) — from how the key came to exist, which is
    // useSrsProgress.test.ts's and legacy-migration-boot.spec.ts's concern.
    await page.goto('/settings');
    await page.evaluate(
      ([srsKey, srsValue, backupKey, backupValue]) => {
        window.localStorage.setItem(srsKey, srsValue);
        window.localStorage.setItem(backupKey, backupValue);
      },
      [
        SRS_STORAGE_KEY,
        toV3Envelope(seed),
        LEGACY_BACKUP_KEY,
        JSON.stringify({ '1-presens': { repetitions: 3, easeFactor: 2.5 } }),
      ] as [string, string, string, string],
    );
    await page.reload();

    const backupBeforeReset = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      LEGACY_BACKUP_KEY,
    );
    expect(backupBeforeReset).not.toBeNull();

    await page.getByRole('button', { name: /reset all progress/i }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    // The AlertDialogAction inside the dialog, distinct from the trigger
    // button of the same accessible name that opened it.
    await dialog.getByRole('button', { name: /^reset all progress$/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('All progress has been reset')).toBeVisible();

    // A fresh install: every item is due again (nothing scheduled means
    // "due now"), and the pre-v3 backup key is gone too. Read only after a
    // real navigation to Home *and* a hard reload there, so this proves the
    // wipe was written to disk, not only applied to the in-memory session
    // that just called resetProgress.
    await page.goto('/');
    await page.reload();
    await expect(page.getByText(/conjugations due for review/)).toBeVisible();
    // Same fresh-install count first-run.spec.ts asserts for a genuinely
    // empty context: after reset the app must look identical to that state,
    // not merely "not due for review".
    await expect(page.getByText('All caught up', { exact: false })).toHaveCount(0);

    const backupAfterReload = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      LEGACY_BACKUP_KEY,
    );
    expect(backupAfterReload).toBeNull();
  });
});
