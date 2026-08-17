// Shared localStorage write policy.
//
// Every store in this app holds progress that exists in exactly one
// browser and has no server copy, so a write path owes the learner two
// things: a failed write must never take the in-memory session with it,
// and the cost of one interaction must never grow with the size of the
// store.
//
// Both rules live here, once, for `swedish-verbs-srs-progress`
// (useSrsProgress), the only store that uses this module today.
// `swedish-verbs-settings` (useSettings, src/hooks/useSettings.ts) still
// writes directly via `localStorage.setItem` — it is a candidate for
// adopting this module in a follow-up, not a current consumer:
//
//  1. A write that fails — quota exceeded, Safari private mode, storage
//     disabled by policy — is reported and swallowed, never thrown. The
//     session keeps running on the in-memory copy, and because every write
//     serialises the whole store, the next successful write persists
//     everything the failed one carried.
//  2. Writes are coalesced. Serialising a store is O(store size), so doing
//     it once per answer makes every answer pay for the whole deck: 228
//     conjugation items today, thousands once the 1537-verb table ships
//     (issue #253). The writer therefore takes a `serialize` producer, not a
//     pre-serialised value: a burst of answers records only the newest
//     producer, and serialisation runs once per window, at flush. This caps
//     both write frequency and serialisation frequency — each flush is
//     still O(store size), but answering is not. Storage v3's sparse
//     persistence (issue #53: untouched items are not written) bounds the
//     size of what a flush serialises.
//
// Coalescing buys that bound with a little staleness, so the writer flushes
// on `pagehide` and on `visibilitychange` → hidden: the two events a mobile
// browser reliably fires before it discards a tab. `beforeunload` is
// deliberately not used — it does not fire dependably on iOS and would only
// add a third path to the same guarantee.

// Window a write may wait before it lands. Short enough that a tab killed
// without any lifecycle event loses at most one answer, long enough that a
// burst of answers collapses into a single serialisation.
export const DEFAULT_WRITE_DELAY_MS = 500;

// Reading `localStorage` (not just writing) throws in a sandboxed iframe and
// in some privacy modes, so even the availability probe is guarded.
function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// Serialise and write one store. Returns whether the value reached disk;
// never throws, so a caller can keep the in-memory session alive on false.
export function writeJson(key: string, value: unknown): boolean {
  const storage = getStorage();
  if (storage === null) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Failed to persist ${key}`, e);
    return false;
  }
}

// Write an already-serialised payload. Same never-throws contract as
// writeJson; split out so the coalesced writer can defer serialisation to
// flush time without double-encoding the result.
export function writeSerialized(key: string, serialized: string): boolean {
  const storage = getStorage();
  if (storage === null) return false;
  try {
    storage.setItem(key, serialized);
    return true;
  } catch (e) {
    console.error(`Failed to persist ${key}`, e);
    return false;
  }
}

export interface CoalescedJsonWriter {
  // Record the newest producer for this store's serialised form. The
  // producer is not called here: at most one serialisation happens per
  // window no matter how often this is called, and only the newest producer
  // ever runs.
  schedule(serialize: () => string): void;
  // Write any pending value immediately.
  flush(): void;
  // Drop any pending value without writing it. For a caller whose store was
  // just deleted out from under it (the answer log after resetProgress or
  // importData clears ANSWER_LOG_STORAGE_KEY): the pending producer still
  // serialises the pre-clear buffer, and calling flush() here would write
  // those bytes straight back. cancelPending() discards them instead, so
  // the deleted key stays deleted until the next real schedule().
  cancelPending(): void;
  // Flush, then stop listening. Losing a pending answer on unmount would be
  // the exact data loss this module exists to prevent, so dispose writes.
  dispose(): void;
}

export function createCoalescedJsonWriter(
  key: string,
  delayMs: number = DEFAULT_WRITE_DELAY_MS,
  // Reports whether the most recent flush's write reached disk. Optional
  // because the sole consumer at this module's creation (useSrsProgress)
  // does not need it: a failed progress write is swallowed and retried on
  // the next schedule() regardless. The answer log
  // (src/hooks/useAnswerLog.ts) is the first caller that acts differently on
  // failure — halving its buffer, then disabling itself after a second
  // consecutive failure — and that policy needs the pass/fail signal that
  // writeSerialized already computes and previously threw away here.
  onFlushResult?: (success: boolean) => void,
): CoalescedJsonWriter {
  // `null` means nothing is pending.
  let pending: { serialize: () => string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending === null) return;
    const { serialize } = pending;
    // Cleared before the write: a value that fails on quota is not retried
    // forever, because the next schedule carries the whole store anyway.
    pending = null;
    let success = false;
    try {
      success = writeSerialized(key, serialize());
    } catch (e) {
      // A producer that throws must not take down the timer callback or a
      // pagehide handler; the never-throws contract covers the whole flush.
      console.error(`Failed to serialise ${key}`, e);
    }
    onFlushResult?.(success);
  };

  const canListen = typeof window !== 'undefined' && typeof document !== 'undefined';

  const onPageHide = () => flush();
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  if (canListen) {
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    schedule(serialize: () => string) {
      if (disposed) return;
      pending = { serialize };
      // Armed once, not re-armed on each call. A trailing debounce that
      // restarts its timer on every keystroke-speed answer can postpone the
      // write indefinitely; arming once bounds staleness at delayMs.
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          flush();
        }, delayMs);
      }
    },

    flush,

    cancelPending() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      flush();
      if (canListen) {
        window.removeEventListener('pagehide', onPageHide);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    },
  };
}
