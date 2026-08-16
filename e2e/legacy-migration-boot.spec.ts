import { test, expect } from '@playwright/test';
import {
  buildLegacyV1Seed,
  getVerbPosition,
  positionalItemId,
  SRS_STORAGE_KEY,
} from './support/seed';

// The one spec allowed to seed the pre-v3 bare-map shape (determinism rule
// 2 / Phase 0 follow-through, see seed.ts's buildLegacyV1Seed doc comment).
// Every other spec seeds the current v3 envelope on purpose, so this is the
// suite's only real-browser coverage of "an install still on the pre-v3
// shape boots and migrates cleanly" — the class of value
// malformed-storage-boot.spec.ts covers for corrupted bytes, applied here to
// a *valid* but old shape instead.
//
// Fixed per the #412 adversarial review's F1 finding: this spec used to seed
// canonical (infinitive-keyed) ids under the legacy bare-map shape, which
// made migrateConjugationKeys's re-keying branch — the riskiest part of the
// legacy migration, and the one it exists for — an identity pass that never
// actually matched useSrsProgress.ts's `LEGACY_CONJUGATION_KEY` regex
// (`^\d+-<form>$`). buildLegacyV1Seed now produces genuine positional keys
// (`1-presens`, not `vara-presens`), and this spec asserts the re-keying
// itself: the answered item lands under its canonical id in the migrated v3
// store, and the pre-v3 backup preserves the original positional key
// verbatim.
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
// Overrides passed to buildLegacyV1Seed are keyed canonically; the function
// re-keys them onto the matching positional id internally.
const ANSWERED_ITEM = 'vara-presens'; // vara, presens = "är"
const ANSWER = 'är';
// A second, not-due item with enough history to trigger the one-time legacy
// ease rebase (REBASE_MIN_REPETITIONS = 2, REBASE_EASE_MIN = 1.8 in
// useSrsProgress.ts) — kept separate from ANSWERED_ITEM so answering a card
// (which recomputes ease via calculateNextReview) can never be confused with
// the rebase this item is here to prove ran.
const REBASE_ITEM = 'komma-imperativ'; // komma, imperativ = "kom"
const PRE_REBASE_EASE = 1.3; // below REBASE_EASE_MIN — must be rebased up
const REBASE_EASE_MIN = 1.8;

test.describe('legacy (pre-v3) storage boots and migrates', () => {
  test('a bare-map pre-v3 store, keyed positionally, boots, re-keys onto canonical ids, rebases ease, and is migrated to the v3 envelope', async ({
    page,
    context,
  }) => {
    const varaPosition = await getVerbPosition('vara');
    const kommaPosition = await getVerbPosition('komma');
    const legacyAnsweredKey = positionalItemId(varaPosition, 'presens');
    const legacyRebaseKey = positionalItemId(kommaPosition, 'imperativ');

    const legacy = await buildLegacyV1Seed({
      [ANSWERED_ITEM]: { dueAt: Date.now() },
      [REBASE_ITEM]: {
        repetitions: 2,
        easeFactor: PRE_REBASE_EASE,
        dueAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
      },
    });

    // The legacy shape itself: no envelope, `itemId` duplicated inside every
    // value, keyed positionally (`1-presens`, not `vara-presens`) — exactly
    // what a real pre-#53 install has on disk, and exactly the shape
    // `LEGACY_CONJUGATION_KEY` / `migrateConjugationKeys` exist to read.
    expect(legacy[legacyAnsweredKey]).toBeDefined();
    expect(legacy[legacyRebaseKey]).toBeDefined();
    expect(legacy[ANSWERED_ITEM]).toBeUndefined();

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

    // The one-shot pre-v3 backup: written once, verbatim — including the
    // original positional keys, untouched by the re-keying migration that
    // only ever writes the *live* store under canonical ids — before the
    // first v3 write replaces the legacy bytes (useSrsProgress.ts,
    // LEGACY_BACKUP_KEY).
    const backup = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      LEGACY_BACKUP_KEY,
    );
    expect(backup).not.toBeNull();
    const parsedBackup = JSON.parse(backup as string);
    expect(parsedBackup).toEqual(legacy);
    expect(parsedBackup[legacyAnsweredKey]).toBeDefined();
    expect(parsedBackup[legacyRebaseKey]).toBeDefined();
    expect(parsedBackup[legacyRebaseKey].easeFactor).toBe(PRE_REBASE_EASE);

    // The live store has moved to the current v3 envelope: `{ version: 3,
    // items }`, re-keyed onto canonical (infinitive-based) ids — the
    // positional keys are gone from the live store, only from the backup —
    // and the answered item carries no itemId field any more (issue #53 —
    // it is the map key).
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), SRS_STORAGE_KEY);
    const parsed = JSON.parse(stored as string);
    expect(parsed.version).toBe(3);
    expect(parsed.items[legacyAnsweredKey]).toBeUndefined();
    expect(parsed.items[legacyRebaseKey]).toBeUndefined();
    expect(parsed.items[ANSWERED_ITEM]).toBeDefined();
    expect(parsed.items[ANSWERED_ITEM].itemId).toBeUndefined();
    expect(parsed.items[ANSWERED_ITEM].repetitions).toBe(1);

    // The rebase: REBASE_ITEM's pre-migration ease (1.3, below the 1.8
    // floor) is rebased up on the v1 -> v2 leg of the migration, and this
    // item was never touched afterward (unlike ANSWERED_ITEM, whose ease
    // moved again from the real answer above), so its final ease is exactly
    // the rebase floor.
    expect(parsed.items[REBASE_ITEM]).toBeDefined();
    expect(parsed.items[REBASE_ITEM].easeFactor).toBe(REBASE_EASE_MIN);
    expect(parsed.items[REBASE_ITEM].repetitions).toBe(2);
  });
});
