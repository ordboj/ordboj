import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SrsState,
  initializeSrsState,
  calculateNextReview,
  isDue,
  isSrsState,
  localDateKey,
  Grade,
} from '@/lib/srs';
import { getVerbs, getAllConjugatedVerbs, Form, Verb } from '@/lib/verbs';

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

// --- answeredToday: the per-local-day answer counter -----------------------
//
// Stored under its own key rather than inside the SRS envelope above, so the
// irreplaceable per-item schedule and this cheap, regenerable counter cannot
// corrupt each other, and so adding it needs no version bump (and therefore no
// migration risk) on the progress payload.
//
// Shape: { version: 1, date: 'YYYY-MM-DD', count: number } — the
// { date, count } pair specified in
// docs/learning/session-shape-and-daily-goal.md, plus a version marker so a
// future shape change has something to migrate from. An absent key means "no
// answers recorded today", which is exactly what a first-ever read should
// yield, so there is no legacy shape to migrate forward.
const DAILY_COUNT_KEY = 'swedish-verbs-daily-count';
const DAILY_COUNT_VERSION = 1;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DailyCount {
  date: string;
  count: number;
}

// Tolerant read: absent key, unreadable storage, malformed JSON, a partial or
// wrongly-typed object, and a stale date all collapse to "0 answers today".
// A newer `version` is NOT rejected: `date` and `count` are this schema's core
// fields, and a payload that still carries them structurally is read rather
// than discarded, because discarding it would silently un-cap a day the
// learner has already spent. Anything whose date/count cannot be trusted
// resets to zero instead of guessing.
function readDailyCount(todayKey: string): DailyCount {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DAILY_COUNT_KEY);
  } catch (e) {
    // Storage access itself can throw (e.g. blocked cookies in some browsers).
    console.error('Failed to read daily answer count', e);
    return { date: todayKey, count: 0 };
  }
  if (!raw) {
    return { date: todayKey, count: 0 };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { date: todayKey, count: 0 };
    }
    const { date, count } = parsed as Partial<DailyCount>;
    if (typeof date !== 'string' || !DATE_KEY_PATTERN.test(date)) {
      return { date: todayKey, count: 0 };
    }
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
      return { date: todayKey, count: 0 };
    }
    // The local date has rolled over since the last write: the counter resets.
    if (date !== todayKey) {
      return { date: todayKey, count: 0 };
    }
    return { date, count: Math.floor(count) };
  } catch (e) {
    console.error('Failed to parse daily answer count', e);
    return { date: todayKey, count: 0 };
  }
}

// Import is the only untrusted entry point into the store. Storage reads
// stay permissive (whatever is at STORAGE_KEY is still the user's own
// data), but an imported file is rejected outright unless every item
// structurally matches SrsState, because the alternative — accepting a
// settings export or an arbitrary JSON file — replaces irreplaceable
// progress with nothing. Returns the migrated item map, or null if the
// payload is not a progress backup this version can read.
//
// Version ladder:
//   no version field -> legacy v1 bare map, ease rebase applied
//   version 1         -> envelope form of v1, ease rebase applied
//   version 2         -> current shape, taken as-is
//   version > 2       -> written by a newer build; rejected rather than
//                        guessed at, since the migration cannot be reasoned
//                        about here. The user's current store is left alone.
function parseImportedProgress(raw: string): Record<string, SrsState> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const envelope = parsed as { version?: unknown; items?: unknown };
  const unversioned = envelope.version === undefined;
  let items: unknown;
  let needsEaseRebase: boolean;

  if (unversioned) {
    items = parsed;
    needsEaseRebase = true;
  } else {
    const version = envelope.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return null;
    }
    if (version > STORAGE_VERSION) {
      return null;
    }
    items = envelope.items;
    needsEaseRebase = version < STORAGE_VERSION;
  }

  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    return null;
  }

  const entries = Object.entries(items as Record<string, unknown>);
  // A versioned envelope with zero items is a legitimate "no progress yet"
  // backup. A bare `{}` is indistinguishable from any other JSON object and
  // is not accepted as one.
  if (unversioned && entries.length === 0) {
    return null;
  }

  const validated: Record<string, SrsState> = {};
  for (const [itemId, state] of entries) {
    // All-or-nothing: one malformed item rejects the whole file rather than
    // silently importing a partial schedule the user cannot see is partial.
    if (!isSrsState(state)) {
      return null;
    }
    validated[itemId] = state;
  }

  return needsEaseRebase ? rebaseLegacyEase(validated) : validated;
}

export interface PracticeItem {
  verbId: string;
  infinitive: string;
  form: Form;
  itemId: string;
}

export function useSrsProgress(cefrLevels?: string[]) {
  const [srsStates, setSrsStates] = useState<Record<string, SrsState>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Hydrated synchronously (unlike srsStates, which waits on getVerbs) so the
  // session bound is never briefly evaluated against a phantom count of 0.
  const [dailyCount, setDailyCount] = useState<DailyCount>(() => readDailyCount(localDateKey()));
  const dailyCountHydrated = useRef(false);

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

  // Persist the daily counter on change. The first pass is skipped on purpose:
  // mount-time state is either what storage already holds or a reset derived
  // from it, and writing it back would overwrite a newer-version payload's
  // extra fields before the learner has answered anything.
  useEffect(() => {
    if (!dailyCountHydrated.current) {
      dailyCountHydrated.current = true;
      return;
    }
    try {
      localStorage.setItem(
        DAILY_COUNT_KEY,
        JSON.stringify({
          version: DAILY_COUNT_VERSION,
          date: dailyCount.date,
          count: dailyCount.count,
        }),
      );
    } catch (e) {
      // Quota or storage failure: the in-memory count still bounds this
      // session; only cross-reload continuity is lost.
      console.error('Failed to save daily answer count', e);
    }
  }, [dailyCount]);

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

    // Conjugate every verb once (O(V) total, no per-item scan of VERB_DATA
    // by infinitive) and index the results by id, so the loop below is
    // O(1) per verb instead of re-searching VERB_DATA for each one.
    const allConjugated = await getAllConjugatedVerbs();
    const conjugatedById = new Map(allConjugated.map((c) => [c.id, c]));

    // Check each verb's forms for availability
    for (const verb of verbs) {
      const conjugated = conjugatedById.get(verb.id);
      if (!conjugated) continue;

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
    // Every recorded answer counts once, right or wrong. Free practice does
    // not reach this function at all, so it cannot inflate the count.
    const todayKey = localDateKey();
    setDailyCount((prev) =>
      prev.date === todayKey
        ? { date: todayKey, count: prev.count + 1 }
        : { date: todayKey, count: 1 },
    );
  };

  // Export/Import for backup
  const exportData = () => {
    return JSON.stringify({ version: STORAGE_VERSION, items: srsStates }, null, 2);
  };

  // Accepts both versioned exports and legacy bare-map exports; legacy
  // imports get the same one-time ease rebase as legacy storage. Anything
  // that is not a structurally valid backup is rejected: false is returned
  // (the Settings page raises the error toast) and neither the in-memory
  // state nor localStorage is touched.
  const importData = (jsonString: string) => {
    const imported = parseImportedProgress(jsonString);
    if (imported === null) {
      console.error('Failed to import data: not a valid progress backup');
      return false;
    }
    setSrsStates(imported);
    return true;
  };

  // Reset all progress
  const resetProgress = () => {
    setSrsStates({});
    setDailyCount({ date: localDateKey(), count: 0 });
  };

  // Re-derived on every render rather than stored pre-resolved, so a session
  // left open across local midnight reports 0 again as soon as anything
  // re-renders instead of carrying yesterday's count into today.
  const answeredToday = dailyCount.date === localDateKey() ? dailyCount.count : 0;

  return {
    srsStates,
    isLoading,
    initializeAllItems,
    getDueItems,
    recordAnswer,
    answeredToday,
    exportData,
    importData,
    resetProgress,
  };
}
