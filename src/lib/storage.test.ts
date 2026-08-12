import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  writeJson,
  writeSerialized,
  createCoalescedJsonWriter,
  DEFAULT_WRITE_DELAY_MS,
} from '@/lib/storage';

// src/lib/storage.ts is the write policy behind useSrsProgress (issue #253):
// a failed write must never take the in-memory session with it, and
// per-interaction write cost must not grow with the size of the store.
// useSettings still writes directly via localStorage.setItem and does not
// use this module. Neither guarantee had a unit test before this file.

const KEY = 'qa-storage-test-key';

// Serialise-at-flush producer for a small payload, mirroring how
// useSrsProgress passes `() => serializeStore(...)`.
const producing = (value: unknown) => () => JSON.stringify(value);

beforeEach(() => {
  localStorage.clear();
});

describe('writeJson', () => {
  it('serialises and writes the value under the given key, returning true', () => {
    expect(writeJson(KEY, { a: 1 })).toBe(true);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ a: 1 }));
  });

  it('returns false instead of throwing when setItem throws QuotaExceededError', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    try {
      expect(() => writeJson(KEY, { a: 1 })).not.toThrow();
      expect(writeJson(KEY, { a: 1 })).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('returns false rather than throwing when localStorage itself is unreadable (Safari private mode / sandboxed iframe)', () => {
    // getStorage() probes `typeof localStorage`, which itself evaluates the
    // getter — so a storage backend that throws on *read* (not just write)
    // must be swallowed too, not just a throwing setItem.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    try {
      expect(() => writeJson(KEY, { a: 1 })).not.toThrow();
      expect(writeJson(KEY, { a: 1 })).toBe(false);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});

describe('writeSerialized', () => {
  it('writes the string verbatim, without a second JSON encoding', () => {
    expect(writeSerialized(KEY, '{"a":1}')).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('{"a":1}');
  });

  it('returns false instead of throwing when setItem throws QuotaExceededError', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    try {
      expect(() => writeSerialized(KEY, '{}')).not.toThrow();
      expect(writeSerialized(KEY, '{}')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('createCoalescedJsonWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not write synchronously on schedule(): the write is deferred', () => {
    const writer = createCoalescedJsonWriter(KEY);
    writer.schedule(producing({ n: 1 }));
    expect(localStorage.getItem(KEY)).toBeNull();
    writer.dispose();
  });

  it('collapses a burst of schedule() calls into a single write of the newest value (#253 batching)', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const writer = createCoalescedJsonWriter(KEY);
    try {
      for (let i = 0; i < 20; i++) {
        writer.schedule(producing({ n: i }));
      }
      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
      expect(setItemSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 19 });
    } finally {
      writer.dispose();
      setItemSpy.mockRestore();
    }
  });

  it('never calls the producer on schedule(); only the newest producer runs, once, at flush (#253 per-answer cost bound)', () => {
    // This is the property that keeps answering O(1) in store size: the
    // O(store) serialisation happens once per window, not once per answer.
    const producers = Array.from({ length: 5 }, (_, i) => vi.fn(() => JSON.stringify({ n: i })));
    const writer = createCoalescedJsonWriter(KEY);
    for (const produce of producers) {
      writer.schedule(produce);
    }
    for (const produce of producers) {
      expect(produce).not.toHaveBeenCalled();
    }

    vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
    for (const produce of producers.slice(0, -1)) {
      expect(produce).not.toHaveBeenCalled();
    }
    expect(producers[4]).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 4 });
    writer.dispose();
  });

  it('arms the timer once per pending value, not re-armed on every schedule() call', () => {
    // A trailing debounce that restarts its timer on every call can postpone
    // the write indefinitely during a fast answer streak. Proof: schedule at
    // t=0, schedule again just before the window would have elapsed, and
    // confirm the write still lands at the *original* deadline.
    const writer = createCoalescedJsonWriter(KEY);
    writer.schedule(producing({ n: 1 }));
    vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS - 10);
    expect(localStorage.getItem(KEY)).toBeNull();

    writer.schedule(producing({ n: 2 }));
    vi.advanceTimersByTime(10);
    // Fired at the original t=DEFAULT_WRITE_DELAY_MS deadline, carrying
    // whatever was newest by then.
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 2 });
    writer.dispose();
  });

  it('flush() writes the pending value immediately and the already-armed timer does not write again', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const writer = createCoalescedJsonWriter(KEY);
    try {
      writer.schedule(producing({ n: 1 }));
      writer.flush();
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 1 });

      vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
      expect(setItemSpy).toHaveBeenCalledTimes(1);
    } finally {
      writer.dispose();
      setItemSpy.mockRestore();
    }
  });

  it('flush() is a no-op when nothing is pending', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const writer = createCoalescedJsonWriter(KEY);
    try {
      writer.flush();
      expect(setItemSpy).not.toHaveBeenCalled();
    } finally {
      writer.dispose();
      setItemSpy.mockRestore();
    }
  });

  it('dispose() flushes a pending value synchronously, so a value scheduled just before teardown is not lost', () => {
    const writer = createCoalescedJsonWriter(KEY);
    writer.schedule(producing({ n: 1 }));
    writer.dispose();
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 1 });
  });

  it('a schedule() call after dispose() is silently ignored, not queued for later', () => {
    const writer = createCoalescedJsonWriter(KEY);
    writer.dispose();
    writer.schedule(producing({ n: 99 }));
    vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS * 2);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('flushes on pagehide, even before the debounce window elapses (mobile tab discard)', () => {
    const writer = createCoalescedJsonWriter(KEY);
    writer.schedule(producing({ n: 1 }));
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 1 });
    writer.dispose();
  });

  it('flushes on visibilitychange -> hidden, even before the debounce window elapses', () => {
    const writer = createCoalescedJsonWriter(KEY);
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    try {
      writer.schedule(producing({ n: 1 }));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 1 });
    } finally {
      writer.dispose();
      if (originalDescriptor)
        Object.defineProperty(document, 'visibilityState', originalDescriptor);
    }
  });

  it('does not flush on visibilitychange -> visible', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const writer = createCoalescedJsonWriter(KEY);
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    try {
      writer.schedule(producing({ n: 1 }));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(setItemSpy).not.toHaveBeenCalled();
    } finally {
      writer.dispose();
      setItemSpy.mockRestore();
      if (originalDescriptor)
        Object.defineProperty(document, 'visibilityState', originalDescriptor);
    }
  });

  it('a write that fails under quota does not throw out of the timer callback, and is not retried on the next tick', () => {
    const writer = createCoalescedJsonWriter(KEY);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    try {
      writer.schedule(producing({ n: 1 }));
      expect(() => vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
    // The failed value was cleared before the write attempt (see storage.ts
    // comment on `flush`): once setItem starts succeeding again, nothing
    // fires a stale retry.
    vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS * 2);
    expect(localStorage.getItem(KEY)).toBeNull();
    writer.dispose();
  });

  it('a producer that throws does not take down the timer callback, and the failed value is not retried', () => {
    const writer = createCoalescedJsonWriter(KEY);
    writer.schedule(() => {
      throw new Error('serialisation bug');
    });
    expect(() => vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS)).not.toThrow();
    expect(localStorage.getItem(KEY)).toBeNull();

    // The writer stays usable for the next, healthy value.
    writer.schedule(producing({ n: 2 }));
    vi.advanceTimersByTime(DEFAULT_WRITE_DELAY_MS);
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 2 });
    writer.dispose();
  });

  it('honors a custom delayMs instead of the default window', () => {
    const writer = createCoalescedJsonWriter(KEY, 100);
    writer.schedule(producing({ n: 1 }));
    vi.advanceTimersByTime(99);
    expect(localStorage.getItem(KEY)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ n: 1 });
    writer.dispose();
  });
});
