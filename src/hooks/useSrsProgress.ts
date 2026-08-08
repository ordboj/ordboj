import { useState, useEffect, useCallback } from 'react';
import { SrsState, initializeSrsState, calculateNextReview, isDue, Grade } from '@/lib/srs';
import { getVerbs, Form, Verb, conjugateVerb } from '@/lib/verbs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

// Storage schema version. Version 1 was the original unversioned blob: a
// bare Record<string, SrsState> at STORAGE_KEY. Version 2 wraps it in
// { version, items } and, on upgrade from the legacy blob, rebases ease
// factors that the old SM-2 formula drove to the floor (see
// docs/learning/lapse-handling.md, Migration). The rebase runs exactly
// once because the migrated payload is persisted with the version marker.
const STORAGE_VERSION = 2;

// Legacy -0.80-per-miss ease penalty pinned items at the 1.3 floor after a
// single early miss. An item with repetitions >= 2 has since proven itself,
// so its floor-stuck ease reflects the old formula, not real difficulty.
const REBASE_EASE_MIN = 1.8;
const REBASE_MIN_REPETITIONS = 2;

function rebaseLegacyEase(items: Record<string, SrsState>): Record<string, SrsState> {
  const rebased: Record<string, SrsState> = {};
  for (const [itemId, state] of Object.entries(items)) {
    if (
      state &&
      typeof state === 'object' &&
      typeof state.easeFactor === 'number' &&
      typeof state.repetitions === 'number' &&
      state.repetitions >= REBASE_MIN_REPETITIONS
    ) {
      rebased[itemId] = { ...state, easeFactor: Math.max(state.easeFactor, REBASE_EASE_MIN) };
    } else {
      rebased[itemId] = state;
    }
  }
  return rebased;
}

// Accepts either the version-2 envelope or the legacy bare map (from
// storage or an old export file) and returns the item map, applying the
// one-time ease rebase to legacy data. Unknown fields on individual items
// survive via spread; nothing is discarded.
function parseStoredProgress(raw: string): Record<string, SrsState> {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  if (typeof parsed.version === 'number') {
    // Versioned envelope (this version or newer): take the items as-is.
    const items = parsed.items;
    return items && typeof items === 'object' && !Array.isArray(items) ? items : {};
  }
  // Legacy unversioned blob: the bare state map itself.
  return rebaseLegacyEase(parsed as Record<string, SrsState>);
}

export interface PracticeItem {
  verbId: string;
  infinitive: string;
  form: Form;
  itemId: string;
}

// In-session relearning queue (docs/learning/lapse-handling.md). A wrong
// answer (grade 0) must not just get the SM-2 dueAt+1day penalty; it must
// be re-asked before the sitting ends, so the learner gets a genuine
// second retrieval attempt instead of seeing the correct form once and
// moving on. REQUEUE_GAP intervening items is enough to clear working
// memory without pushing the item so far out that a short queue never
// re-shows it. Counters are session-scoped (plain hook state, reset on
// remount) rather than persisted: the note's "per item per day" cap
// depends on a sitting/day boundary the app does not implement yet
// (see docs/learning/session-shape-and-daily-goal.md); until that lands,
// "per sitting" is the closest honest approximation and does not require
// a localStorage schema change.
const REQUEUE_GAP = 3;
const MAX_REQUEUES_PER_ITEM = 2;

// Where in the queue a lapsed item should reappear: at least REQUEUE_GAP
// items after its current position, clamped to the end of the queue so it
// is never inserted past items that don't exist yet.
export function getRequeueInsertIndex(currentIndex: number, queueLength: number): number {
  return Math.min(currentIndex + 1 + REQUEUE_GAP, queueLength);
}

export function useSrsProgress(cefrLevels?: string[]) {
  const [srsStates, setSrsStates] = useState<Record<string, SrsState>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Per-item requeue count for the current sitting only; see the
  // in-session relearning queue comment above. Never persisted.
  const [requeueCounts, setRequeueCounts] = useState<Record<string, number>>({});

  // Load from localStorage and initialize
  useEffect(() => {
    const initializeStates = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      let loadedStates: Record<string, SrsState> = {};

      if (stored) {
        try {
          loadedStates = parseStoredProgress(stored);
        } catch (e) {
          console.error('Failed to parse SRS data', e);
        }
      }

      // Initialize all verb+form combinations
      const forms: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];
      const newStates: Record<string, SrsState> = { ...loadedStates };

      const verbs = await getVerbs();

      for (const verb of verbs) {
        for (const form of forms) {
          const itemId = `${verb.id}-${form}`;
          if (!newStates[itemId]) {
            newStates[itemId] = initializeSrsState(itemId);
          }
        }
      }

      setSrsStates(newStates);
      setIsLoading(false);
    };

    initializeStates();
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!isLoading) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ version: STORAGE_VERSION, items: srsStates }),
        );
      } catch (e) {
        // Quota or storage failure: keep the in-memory session alive; the
        // next successful write persists the full current state anyway.
        console.error('Failed to save SRS data', e);
      }
    }
  }, [srsStates, isLoading]);

  // Force refresh all items (useful for debugging)
  const initializeAllItems = () => {
    // This is now handled in the initial useEffect
    // But we keep this function for backward compatibility
    return;
  };

  // Get due items (randomized and filtered by CEFR level)
  const getDueItems = useCallback(async (): Promise<PracticeItem[]> => {
    const forms: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];
    const dueItems: PracticeItem[] = [];

    const allVerbs = await getVerbs();

    // Filter verbs by CEFR level if specified
    const verbs =
      cefrLevels && cefrLevels.length > 0
        ? allVerbs.filter((verb) => verb.cefr && cefrLevels.includes(verb.cefr))
        : allVerbs;

    // Check each verb's forms for availability
    for (const verb of verbs) {
      const conjugated = await conjugateVerb(verb.infinitive);

      for (const form of forms) {
        // Skip forms that are not available
        if (conjugated[form] === '(not available)' || !conjugated[form]) {
          continue;
        }

        const itemId = `${verb.id}-${form}`;
        const state = srsStates[itemId];
        if (state && isDue(state)) {
          dueItems.push({
            verbId: verb.id,
            infinitive: verb.infinitive,
            form,
            itemId,
          });
        }
      }
    }

    // Shuffle the items using Fisher-Yates algorithm
    for (let i = dueItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dueItems[i], dueItems[j]] = [dueItems[j], dueItems[i]];
    }

    return dueItems;
  }, [srsStates, cefrLevels]);

  // Record answer
  const recordAnswer = (itemId: string, grade: Grade) => {
    const currentState = srsStates[itemId] || initializeSrsState(itemId);
    const newState = calculateNextReview(currentState, grade);
    setSrsStates((prev) => ({
      ...prev,
      [itemId]: newState,
    }));
  };

  // Records the answer (scheduling is unaffected: calculateNextReview
  // already sets dueAt to tomorrow-or-later on a lapse) and, for a wrong
  // answer, returns an updated copy of `queue` with `item` re-inserted
  // `REQUEUE_GAP` items ahead so it is re-asked before the sitting ends,
  // up to `MAX_REQUEUES_PER_ITEM` times per item per sitting. Callers that
  // don't need in-session relearning can keep using `recordAnswer`
  // directly; this is additive and does not change its behavior.
  const recordAnswerWithRequeue = (
    item: PracticeItem,
    grade: Grade,
    queue: PracticeItem[],
    currentIndex: number,
  ): PracticeItem[] => {
    recordAnswer(item.itemId, grade);

    if (grade !== 0) {
      return queue;
    }

    const priorRequeues = requeueCounts[item.itemId] ?? 0;
    if (priorRequeues >= MAX_REQUEUES_PER_ITEM) {
      return queue;
    }

    setRequeueCounts((prev) => ({ ...prev, [item.itemId]: priorRequeues + 1 }));

    const insertAt = getRequeueInsertIndex(currentIndex, queue.length);
    const requeued = [...queue];
    requeued.splice(insertAt, 0, item);
    return requeued;
  };

  // Export/Import for backup
  const exportData = () => {
    return JSON.stringify({ version: STORAGE_VERSION, items: srsStates }, null, 2);
  };

  // Accepts both versioned exports and legacy bare-map exports; legacy
  // imports get the same one-time ease rebase as legacy storage.
  const importData = (jsonString: string) => {
    try {
      const imported = parseStoredProgress(jsonString);
      setSrsStates(imported);
      return true;
    } catch (e) {
      console.error('Failed to import data', e);
      return false;
    }
  };

  // Reset all progress
  const resetProgress = () => {
    setSrsStates({});
  };

  return {
    srsStates,
    isLoading,
    initializeAllItems,
    getDueItems,
    recordAnswer,
    recordAnswerWithRequeue,
    exportData,
    importData,
    resetProgress,
  };
}
