import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { particleItemId } from '@/lib/itemIds';
import type { SrsState } from '@/lib/srs';

// Issue #8: SRS item ids moved from position-derived (`<index+1>-<form>`) to
// infinitive-derived (`<infinitive>-<form>`), and a v2 -> v3 migration
// rewrites any store still holding the old keys. This suite is the
// end-to-end proof of both halves, through the real hook and real
// localStorage: a stored schedule survives a VERB_DATA reorder untouched,
// and a legacy store's positional keys are rewritten exactly once, with
// nothing dropped on the way -- not a same-id collision, not a positional
// key past the end of the migration's own snapshot.

const STORAGE_KEY = 'swedish-verbs-srs-progress';
const FIXED_DUE = new Date('2026-06-01T10:00:00.000Z').getTime();

function state(itemId: string, overrides: Partial<SrsState> = {}): SrsState {
  return {
    itemId,
    repetitions: 1,
    intervalDays: 1,
    easeFactor: 2.5,
    dueAt: FIXED_DUE,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('#8: a stored item stays attached to its verb across a VERB_DATA reorder (REORDER)', () => {
  afterEach(() => {
    vi.doUnmock('@/data/verbData');
    vi.resetModules();
  });

  it("keeps gå-presens's schedule intact, and does not leak it onto skapa-presens, once VERB_DATA is reversed", async () => {
    // Seed a v3 (already infinitive-keyed) store. "gå" is VERB_DATA[12] in
    // the current (unreversed) table -- src/data/verbData.orderPin.test.ts.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {
          'gå-presens': state('gå-presens', { repetitions: 4, intervalDays: 41, easeFactor: 2.7 }),
        },
      }),
    );

    vi.resetModules();
    vi.doMock('@/data/verbData', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/data/verbData')>();
      return { ...actual, VERB_DATA: [...actual.VERB_DATA].reverse() };
    });

    // Fresh module graph so useSrsProgress (via srsProviders -> verbs ->
    // itemIds, all statically importing '@/data/verbData') picks up the
    // reversed table instead of the one this file's top-level import
    // already resolved.
    const { useSrsProgress: useSrsProgressReversed } = await import('@/hooks/useSrsProgress');
    // Same reversed module graph as the hook above, so this resolves ids
    // against the exact table the hook is reading from.
    const { getVerbs } = await import('@/lib/verbs');
    const { conjugationItemId } = await import('@/lib/itemIds');

    const { result } = renderHook(() => useSrsProgressReversed());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // gå-presens is keyed by infinitive, so it comes back exactly as stored
    // no matter where "gå" now sits in the (reversed) table.
    expect(result.current.srsStates['gå-presens']).toMatchObject({
      repetitions: 4,
      intervalDays: 41,
      easeFactor: 2.7,
    });

    // Reversing a 56-row table puts whatever was at the far end where "gå"
    // (index 12) used to be -- that is "skapa" (originally index 43; see
    // the pin test). If any code path still looked items up by table
    // position instead of by id, skapa-presens would now read gå's numbers.
    // It must not: it is a distinct key, freshly initialized like any other
    // verb this store has no history for.
    expect(result.current.srsStates['skapa-presens']).toMatchObject({ repetitions: 0 });
    expect(result.current.srsStates['skapa-presens']).not.toMatchObject({
      repetitions: 4,
      intervalDays: 41,
      easeFactor: 2.7,
    });

    // The two assertions above look up the bare literal 'gå-presens'. That
    // alone is not proof of anything id-scheme related: the hook spreads
    // whatever is stored under STORAGE_KEY straight into srsStates, so those
    // two checks would pass identically even if the app had regressed all
    // the way back to position-derived ids -- they never exercise how a
    // real screen would *compute* the key it looks up. Resolve it the way
    // the app actually does instead: read gå's and skapa's freshly
    // recomputed positional Verb.id out of the reversed table (13 and 44
    // swap places under a full reversal of a 56-row table) and build the
    // storage key through conjugationItemId, the one function every call
    // site uses.
    const reversedVerbs = await getVerbs();
    const gaPositionalId = reversedVerbs.find((v) => v.infinitive === 'gå')?.id;
    const skapaPositionalId = reversedVerbs.find((v) => v.infinitive === 'skapa')?.id;
    expect(gaPositionalId).toBe('44');
    expect(skapaPositionalId).toBe('13');

    const gaKeyViaApp = conjugationItemId(gaPositionalId!, 'presens');
    const skapaKeyViaApp = conjugationItemId(skapaPositionalId!, 'presens');
    expect(gaKeyViaApp).toBe('gå-presens');
    expect(skapaKeyViaApp).toBe('skapa-presens');

    // The real proof: the stored schedule is reachable through the id the
    // app's own addressing path produces today, not merely through a
    // literal that happens to still read the right thing.
    expect(result.current.srsStates[gaKeyViaApp]).toMatchObject({
      repetitions: 4,
      intervalDays: 41,
      easeFactor: 2.7,
    });
  });
});

describe('#8: v2 -> v3 id migration on load (MIGRATION)', () => {
  it("rewrites a v2 store's positional keys to their infinitive-based id, in place, leaving pv: keys untouched", async () => {
    const pvKey = particleItemId('pv:tycka-om', 'cloze');
    const pvState = state(pvKey, { repetitions: 5, intervalDays: 12 });
    const legacyState = state('13-presens', { repetitions: 4, intervalDays: 41, easeFactor: 2.7 });

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          '13-presens': legacyState,
          [pvKey]: pvState,
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // '13-presens' -> VERB_DATA[12] -> "gå" (src/data/verbData.orderPin.test.ts).
    // Every scheduling number carries over unchanged; only the key and the
    // `itemId` field change.
    expect(result.current.srsStates['gå-presens']).toEqual({
      ...legacyState,
      itemId: 'gå-presens',
    });
    expect(result.current.srsStates['13-presens']).toBeUndefined();
    // The pv: namespace is disjoint from `<digits>-<form>` and untouched.
    expect(result.current.srsStates[pvKey]).toEqual(pvState);

    // The rewrite is persisted under the new version, not left as a v2
    // envelope with v3-shaped keys in memory only.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.version).toBe(3);
    expect(stored.items['gå-presens']).toEqual({ ...legacyState, itemId: 'gå-presens' });
    expect(stored.items['13-presens']).toBeUndefined();
  });

  it('does not re-run the migration on a second mount of an already-migrated store (ONE-SHOT)', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: { '13-presens': state('13-presens', { repetitions: 4, intervalDays: 41 }) },
      }),
    );

    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const afterFirst = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(afterFirst.version).toBe(3);
    expect(afterFirst.items['gå-presens']).toBeDefined();

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    // A second mount of an already-v3 store changes nothing on disk: no
    // migration re-runs (fromVersion 3 is not < 3), so the persisted bytes
    // are identical, not merely equivalent.
    const afterSecond = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(afterSecond).toEqual(afterFirst);
  });

  it('drops neither side of an id collision between a legacy key and an already-migrated one at the same target (COLLISION)', async () => {
    const legacy = state('1-presens', { repetitions: 1, intervalDays: 1, easeFactor: 2.5 });
    const alreadyMigrated = state('vara-presens', {
      repetitions: 9,
      intervalDays: 120,
      easeFactor: 2.6,
    });

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: { '1-presens': legacy, 'vara-presens': alreadyMigrated },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The real (further-along) schedule at the target key is never
    // clobbered by the stale legacy one -- migrateLegacyItemIds refuses to
    // overwrite an existing v3 entry.
    expect(result.current.srsStates['vara-presens']).toEqual(alreadyMigrated);
    // Nor is the colliding legacy key silently discarded: it survives under
    // its own name rather than vanishing with no error.
    expect(result.current.srsStates['1-presens']).toEqual(legacy);
  });

  it('leaves a legacy key whose index is outside the migration snapshot untouched (UNKNOWN INDEX)', async () => {
    const unknown = state('999-presens', { repetitions: 3 });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, items: { '999-presens': unknown } }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Index 999 was never a valid VERB_DATA position in any released build,
    // so it cannot be resolved to an infinitive -- migrateLegacyItemIds
    // leaves it exactly as found rather than guessing.
    expect(result.current.srsStates['999-presens']).toEqual(unknown);
  });
});

describe('#8: importData runs the same id migration as storage load (IMPORT LADDER)', () => {
  it('id-migrates a v2 import without re-running the v1 ease rebase', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const v2Export = JSON.stringify({
      version: 2,
      items: {
        '13-presens': state('13-presens', { repetitions: 5, easeFactor: 1.3 }),
      },
    });

    let imported: boolean | undefined;
    act(() => {
      imported = result.current.importData(v2Export);
    });
    expect(imported).toBe(true);

    expect(result.current.srsStates['gå-presens']).toBeDefined();
    expect(result.current.srsStates['gå-presens']!.itemId).toBe('gå-presens');
    expect(result.current.srsStates['gå-presens']!.repetitions).toBe(5);
    // Not rebased: only a v1/unversioned import gets the one-time ease
    // rebase (its ease values predate that fix); a v2 import's easeFactor
    // is already believed accurate and is carried through as-is.
    expect(result.current.srsStates['gå-presens']!.easeFactor).toBe(1.3);
    expect(result.current.srsStates['13-presens']).toBeUndefined();
  });
});
