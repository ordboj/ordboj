import fs from 'node:fs';
import { test, expect } from './support/errorCollector';
import { buildSingleDueSeed, toV3Envelope, SRS_STORAGE_KEY } from './support/seed';

// Export -> new device -> import is the only recovery path CLAUDE.md's
// "user progress is irreplaceable" fact has: no backend, no accounts, one
// browser's localStorage. This walks the real thing end to end: a real
// answer recorded through the UI (not just fixture JSON, so the exported
// file reflects an actual session), a real `download` event, a full storage
// wipe standing in for "new device", and a real OS file-chooser import.
//
// It also targets the #104 regression class directly (see
// src/hooks/useSettings.ts, "The store" and Settings.tsx's handleImport
// comment): importing writes the settings store straight to localStorage
// and *must* call reloadSettingsFromStorage so the still-mounted Settings
// screen re-reads it — otherwise the screen keeps showing pre-import values,
// and the next preference change spreads over that stale in-memory
// snapshot and silently reverts every field the import just restored. This
// spec proves both halves: the restored value renders immediately (no
// reload), and it survives one more unrelated setting change afterward.
const ITEM_ID = 'vara-presens'; // vara, presens = "är"
const ANSWER = 'är';
const VERB = 'vara';

test.describe('backup round trip: export -> new device -> import', () => {
  test('an exported backup restores both progress and settings on a wiped store, without a stale-snapshot clobber', async ({
    page,
  }) => {
    const seed = await buildSingleDueSeed(ITEM_ID);
    // Deliberately NOT `context.addInitScript`: this test wipes storage
    // mid-run to simulate a new device, and an init script re-runs before
    // *every* navigation in this context — including the reload right after
    // that wipe — which would silently resurrect the pre-wipe seed and
    // defeat the "new device" premise. A one-shot `evaluate` + `reload`
    // seeds the very first mount only.
    await page.goto('/');
    await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
      SRS_STORAGE_KEY,
      toV3Envelope(seed),
    ] as [string, string]);
    await page.reload();

    // Answer the seeded card through the real UI, so the export below
    // carries a genuine reviewed item, not fixture JSON asserting its own
    // premise.
    await page.getByRole('button', { name: /Start Practice/ }).click();
    await expect(page).toHaveURL(/\/practice$/);
    const answerInput = page.getByPlaceholder('Type your answer...');
    await expect(answerInput).toBeVisible();
    await answerInput.pressSequentially(ANSWER);
    await page.getByRole('button', { name: 'Check Answer' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: 'Next Card' }).click();
    await expect(page.getByText('Great Work!', { exact: false })).toBeVisible();

    // The answer write is coalesced (src/lib/storage.ts, ~500ms window,
    // flushed on pagehide/visibilitychange). Force the flush instead of
    // racing the debounce timer before navigating away — otherwise the
    // Settings page's freshly-mounted useSrsProgress instance can load
    // localStorage before the just-answered item lands in it, and both the
    // export below and the later Progress assertion would silently read the
    // pre-answer state instead of proving anything about a real review.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

    // A distinguishable, non-default setting to check the settings side of
    // the restore: multiple-choice is not DEFAULT_SETTINGS.practiceMode.
    await page.goto('/settings');
    await page.getByLabel('Practice Mode').click();
    await page.getByRole('option', { name: 'Multiple Choice' }).click();
    await expect(page.getByRole('combobox', { name: 'Practice Mode' })).toHaveText(
      'Multiple Choice',
    );

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Progress' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const backupContent = fs.readFileSync(downloadPath as string, 'utf-8');
    const backupJson = JSON.parse(backupContent);
    // Sanity on the file itself before trusting it as the test's fixture:
    // the whole-app envelope (src/lib/backup.ts) carries the schedule at the
    // top level and the settings store under `stores`.
    expect(backupJson.app).toBe('ordboj');
    // decodeStoreValue (src/lib/backup.ts) stores a parseable value as
    // parsed JSON, not a re-stringified string, so the settings store's
    // envelope is already an object here.
    expect(backupJson.stores['swedish-verbs-settings'].settings.practiceMode).toBe(
      'multiple-choice',
    );

    // "New device": wipe storage entirely, then reload so every hook
    // re-initializes from nothing, the same as a first run.
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Practice Mode' })).toHaveText('Typing');

    // Real OS file-chooser import, not a programmatic call into the hook:
    // Settings.tsx's handleImport builds a detached <input type="file">
    // and calls .click() on it, which still raises a real filechooser event.
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import Progress' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'ordboj-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backupContent),
    });
    await expect(page.getByText('Progress imported successfully!')).toBeVisible();

    // Settings restored, rendered immediately with no reload — the exact
    // gap reloadSettingsFromStorage exists to close.
    await expect(page.getByRole('combobox', { name: 'Practice Mode' })).toHaveText(
      'Multiple Choice',
    );

    // #104 regression class: change an unrelated setting now, on the same
    // still-mounted Settings screen. If the in-memory settings snapshot
    // were still the stale pre-import one, this write would spread over it
    // and silently revert Practice Mode back to the default.
    await page.getByLabel('Show example sentences').click();
    await expect(page.getByRole('combobox', { name: 'Practice Mode' })).toHaveText(
      'Multiple Choice',
    );
    // The unrelated toggle itself did take effect, proving this is a real
    // write and not a no-op that would trivially "pass" the assertion above.
    await expect(page.getByLabel('Show example sentences')).toBeChecked();

    // Progress restored too: the answered item's repetitions survived the
    // wipe, read through the real Progress page rather than localStorage
    // directly.
    await page.goto('/progress');
    await page.getByPlaceholder('Search by verb...').fill(VERB);
    await page.getByRole('button', { name: new RegExp(`^${VERB}\\b`) }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const repetitionLines = dialog.locator('p', { hasText: /^Repetitions:/ });
    await expect(repetitionLines.first()).toHaveText('Repetitions: 1');
  });
});
