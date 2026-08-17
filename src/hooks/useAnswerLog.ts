import { useCallback, useEffect, useRef } from 'react';
import {
  createCoalescedJsonWriter,
  DEFAULT_WRITE_DELAY_MS,
  type CoalescedJsonWriter,
} from '@/lib/storage';
import {
  ANSWER_LOG_CLEAR_EVENT,
  ANSWER_LOG_STORAGE_KEY,
  appendAnswerLogEntry,
  halveAnswerLog,
  parseAnswerLogPayload,
  serializeAnswerLog,
  type AnswerLogEntry,
  type AnswerLogEntryInput,
} from '@/lib/answerLog';

// The per-answer diagnostic log's write path.
// docs/product/2026-08-13-per-answer-review-log-decision.md, section 5.
//
// Deliberately its own hook, its own key (swedish-verbs-answer-log) and its
// own coalesced writer — never called from useSrsProgress or recordAnswer.
// recordAnswer(itemId, grade, modality) does not carry the frame or lure
// fields this log needs, and should not: those describe what was rendered,
// not what was scheduled. Splitting also means the two calls can drift (an
// answer recorded and not logged), which is the correct direction for a
// failure here to run: a missing log entry costs a diagnostic, a broken
// recordAnswer costs progress.
//
// Consecutive failed flushes before logging disables itself for the rest of
// the session and deletes the key. "Progress wins, the log drops" — the
// load-bearing rule of the decision's quota policy.
const MAX_CONSECUTIVE_FAILURES = 2;

export function useAnswerLog() {
  // In-memory buffer. A ref, not state: nothing in the UI reads the log
  // (decision section 8 — v1 ships no diagnostics screen), so re-rendering
  // on every append would only cost, never pay for anything.
  const entriesRef = useRef<AnswerLogEntry[]>([]);
  // Set on load when the stored payload is newer than this build
  // understands, and again after MAX_CONSECUTIVE_FAILURES flush failures.
  // While true, logAnswer is a no-op and nothing is scheduled.
  const disabledRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const writerRef = useRef<CoalescedJsonWriter | null>(null);

  const onFlushResult = useCallback((success: boolean) => {
    if (success) {
      consecutiveFailuresRef.current = 0;
      return;
    }

    consecutiveFailuresRef.current += 1;
    // Halve first, so a second failure right after already has a smaller
    // payload to fail on. Retried only on the next append (writer.schedule
    // is not re-armed here) — see decision section 5.
    entriesRef.current = halveAnswerLog(entriesRef.current);

    if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
      disabledRef.current = true;
      entriesRef.current = [];
      try {
        localStorage.removeItem(ANSWER_LOG_STORAGE_KEY);
      } catch (e) {
        // Best-effort: the log is already disabled and empty in memory
        // either way, and this store has no session state left to protect.
        console.error('Failed to remove answer log after repeated write failures', e);
      }
    }
  }, []);

  useEffect(() => {
    let replaced = false;
    try {
      const raw = localStorage.getItem(ANSWER_LOG_STORAGE_KEY);
      if (raw !== null) {
        const parsed = parseAnswerLogPayload(raw);
        if (parsed.newerVersion) {
          // Section 4: a store written by a newer build is left untouched
          // and this session logs nothing, the same guard useSrsProgress
          // applies to the progress store for the same situation.
          disabledRef.current = true;
        } else {
          entriesRef.current = parsed.entries;
          // Acceptance criterion 5: a corrupt payload (unparseable JSON, not
          // an object, missing/invalid version, or entries not an array)
          // does not stay on disk unchanged — it is replaced with a fresh
          // v1 envelope below, once the writer exists.
          replaced = parsed.replaced;
        }
      }
    } catch (e) {
      // localStorage.getItem can itself throw (sandboxed iframe, some
      // privacy modes). The log is disposable: start empty rather than
      // blocking the page on it.
      console.error('Failed to read answer log', e);
    }

    const writer = createCoalescedJsonWriter(
      ANSWER_LOG_STORAGE_KEY,
      DEFAULT_WRITE_DELAY_MS,
      onFlushResult,
    );
    writerRef.current = writer;

    if (replaced) {
      writer.schedule(() => serializeAnswerLog([]));
      writer.flush();
    }

    // The SRS hook and this hook are mounted independently, so a returned
    // clear function is not enough (decision section 6): resetProgress and
    // importData delete ANSWER_LOG_STORAGE_KEY from useSrsProgress.ts and
    // announce it, and every mounted instance of this hook must drop its
    // own in-memory buffer, or the next logAnswer would write the deleted
    // entries straight back to localStorage.
    const onCleared = () => {
      entriesRef.current = [];
      consecutiveFailuresRef.current = 0;
      writerRef.current?.cancelPending();
    };
    window.addEventListener(ANSWER_LOG_CLEAR_EVENT, onCleared);

    return () => {
      window.removeEventListener(ANSWER_LOG_CLEAR_EVENT, onCleared);
      writer.dispose();
      writerRef.current = null;
    };
    // onFlushResult is stable (empty deps below), so this still runs once
    // per mount, matching useSrsProgress's load effect: re-running would
    // re-read storage over in-memory entries.
  }, [onFlushResult]);

  const logAnswer = useCallback((entry: AnswerLogEntryInput, now: number = Date.now()) => {
    if (disabledRef.current) return;
    entriesRef.current = appendAnswerLogEntry(entriesRef.current, {
      ...entry,
      t: now,
    } as AnswerLogEntry);
    writerRef.current?.schedule(() => serializeAnswerLog(entriesRef.current));
  }, []);

  return { logAnswer };
}
