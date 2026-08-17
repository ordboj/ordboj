import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnswerLog } from '@/hooks/useAnswerLog';
import { DEFAULT_WRITE_DELAY_MS } from '@/lib/storage';
import {
  ANSWER_LOG_STORAGE_KEY,
  ANSWER_LOG_CLEAR_EVENT,
  type AnswerLogEntry,
  type TypedAnswerLogEntry,
} from '@/lib/answerLog';

// src/hooks/useAnswerLog.ts is the write path for the per-answer diagnostic
// log (issue #403, decision doc section 5). It has no state the UI reads and
// no isLoading flag, so every assertion here goes through the one side
// effect the hook has: what lands in localStorage after the coalesced
// writer's window elapses (or after a forced flush via unmount/dispose).

function typedInput(i: string): Omit<TypedAnswerLogEntry, 't'> {
  return { i, m: 'typed', k: true, f: 0 };
}

function storedEntries(): AnswerLogEntry[] | null {
  const raw = localStorage.getItem(ANSWER_LOG_STORAGE_KEY);
  if (raw === null) return null;
  return (JSON.parse(raw) as { entries: AnswerLogEntry[] }).entries;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a version-2 (newer) stored payload', () => {
  it('stays byte-identical after ten appends: the hook disables itself rather than writing over a newer build', () => {
    const newerPayload = JSON.stringify({
      version: 2,
      entries: [{ t: 1, i: 'pv:a', m: 'typed', k: true, f: 0 }],
    });
    localStorage.setItem(ANSWER_LOG_STORAGE_KEY, newerPayload);

    const { result, unmount } = renderHook(() => useAnswerLog());

    act(() => {
      for (let n = 0; n < 10; n++) {
        result.current.logAnswer(typedInput(`pv:new-${n}`));
      }
    });
    act(() => {
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS * 2);
    });
    unmount();

    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBe(newerPayload);
  });
});

describe('a corrupt stored payload (acceptance criterion 5)', () => {
  it('is replaced with a fresh empty v1 envelope via writer.schedule + writer.flush on mount', () => {
    localStorage.setItem(ANSWER_LOG_STORAGE_KEY, '{not valid json');

    renderHook(() => useAnswerLog());

    // schedule() + flush() run synchronously inside the mount effect, before
    // any timer needs to advance.
    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBe(
      JSON.stringify({ version: 1, entries: [] }),
    );
  });
});

describe('a throwing setItem', () => {
  it('does not throw out of logAnswer (or the flush it schedules)', () => {
    const { result, unmount } = renderHook(() => useAnswerLog());

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    try {
      expect(() => {
        act(() => {
          result.current.logAnswer(typedInput('pv:a'));
        });
        // Force the pending write to actually hit the throwing setItem.
        unmount();
      }).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('quota policy - one failed write', () => {
  it('halves the in-memory buffer, so the next successful write carries only the newest half plus the new entry', () => {
    const { result, unmount } = renderHook(() => useAnswerLog());

    act(() => {
      result.current.logAnswer(typedInput('pv:0'));
      result.current.logAnswer(typedInput('pv:1'));
      result.current.logAnswer(typedInput('pv:2'));
      result.current.logAnswer(typedInput('pv:3'));
    });

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    act(() => {
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
    });
    spy.mockRestore();

    // The failed flush never reached disk.
    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();

    act(() => {
      result.current.logAnswer(typedInput('pv:4'));
    });
    act(() => {
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
    });
    unmount();

    // ceil(4/2) = 2 kept from the halving (the newest two, pv:2 and pv:3),
    // plus the new pv:4 entry logged afterwards: 3 total, oldest (pv:0,
    // pv:1) gone.
    const entries = storedEntries();
    expect(entries?.map((e) => e.i)).toEqual(['pv:2', 'pv:3', 'pv:4']);
  });
});

describe('quota policy - two consecutive failed writes', () => {
  it('disables logging for the session and removes the stored key', () => {
    const { result, unmount } = renderHook(() => useAnswerLog());

    act(() => {
      result.current.logAnswer(typedInput('pv:0'));
      result.current.logAnswer(typedInput('pv:1'));
    });

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    // First failure: halves the buffer, does not yet disable.
    act(() => {
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
    });

    act(() => {
      result.current.logAnswer(typedInput('pv:2'));
    });

    // Second consecutive failure: disables logging and deletes the key.
    // removeItem is not mocked, so this call goes through even while
    // setItem still throws.
    act(() => {
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
    });
    spy.mockRestore();

    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();

    // Logging is disabled for the rest of the session: a further call does
    // not resurrect the key even once writes could succeed again.
    act(() => {
      result.current.logAnswer(typedInput('pv:3'));
    });
    act(() => {
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
    });
    unmount();

    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();
  });
});

describe('ANSWER_LOG_CLEAR_EVENT (resetProgress / importData cross-hook clear)', () => {
  it('empties the in-memory buffer and cancels a pending pre-clear write instead of flushing it; the next logAnswer writes exactly one entry', () => {
    const { result, unmount } = renderHook(() => useAnswerLog());

    act(() => {
      result.current.logAnswer(typedInput('pv:pre-clear'));
    });
    // A write is now pending (armed, not yet flushed).

    act(() => {
      window.dispatchEvent(new Event(ANSWER_LOG_CLEAR_EVENT));
    });

    // The window the pre-clear write would have flushed in.
    act(() => {
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS * 2);
    });
    // cancelPending() dropped the pending write: nothing was flushed, so no
    // key exists yet at all.
    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();

    act(() => {
      result.current.logAnswer(typedInput('pv:post-clear'));
    });
    act(() => {
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
    });
    unmount();

    const entries = storedEntries();
    expect(entries?.map((e) => e.i)).toEqual(['pv:post-clear']);
  });
});
