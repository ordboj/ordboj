import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSrsProgress } from '@/hooks/useSrsProgress';

// Issue #253, hook-level wiring: the coalesced writer (src/lib/storage.ts)
// is unit-tested in isolation in storage.test.ts. This file pins the
// acceptance criterion at the point a consumer actually observes it: a
// burst of answers coalesces into one localStorage write, and unmounting
// (dispose -> flush) persists the burst instead of dropping it. Sparse v3
// persistence itself (what a flush writes) is pinned in
// useSrsProgress.test.ts and useSrsProgress.realdata.test.ts.

// useSrsProgress creates its writer with the real default debounce window
// (src/lib/storage.ts, DEFAULT_WRITE_DELAY_MS = 500ms), running on the real
// clock even though this file fakes Date. A test that counts setItem calls
// across several synchronous recordAnswer calls plus an unmount is racing
// that window: on a slow CI runner, the 500ms timer can elapse mid-test and
// turn one expected write into two. Widen the window at this mock boundary
// to far longer than the test can take in real time, so only unmount's
// synchronous dispose -> flush ever triggers a write here.
const NEVER_ELAPSES_IN_TEST_MS = 60_000;

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    createCoalescedJsonWriter: (key: string) =>
      actual.createCoalescedJsonWriter(key, NEVER_ELAPSES_IN_TEST_MS),
  };
});

const STORAGE_KEY = 'swedish-verbs-srs-progress';
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

beforeEach(() => {
  localStorage.clear();
  // Only fake Date, matching useSrsProgress.test.ts: RTL's waitFor polls
  // with real setTimeout internally, so faking timers wholesale would
  // freeze that polling too. The coalesced writer's real debounce window
  // is bypassed via unmount()'s synchronous dispose->flush instead of
  // waiting it out.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('#253: bounded per-answer write cost', () => {
  it('collapses several answers recorded before teardown into a single localStorage.setItem call', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const { result, unmount } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Any setItem call so far came from the load path; reset the count once
    // loading has settled so this test measures only the write cost of the
    // three answers below. recordAnswer creates state for an unknown id, so
    // synthetic ids are enough — persistence does not depend on the id
    // being in today's verb table.
    setItemSpy.mockClear();

    act(() => {
      result.current.recordAnswer('tala-presens', 5);
    });
    act(() => {
      result.current.recordAnswer('tala-preteritum', 5);
    });
    act(() => {
      result.current.recordAnswer('tala-supinum', 5);
    });
    expect(result.current.srsStates['tala-supinum']).toBeDefined();

    // Three separate renders -> three schedule() calls. A synchronous
    // per-render writer would have called setItem three times by now; the
    // coalesced writer has called it zero times (the 500 ms window has not
    // elapsed on the only armed timer), and dispose->flush at unmount
    // brings the total to exactly one.
    unmount();

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(persisted.version).toBe(3);
    // One write, but it carries every answer recorded during the burst —
    // this is coalescing, not dropped writes.
    expect(persisted.items['tala-presens']).toBeDefined();
    expect(persisted.items['tala-preteritum']).toBeDefined();
    expect(persisted.items['tala-supinum']).toBeDefined();

    setItemSpy.mockRestore();
  });

  it('an answer recorded just before unmount is persisted, not lost to the pending window', async () => {
    const { result, unmount } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('tala-presens', 5);
    });
    // No waiting: unmount immediately, while the write is still pending.
    unmount();

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(persisted.items['tala-presens']).toMatchObject({ repetitions: 1 });
  });
});

// Reset and import are one-shot, user-confirmed actions: leaving them in
// the 500 ms coalescing window means a hard tab kill right after the action
// puts the OLD store back on reload, and the action appears not to have
// taken. The hook flushes them through the writer synchronously.
describe('#253: reset and import bypass the coalescing window', () => {
  it('resetProgress puts the emptied envelope on disk synchronously, without waiting for unmount or the timer', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer('tala-presens', 5);
    });
    act(() => {
      result.current.resetProgress();
    });

    // Read immediately: no unmount, no waitFor on storage. The pre-reset
    // answer was pending when reset ran; going through the writer replaced
    // it, so it must not appear either now or via a later stale flush.
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(persisted).toEqual({ version: 3, items: {} });
  });

  it('importData puts the imported items on disk synchronously', async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const backup = JSON.stringify({
      version: 3,
      items: {
        'tala-presens': {
          repetitions: 4,
          intervalDays: 12,
          easeFactor: 2.3,
          dueAt: FIXED_NOW + 5 * 24 * 60 * 60 * 1000,
        },
      },
    });

    let imported: boolean | undefined;
    act(() => {
      imported = result.current.importData(backup);
    });
    expect(imported).toBe(true);

    // Read immediately: the imported schedule is already on disk.
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(persisted.version).toBe(3);
    expect(persisted.items['tala-presens']).toMatchObject({ repetitions: 4, intervalDays: 12 });
  });
});
