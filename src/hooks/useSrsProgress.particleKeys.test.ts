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

const LEGACY_KEY = '1-presens';
const CLOZE_KEY = particleItemId('pv:tycka-om', 'cloze');
const RECALL_KEY = particleItemId('pv:tycka-om', 'recall');
const REFLEXIVE_KEY = particleItemId('pv:hora-av-sig', 'cloze');

const MIXED_ITEMS: Record<string, SrsState> = {
  [LEGACY_KEY]: state(LEGACY_KEY, { repetitions: 9, intervalDays: 120 }),
  '13-preteritum': state('13-preteritum', { repetitions: 2, intervalDays: 6 }),
  [CLOZE_KEY]: state(CLOZE_KEY, { repetitions: 3, intervalDays: 10 }),
  [RECALL_KEY]: state(RECALL_KEY, { repetitions: 1, intervalDays: 1 }),
  [REFLEXIVE_KEY]: state(REFLEXIVE_KEY, { repetitions: 6, intervalDays: 45 }),
};

beforeEach(() => {
  localStorage.clear();
});

describe('#246: mixed legacy + pv: key round trip', () => {
  it('exports both kinds of key in one version-3 envelope', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items: MIXED_ITEMS }));

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const exported = JSON.parse(result.current.exportData());
    // The particle feature itself needed no version bump: the pv: namespace
    // is disjoint from <digits>-<form>. exportData always writes the
    // current STORAGE_VERSION regardless of what version the loaded store
    // was, so this reads 3 now (#222's unrelated v2 -> v3 requeue-ledger
    // bump), not because loading a mixed-key store bumps anything itself.
    expect(exported.version).toBe(3);
    for (const [key, value] of Object.entries(MIXED_ITEMS)) {
      expect(exported.items[key]).toEqual(value);
    }
  });

  it('restores every particle key from its own export, byte for byte', async () => {
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
    for (const [key, value] of Object.entries(MIXED_ITEMS)) {
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
    expect(persisted.items[LEGACY_KEY]).toEqual(MIXED_ITEMS[LEGACY_KEY]);
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

    const legacyBefore = result.current.srsStates[LEGACY_KEY];

    act(() => {
      result.current.recordAnswer(CLOZE_KEY, 5, 'typed');
    });
    await waitFor(() => expect(result.current.srsStates[CLOZE_KEY]!.repetitions).toBe(4));

    expect(result.current.srsStates[LEGACY_KEY]).toEqual(legacyBefore);
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
