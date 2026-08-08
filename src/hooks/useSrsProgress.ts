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

// `cefrLevels` filter semantics (see getDueItems below): `undefined` means
// "no filter, all verbs in scope"; any array - including `[]` - is an
// explicit selection and is honored exactly, so an empty selection matches
// zero verbs rather than silently falling back to "all verbs".
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

    // CEFR filter semantics: `cefrLevels === undefined` means the caller did
    // not opt into filtering at all, so every verb is in scope. Any array
    // value, including an empty one, is the caller stating an explicit
    // selection, and the result must respect exactly that selection - an
    // empty array must yield zero verbs, never "no filter". Silently
    // widening an empty selection back to "all verbs" is the bug this
    // guards against (see issue #137): it would let a UI state that looks
    // like "nothing selected" quietly practice the entire deck.
    const verbs =
      cefrLevels === undefined
        ? allVerbs
        : allVerbs.filter((verb) => verb.cefr && cefrLevels.includes(verb.cefr));

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
    exportData,
    importData,
    resetProgress,
  };
}
