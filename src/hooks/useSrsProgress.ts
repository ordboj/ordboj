import { useState, useEffect, useCallback } from 'react';
import {
  SrsState,
  initializeSrsState,
  calculateNextReview,
  isDue,
  isSrsState,
  Grade,
} from '@/lib/srs';
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
  };

  return {
    srsStates,
    isLoading,
    initializeAllItems,
    getDueItems,
    recordAnswer,
    exportData,
    importData,
    resetProgress,
  };
}
