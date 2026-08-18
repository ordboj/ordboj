import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress, STORAGE_VERSION } from '@/hooks/useSrsProgress';
import { particleItemId } from '@/lib/itemIds';
import { VERB_DATA } from '@/data/verbData';
import type { SrsState } from '@/lib/srs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

// The refuse-to-merge condition from the spec: the particle feature is only
// "additive to the progress store" if a store holding both kinds of key
// survives an export and an import intact. A pv: key silently dropped on
// import is unrecoverable data loss on a device with no backup, and it would
// look exactly like "the learner never practised particle verbs".
//
// Issue #53 changed what a conjugation key *is* (infinitive-keyed, not
// positional) and what a stored item carries (no itemId, no untouched
// items). This suite pins the mixed-key contract against that new shape:
// a legacy positional conjugation key is migrated to its canonical
// (infinitive-keyed) id on load, exactly like any other legacy key, while
// the disjoint pv: namespace is untouched by that migration.

function state(itemId: string, overrides: Partial<SrsState> = {}): SrsState {
  return {
    itemId,
    repetitions: 4,
    intervalDays: 15,
    easeFactor: 2.35,
    dueAt: new Date('2026-06-01T10:00:00.000Z').getTime(),
    lastGrade: 5,
    ...overrides,
  };
}

// Storage version 3 never writes itemId (it is the map key) - strip it
// before comparing against exported/persisted item bodies.
function withoutItemId(s: SrsState): Omit<SrsState, 'itemId'> {
  const { itemId: _itemId, ...rest } = s;
  return rest;
}

// v3 -> v4 (ORD-88) backfills firstSeenAt on any item that already carries
// real practice history (a lastGrade and a non-zero interval): the estimate
// documented in useSrsProgress.ts's backfillFirstSeenAt is
// `dueAt - intervalDays * 24h`, clamped to [0, now]. Every fixture below is
// answered (lastGrade: 5) with a fixed, far-past dueAt, so the clamp never
// engages here - re-deriving it inline keeps this suite pinned to the
// documented formula rather than to today's Date.now().
function withBackfilledFirstSeenAt(s: SrsState): SrsState {
  return { ...s, firstSeenAt: s.dueAt - s.intervalDays * 24 * 60 * 60 * 1000 };
}

// Legacy positional keys, as a pre-#53 build would have written them, and
// the canonical (infinitive-keyed) ids they must migrate to on load.
const LEGACY_KEY = '1-presens';
const CANONICAL_KEY = `${VERB_DATA[0]!.infinitive}-presens`;
const LEGACY_KEY_2 = '13-preteritum';
const CANONICAL_KEY_2 = `${VERB_DATA[12]!.infinitive}-preteritum`;

const CLOZE_KEY = particleItemId('pv:tycka-om', 'cloze');
const RECALL_KEY = particleItemId('pv:tycka-om', 'recall');
const REFLEXIVE_KEY = particleItemId('pv:hora-av-sig', 'cloze');

// What a pre-#53 store on disk looked like: positional conjugation keys
// mixed with the disjoint pv: namespace.
const MIXED_ITEMS_INPUT: Record<string, SrsState> = {
  [LEGACY_KEY]: state(LEGACY_KEY, { repetitions: 9, intervalDays: 120 }),
  [LEGACY_KEY_2]: state(LEGACY_KEY_2, { repetitions: 2, intervalDays: 6 }),
  [CLOZE_KEY]: state(CLOZE_KEY, { repetitions: 3, intervalDays: 10 }),
  [RECALL_KEY]: state(RECALL_KEY, { repetitions: 1, intervalDays: 1 }),
  [REFLEXIVE_KEY]: state(REFLEXIVE_KEY, { repetitions: 6, intervalDays: 45 }),
};

// What the same data looks like in memory (and on export) after the id
// migration: the two conjugation keys move to their canonical id, carrying
// their itemId along; the pv: keys are unaffected.
const MIGRATED_ITEMS_EXPECTED: Record<string, SrsState> = {
  [CANONICAL_KEY]: withBackfilledFirstSeenAt(
    state(CANONICAL_KEY, { repetitions: 9, intervalDays: 120 }),
  ),
  [CANONICAL_KEY_2]: withBackfilledFirstSeenAt(
    state(CANONICAL_KEY_2, { repetitions: 2, intervalDays: 6 }),
  ),
  [CLOZE_KEY]: withBackfilledFirstSeenAt(state(CLOZE_KEY, { repetitions: 3, intervalDays: 10 })),
  [RECALL_KEY]: withBackfilledFirstSeenAt(state(RECALL_KEY, { repetitions: 1, intervalDays: 1 })),
  [REFLEXIVE_KEY]: withBackfilledFirstSeenAt(
    state(REFLEXIVE_KEY, { repetitions: 6, intervalDays: 45 }),
  ),
};

beforeEach(() => {
  localStorage.clear();
});

describe('#246: mixed legacy + pv: key round trip', () => {
  it('exports both kinds of key, with legacy positional keys migrated to canonical ids, in one version-3 envelope', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items: MIXED_ITEMS_INPUT }));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const exported = JSON.parse(result.current.exportData());
    // Issue #53 bumped the storage version and stopped writing itemId.
    expect(exported.version).toBe(STORAGE_VERSION);
    for (const [key, value] of Object.entries(MIGRATED_ITEMS_EXPECTED)) {
      expect(exported.items[key]).toEqual(withoutItemId(value));
    }
    // The pre-migration positional keys do not survive alongside the
    // canonical ones they were rekeyed to.
    expect(exported.items[LEGACY_KEY]).toBeUndefined();
    expect(exported.items[LEGACY_KEY_2]).toBeUndefined();
  });

  it('restores every key from its own export, conjugation keys migrated and particle keys unchanged', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items: MIXED_ITEMS_INPUT }));

    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    const backup = first.result.current.exportData();

    // A different device, or the same one after a reset.
    localStorage.clear();
    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.srsStates[CLOZE_KEY]).toBeUndefined();

    let imported: boolean | undefined;
    act(() => {
      imported = second.result.current.importData(backup);
    });
    expect(imported).toBe(true);

    await waitFor(() => expect(second.result.current.srsStates[CLOZE_KEY]).toBeDefined());
    for (const [key, value] of Object.entries(MIGRATED_ITEMS_EXPECTED)) {
      expect(second.result.current.srsStates[key]).toEqual(withoutItemId(value));
    }
    // The old positional keys are gone, not merely shadowed.
    expect(second.result.current.srsStates[LEGACY_KEY]).toBeUndefined();
    expect(second.result.current.srsStates[LEGACY_KEY_2]).toBeUndefined();
  });

  it('writes the migrated keys back to localStorage after an import', async () => {
    const backup = JSON.stringify({ version: 2, items: MIXED_ITEMS_INPUT });

    const { result, unmount } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.importData(backup);
    });
    await waitFor(() => expect(result.current.srsStates[REFLEXIVE_KEY]).toBeDefined());

    // The write is coalesced (issue #253); unmounting flushes it.
    unmount();
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(persisted.items[REFLEXIVE_KEY]).toEqual(
      withoutItemId(MIGRATED_ITEMS_EXPECTED[REFLEXIVE_KEY]!),
    );
    expect(persisted.items[CANONICAL_KEY]).toEqual(
      withoutItemId(MIGRATED_ITEMS_EXPECTED[CANONICAL_KEY]!),
    );
    expect(persisted.items[LEGACY_KEY]).toBeUndefined();
  });

  it('accepts a legacy unversioned backup that already carries pv: keys', async () => {
    // An export taken from a build that had particle verbs but not the
    // version envelope. The ease rebase applies to the legacy payload, so
    // compare the fields the rebase does not touch.
    const bareBackup = JSON.stringify(MIXED_ITEMS_INPUT);

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let imported: boolean | undefined;
    act(() => {
      imported = result.current.importData(bareBackup);
    });
    expect(imported).toBe(true);

    await waitFor(() => expect(result.current.srsStates[CLOZE_KEY]).toBeDefined());
    expect(result.current.srsStates[CLOZE_KEY]!.repetitions).toBe(3);
    expect(result.current.srsStates[REFLEXIVE_KEY]!.intervalDays).toBe(45);
  });

  it('does not create particle state eagerly for a learner who has never opened the mode', async () => {
    // Lazy initialization is what stops release day from being a flood of
    // ~80 immediately-due cards.
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const particleKeys = Object.keys(result.current.srsStates).filter((key) =>
      key.startsWith('pv:'),
    );
    expect(particleKeys).toEqual([]);
    // Conjugation items, by contrast, are still initialized eagerly.
    expect(Object.keys(result.current.srsStates).length).toBeGreaterThan(0);
  });

  it('never renames or drops a migrated conjugation key when a particle answer is recorded', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items: MIXED_ITEMS_INPUT }));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Sanity check: the id migration actually ran before the assertion below
    // exercises what happens after it.
    const conjugationBefore = result.current.srsStates[CANONICAL_KEY];
    expect(conjugationBefore).toBeDefined();

    act(() => {
      result.current.recordAnswer(CLOZE_KEY, 5, 'typed');
    });
    await waitFor(() => expect(result.current.srsStates[CLOZE_KEY]!.repetitions).toBe(4));

    expect(result.current.srsStates[CANONICAL_KEY]).toEqual(conjugationBefore);
  });

  it('creates particle state on first answer for an item that had none', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const freshKey = particleItemId('pv:ga-ut', 'cloze');
    expect(result.current.srsStates[freshKey]).toBeUndefined();

    act(() => {
      result.current.recordAnswer(freshKey, 5, 'typed');
    });

    await waitFor(() => expect(result.current.srsStates[freshKey]).toBeDefined());
    expect(result.current.srsStates[freshKey]!.repetitions).toBe(1);
    expect(result.current.srsStates[freshKey]!.itemId).toBe(freshKey);
  });

  it('credits a first-ever correct choice answer the same schedule but no ease reward, unlike typed (#388)', async () => {
    // modality now branches in src/lib/srs.ts (#388): a correct choice
    // (recognition) answer advances repetitions and intervalDays exactly
    // like typed on the very first review (both land on intervalDays 1,
    // the max(1, ...) floor), but earns no ease reward, so the two paths
    // diverge on easeFactor alone.
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const typedKey = particleItemId('pv:ga-ut', 'cloze');
    const choiceKey = particleItemId('pv:ga-in', 'cloze');

    act(() => {
      result.current.recordAnswer(typedKey, 5, 'typed');
      result.current.recordAnswer(choiceKey, 5, 'choice');
    });

    await waitFor(() => expect(result.current.srsStates[choiceKey]).toBeDefined());
    const typed = result.current.srsStates[typedKey]!;
    const choice = result.current.srsStates[choiceKey]!;
    expect(choice.repetitions).toBe(typed.repetitions);
    expect(choice.repetitions).toBe(1);
    expect(choice.intervalDays).toBe(typed.intervalDays);
    expect(choice.intervalDays).toBe(1);
    expect(typed.easeFactor).toBe(2.55);
    expect(choice.easeFactor).toBe(2.5);
  });
});
