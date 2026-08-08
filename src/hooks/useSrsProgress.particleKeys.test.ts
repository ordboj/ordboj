import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { particleItemId } from '@/lib/itemIds';
import type { SrsState } from '@/lib/srs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

// The refuse-to-merge condition from the spec: the particle feature is only
// "additive to the progress store" if a store holding both kinds of key
// survives an export and an import intact. A pv: key silently dropped on
// import is unrecoverable data loss on a device with no backup, and it would
// look exactly like "the learner never practised particle verbs".

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

// A v2-era (position-based) conjugation key. The v2 -> v3 migration (issue
// #8, src/hooks/useSrsProgress.ts) rewrites it on load to its
// infinitive-based id, 'vara-presens' (VERB_DATA[0] -- see
// src/data/verbData.orderPin.test.ts). This suite seeds a v2 envelope
// specifically to prove that migration and the pv: namespace do not step on
// each other.
const LEGACY_KEY = '1-presens';
const MIGRATED_LEGACY_KEY = 'vara-presens';
// VERB_DATA[12] ('gå', index 13) -- see the same pin.
const LEGACY_PRETERITUM_KEY = '13-preteritum';
const MIGRATED_PRETERITUM_KEY = 'gå-preteritum';
const CLOZE_KEY = particleItemId('pv:tycka-om', 'cloze');
const RECALL_KEY = particleItemId('pv:tycka-om', 'recall');
const REFLEXIVE_KEY = particleItemId('pv:hora-av-sig', 'cloze');

const MIXED_ITEMS: Record<string, SrsState> = {
  [LEGACY_KEY]: state(LEGACY_KEY, { repetitions: 9, intervalDays: 120 }),
  [LEGACY_PRETERITUM_KEY]: state(LEGACY_PRETERITUM_KEY, { repetitions: 2, intervalDays: 6 }),
  [CLOZE_KEY]: state(CLOZE_KEY, { repetitions: 3, intervalDays: 10 }),
  [RECALL_KEY]: state(RECALL_KEY, { repetitions: 1, intervalDays: 1 }),
  [REFLEXIVE_KEY]: state(REFLEXIVE_KEY, { repetitions: 6, intervalDays: 45 }),
};

// MIXED_ITEMS as it reads back out of the store once the v2 -> v3 id
// migration has run once: the two legacy digit keys are gone, replaced by
// their infinitive-based id with `itemId` rewritten to match; the two pv:
// keys are byte-for-byte identical, since that namespace is disjoint from
// `<digits>-<form>` and the migration's regex never matches it.
const MIGRATED_ITEMS: Record<string, SrsState> = {
  [MIGRATED_LEGACY_KEY]: { ...MIXED_ITEMS[LEGACY_KEY]!, itemId: MIGRATED_LEGACY_KEY },
  [MIGRATED_PRETERITUM_KEY]: {
    ...MIXED_ITEMS[LEGACY_PRETERITUM_KEY]!,
    itemId: MIGRATED_PRETERITUM_KEY,
  },
  [CLOZE_KEY]: MIXED_ITEMS[CLOZE_KEY]!,
  [RECALL_KEY]: MIXED_ITEMS[RECALL_KEY]!,
  [REFLEXIVE_KEY]: MIXED_ITEMS[REFLEXIVE_KEY]!,
};

beforeEach(() => {
  localStorage.clear();
});

describe('#246: mixed legacy + pv: key round trip', () => {
  it('exports the v2 -> v3 migrated legacy keys and the untouched pv: keys in one version-3 envelope', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items: MIXED_ITEMS }));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const exported = JSON.parse(result.current.exportData());
    // A fresh export is stamped with the version this build writes, not the
    // one the store was read at: the v2 -> v3 id migration ran on load.
    expect(exported.version).toBe(3);
    // pv: keys are disjoint from <digits>-<form> and untouched by the id
    // migration -- byte-for-byte identical to what was seeded.
    for (const key of [CLOZE_KEY, RECALL_KEY, REFLEXIVE_KEY]) {
      expect(exported.items[key]).toEqual(MIXED_ITEMS[key]);
    }
    // The two legacy digit keys are gone, replaced by their infinitive-based
    // id with every scheduling number unchanged and itemId rewritten to match.
    for (const [key, value] of Object.entries(MIGRATED_ITEMS)) {
      if (key === CLOZE_KEY || key === RECALL_KEY || key === REFLEXIVE_KEY) continue;
      expect(exported.items[key]).toEqual(value);
    }
    expect(exported.items[LEGACY_KEY]).toBeUndefined();
    expect(exported.items[LEGACY_PRETERITUM_KEY]).toBeUndefined();
  });

  it('restores every particle key -- and the migrated legacy keys -- from its own export, byte for byte', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items: MIXED_ITEMS }));

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
    for (const [key, value] of Object.entries(MIGRATED_ITEMS)) {
      expect(second.result.current.srsStates[key]).toEqual(value);
    }
  });

  it('writes the particle keys back to localStorage after an import', async () => {
    const backup = JSON.stringify({ version: 2, items: MIXED_ITEMS });

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.importData(backup);
    });
    await waitFor(() => expect(result.current.srsStates[REFLEXIVE_KEY]).toBeDefined());

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(persisted.items[REFLEXIVE_KEY]).toEqual(MIXED_ITEMS[REFLEXIVE_KEY]);
    // The imported v2 legacy key is migrated on the way in, so what lands on
    // disk is the infinitive-based id, not the digit key from the backup.
    expect(persisted.items[MIGRATED_LEGACY_KEY]).toEqual(MIGRATED_ITEMS[MIGRATED_LEGACY_KEY]);
    expect(persisted.items[LEGACY_KEY]).toBeUndefined();
  });

  it('accepts a legacy unversioned backup that already carries pv: keys', async () => {
    // An export taken from a build that had particle verbs but not the
    // version envelope. The ease rebase applies to the legacy payload, so
    // compare the fields the rebase does not touch.
    const bareBackup = JSON.stringify(MIXED_ITEMS);

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

  it('never renames or drops a conjugation key when a particle answer is recorded', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items: MIXED_ITEMS }));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Already migrated to its infinitive-based id on load (see the #8 tests
    // above); that is the key a particle answer must leave untouched.
    const legacyBefore = result.current.srsStates[MIGRATED_LEGACY_KEY];
    expect(legacyBefore).toBeDefined();

    act(() => {
      result.current.recordAnswer(CLOZE_KEY, 5, 'typed');
    });
    await waitFor(() => expect(result.current.srsStates[CLOZE_KEY]!.repetitions).toBe(4));

    expect(result.current.srsStates[MIGRATED_LEGACY_KEY]).toEqual(legacyBefore);
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

  it('records the same schedule whichever modality is reported, in v1', async () => {
    // modality is plumb-and-ignore: the parameter is accepted so credit can
    // later attach to how an item was answered, but no branch ships yet, so
    // src/lib/srs.ts stays untouched.
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
    expect(choice.intervalDays).toBe(typed.intervalDays);
    expect(choice.easeFactor).toBe(typed.easeFactor);
  });
});
