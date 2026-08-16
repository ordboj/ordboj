import { test, expect } from '@playwright/test';
import { buildLegacyV1Seed, SRS_STORAGE_KEY } from './support/seed';

// The one spec allowed to seed the pre-v3 bare-map shape (determinism rule
// 2 / Phase 0 follow-through, see seed.ts's buildLegacyV1Seed doc comment).
// Every other spec seeds the current v3 envelope on purpose, so this is the
// suite's only real-browser coverage of "an install still on the pre-v3
// shape boots and migrates cleanly" — the class of value
// malformed-storage-boot.spec.ts covers for corrupted bytes, applied here to
// a *valid* but old shape instead.
//
// Deliberately does NOT use the shared errorCollector fixture
// (e2e/support/errorCollector.ts): the migration path is expected to log
// (console.error, not console.warn — see migrateConjugationKeys and the
// pre-v3 backup write in useSrsProgress.ts) on inputs this spec seeds on
// purpose, and none of those expected messages are the failure signatures
// that fixture exists to catch, but keeping this spec on the plain
// `@playwright/test` import makes that scoping explicit rather than
// depending on the pattern list happening not to match.
const LEGACY_BACKUP_KEY = 'swedish-verbs-srs-progress-backup-pre-v3';
const ITEM_ID = 'vara-presens'; // vara, presens = "är"
const ANSWER = 'är';

test.describe('legacy (pre-v3) storage boots and migrates', () => {
  test('a bare-map pre-v3 store boots, becomes usable, and is migrated to the v3 envelope on the next write', async ({
    page,
    context,
  }) => {
    const legacy = await buildLegacyV1Seed({ [ITEM_ID]: { dueAt: Date.now() } });
    // The legacy shape itself: no envelope, `itemId` duplicated inside every
    // value — exactly what buildFullSeed/buildSingleDueSeed stopped
    // producing in Phase 0, and exactly what a real pre-#53 install still
    // has on disk.
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SRS_STORAGE_KEY, JSON.stringify(legacy)],
    );

    await page.goto('/');
    // A real boot, not a crash: the seeded due item is visible and usable,
    // proving migrateConjugationKeys + the legacy ease rebase ran without
    // throwing on this exact on-disk shape.
    await expect(page.getByText('1 conjugations due for review')).toBeVisible();

    await page.getByRole('button', { name: /Start Practice/ }).click();
    await expect(page).toHaveURL(/\/practice$/);
    const answerInput = page.getByPlaceholder('Type your answer...');
    await expect(answerInput).toBeVisible();
    await answerInput.pressSequentially(ANSWER);
    await page.getByRole('button', { name: 'Check Answer' }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: 'Next Card' }).click();
    await expect(page.getByText('Great Work!', { exact: false })).toBeVisible();

    // The write is coalesced (src/lib/storage.ts, ~500ms window, flushed on
    // pagehide/visibilitychange) rather than synchronous — force the flush
    // instead of racing the debounce timer, the same technique
    // PracticeParticles.test.tsx uses at the unit level.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

    // The one-shot pre-v3 backup: written once, verbatim, before the first
    // v3 write replaces the legacy bytes (useSrsProgress.ts, LEGACY_BACKUP_KEY).
    const backup = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      LEGACY_BACKUP_KEY,
    );
    expect(backup).not.toBeNull();
    expect(JSON.parse(backup as string)).toEqual(legacy);

    // The live store has moved to the current v3 envelope: `{ version: 3,
    // items }`, and the answered item carries no itemId field any more
    // (issue #53 — it is the map key).
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), SRS_STORAGE_KEY);
    const parsed = JSON.parse(stored as string);
    expect(parsed.version).toBe(3);
    expect(parsed.items[ITEM_ID]).toBeDefined();
    expect(parsed.items[ITEM_ID].itemId).toBeUndefined();
    expect(parsed.items[ITEM_ID].repetitions).toBe(1);
  });
});
