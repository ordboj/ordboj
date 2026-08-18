import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { PRE_V3_SRS_BACKUP_KEY, SRS_STORAGE_KEY } from '@/lib/backup';

// v3 -> v4 (ORD-88) forward migration: backfillFirstSeenAt in
// useSrsProgress.ts, and the pre-v3 backup guard that must not fire again on
// this bump (PRE_V3_BACKUP_BELOW_VERSION). backfillFirstSeenAt itself is not
// exported — same reasoning as migrateConjugationKeys and quarantineInvalidItems
// in useSrsProgress.test.ts: it is pinned through the hook's observable
// srsStates/localStorage output, not by reaching into the module's internals.
//
// staff-engineer blocking finding #3 on the ORD-88 schema review: these are
// the migration-path cases the original PR shipped without direct coverage.

const STORAGE_KEY = SRS_STORAGE_KEY;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_NOW = new Date('2026-06-01T12:00:00.000Z').getTime();

beforeEach(() => {
  localStorage.clear();
  // Only Date is faked (matching the other useSrsProgress suites): RTL's
  // waitFor polls with a real setTimeout internally, so faking timers
  // wholesale would freeze that polling too.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('backfillFirstSeenAt - skip rule', () => {
  it('leaves an untouched item (repetitions 0, intervalDays 0, no lastGrade) unstamped', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {
          'untouched-item': {
            repetitions: 0,
            intervalDays: 0,
            easeFactor: 2.5,
            dueAt: FIXED_NOW + 10 * DAY_MS,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['untouched-item']).toBeDefined();
    expect(result.current.srsStates['untouched-item']!.firstSeenAt).toBeUndefined();
  });
});

describe('backfillFirstSeenAt - clamp', () => {
  it('clamps a corrupt/small dueAt (dueAt - intervalDays * 24h negative) to 0, never a negative instant', async () => {
    // dueAt near the epoch with a very large intervalDays: the raw estimate
    // (dueAt - intervalDays * 24h) is deeply negative. A first-exposure
    // timestamp must never be negative.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {
          'corrupt-item': {
            repetitions: 3,
            intervalDays: 1000,
            easeFactor: 2.5,
            dueAt: 500,
            lastGrade: 5,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['corrupt-item']!.firstSeenAt).toBe(0);
  });

  it('clamps a future estimate at "now" rather than projecting into the future', async () => {
    // dueAt in the future with intervalDays 0 puts dueAt - intervalDays*24h
    // at dueAt itself, which is still after "now" — the clamp's upper bound
    // must cap it at the load instant, not let a first-exposure stamp sit in
    // the future.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {
          'future-due-item': {
            repetitions: 1,
            intervalDays: 0,
            easeFactor: 2.5,
            dueAt: FIXED_NOW + 5 * DAY_MS,
            lastGrade: 5,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['future-due-item']!.firstSeenAt).toBe(FIXED_NOW);
  });
});

describe('backfillFirstSeenAt - already-stamped items are never recomputed', () => {
  it('leaves an existing firstSeenAt exactly as stored, even when it disagrees with the derived estimate', async () => {
    const deliberatelyWrongStamp = 12345;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 4,
        items: {
          'already-stamped-item': {
            repetitions: 5,
            intervalDays: 20,
            easeFactor: 2.4,
            dueAt: FIXED_NOW,
            lastGrade: 5,
            firstSeenAt: deliberatelyWrongStamp,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['already-stamped-item']!.firstSeenAt).toBe(
      deliberatelyWrongStamp,
    );
  });

  it('is idempotent across two real load cycles: a second load, much later, does not move the stamp', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {
          'once-backfilled-item': {
            repetitions: 4,
            intervalDays: 12,
            easeFactor: 2.3,
            dueAt: FIXED_NOW,
            lastGrade: 5,
          },
        },
      }),
    );

    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    const stampAfterFirstLoad = first.result.current.srsStates['once-backfilled-item']!
      .firstSeenAt;
    expect(stampAfterFirstLoad).toBe(FIXED_NOW - 12 * DAY_MS);
    // The coalesced writer (issue #253) flushes on unmount.
    first.unmount();

    // A second load, a long time later: if backfillFirstSeenAt recomputed
    // instead of preserving, "now" moving forward would move the stamp too.
    vi.setSystemTime(FIXED_NOW + 60 * DAY_MS);
    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(second.result.current.srsStates['once-backfilled-item']!.firstSeenAt).toBe(
      stampAfterFirstLoad,
    );
  });
});

describe('backfillFirstSeenAt - a lapsed item is still backfilled', () => {
  it('backfills a lapsed item (repetitions 0, intervalDays 1, lastGrade 0): repetitions 0 alone does not mean untouched', async () => {
    // The skip rule requires repetitions 0 AND intervalDays 0 AND no
    // lastGrade. A lapse resets repetitions to 0 but sets intervalDays to 1
    // and lastGrade to 0 — real practice history, not an untouched item —
    // so it must not be confused with the skip case above.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: {
          'lapsed-item': {
            repetitions: 0,
            intervalDays: 1,
            easeFactor: 1.3,
            dueAt: FIXED_NOW,
            lastGrade: 0,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.srsStates['lapsed-item']!.firstSeenAt).toBe(FIXED_NOW - 1 * DAY_MS);
  });
});

// The pre-v3 backup (PRE_V3_SRS_BACKUP_KEY) captures the payload of the one
// migration that rewrote keys and dropped fields (v2 -> v3, issue #53). The
// v3 -> v4 bump is purely additive (one new optional field), so it must never
// fire that guard again — see PRE_V3_BACKUP_BELOW_VERSION in
// useSrsProgress.ts.
describe('pre-v3 backup guard (PRE_V3_BACKUP_BELOW_VERSION)', () => {
  it('does not write the pre-v3 backup on a v3 store\'s first v4 load', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        items: { 'some-item': { repetitions: 2, intervalDays: 6, easeFactor: 2.5, dueAt: FIXED_NOW } },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(localStorage.getItem(PRE_V3_SRS_BACKUP_KEY)).toBeNull();
  });

  it('still backs up a v2 store\'s bytes verbatim on load (the guard it must not have broken)', async () => {
    const v2Store = JSON.stringify({
      version: 2,
      items: {
        'v2-item': {
          itemId: 'v2-item',
          repetitions: 2,
          intervalDays: 6,
          easeFactor: 2.5,
          dueAt: FIXED_NOW,
        },
      },
    });
    localStorage.setItem(STORAGE_KEY, v2Store);

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(localStorage.getItem(PRE_V3_SRS_BACKUP_KEY)).toBe(v2Store);
  });

  it('never overwrites an existing pre-v3 backup, whatever store loads next', async () => {
    const existingBackup = 'sentinel-oldest-copy-do-not-touch';
    localStorage.setItem(PRE_V3_SRS_BACKUP_KEY, existingBackup);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        items: {
          'v2-item': {
            itemId: 'v2-item',
            repetitions: 9,
            intervalDays: 30,
            easeFactor: 2.5,
            dueAt: FIXED_NOW,
          },
        },
      }),
    );

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(localStorage.getItem(PRE_V3_SRS_BACKUP_KEY)).toBe(existingBackup);
  });
});
