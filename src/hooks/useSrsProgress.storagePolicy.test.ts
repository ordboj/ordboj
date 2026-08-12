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
