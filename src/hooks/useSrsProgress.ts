import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SrsState,
  initializeSrsState,
  calculateNextReview,
  isDue,
  isSrsState,
  Grade,
} from '@/lib/srs';
import { createConjugationProvider, type ConjugationItem } from '@/lib/srsProviders';
import { conjugationItemIdForInfinitive } from '@/lib/itemIds';
import type { Form } from '@/lib/verbs';
import { buildParticleSitting, countParticleReviewsDue } from '@/lib/particleQueue';

// How the learner produced the answer. Bundled here (rather than added as a
// second boolean later) because the hint-reporting change from
// docs/learning/lapse-handling.md needs the same payload.
export type AnswerModality = 'typed' | 'choice';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

// Storage schema version. Version 1 was the original unversioned blob: a
// bare Record<string, SrsState> at STORAGE_KEY. Version 2 wraps it in
// { version, items } and, on upgrade from the legacy blob, rebases ease
// factors that the old SM-2 formula drove to the floor (see
// docs/learning/lapse-handling.md, Migration). Version 3 rewrites
// conjugation item ids from `<index + 1>-<form>` to `<infinitive>-<form>`
// (issue #8). Each step runs exactly once because the migrated payload is
// persisted with the new version marker.
const STORAGE_VERSION = 3;

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

// The VERB_DATA order as frozen by src/data/verbData.orderPin.test.ts at the
// moment the v2 -> v3 id migration shipped. This is a *snapshot*, not a live
// read of VERB_DATA, and that is the entire point: a v2 store keys progress
// by position, so the only correct way to read it is against the table that
// produced those positions. Reading today's VERB_DATA instead would make the
// migration's meaning change every time a verb is added or moved — exactly
// the defect being fixed. Never edit this list; it is a record of the past.
//
// Growth up to this point was append-only (the pin test enforced it), so
// index N meant the same verb in every build that could have written a v2
// store. Indexes beyond this list cannot have been written by any released
// build; if one appears anyway its key is left untouched rather than guessed
// at (see migrateLegacyItemIds).
const LEGACY_VERB_INFINITIVES: readonly string[] = [
  'vara', // 1
  'ha', // 2
  'kunna', // 3
  'unna', // 4
  'få', // 5
  'bli', // 6
  'komma', // 7
  'vilja', // 8
  'göra', // 9
  'finna', // 10
  'ta', // 11
  'se', // 12
  'gå', // 13
  'säga', // 14
  'äga', // 15
  'betyda', // 16
  'ge', // 17
  'skriva', // 18
  'te sig', // 19
  'riva', // 20
  'börja', // 21
  'tro', // 22
  'tycka', // 23
  'veta', // 24
  'försöka', // 25
  'behöva', // 26
  'känna', // 27
  'läsa', // 28
  'ro', // 29
  'låta', // 30
  'stå', // 31
  'visa', // 32
  'använda', // 33
  'vända', // 34
  'hålla', // 35
  'tänka', // 36
  'söka', // 37
  'ligga', // 38
  'lägga', // 39
  'anse', // 40
  'öva', // 41
  'handla', // 42
  'öka', // 43
  'skapa', // 44
  'kapa', // 45
  'gälla', // 46
  'verka', // 47
  'tala', // 48
  'bära', // 49
  'höra', // 50
  'stänga', // 51
  'sätta', // 52
  'stiga', // 53
  'hälsa', // 54
  'bygga', // 55
  'ställa', // 56
];

// A v2 conjugation key: digits, a hyphen, one of the four scheduled forms.
// Anchored and form-restricted so it cannot match a v3 key (no infinitive is
// all digits) or a particle key (`pv:` namespace).
const LEGACY_CONJUGATION_ITEM_ID = /^(\d+)-(presens|preteritum|supinum|imperativ)$/;

// v2 -> v3: rewrite position-derived conjugation keys to infinitive-derived
// ones. Deterministic and offline-readable: the only input beyond the store
// itself is the frozen table above.
//
// Nothing is ever dropped. A key is left exactly as it was when it is not a
// legacy conjugation key (particle items, keys already migrated), when its
// index is outside the snapshot, or when the target key is already present —
// overwriting a real v3 item with a v2 one would destroy the newer of the
// two schedules, and no rule for merging them can be justified from the data.
// `state.itemId` is rewritten alongside the map key so the two never disagree.
function migrateLegacyItemIds(items: Record<string, SrsState>): Record<string, SrsState> {
  const migrated: Record<string, SrsState> = {};
  for (const [itemId, state] of Object.entries(items)) {
    const match = LEGACY_CONJUGATION_ITEM_ID.exec(itemId);
    const index = match?.[1];
    const form = match?.[2];
    const infinitive = index === undefined ? undefined : LEGACY_VERB_INFINITIVES[Number(index) - 1];
    if (infinitive === undefined || form === undefined) {
      migrated[itemId] = state;
      continue;
    }
    const stableId = conjugationItemIdForInfinitive(infinitive, form as Form);
    if (migrated[stableId] !== undefined || items[stableId] !== undefined) {
      migrated[itemId] = state;
      continue;
    }
    migrated[stableId] =
      state && typeof state === 'object' ? { ...state, itemId: stableId } : state;
  }
  return migrated;
}

// The forward migration ladder, in one place. Steps are cumulative and each
// is guarded by the version that introduced it, so a v1 payload gets both
// steps and a v2 payload gets only the id rewrite. `fromVersion` 1 also
// covers the legacy unversioned blob, which is what version 1 was.
function migrateItems(
  items: Record<string, SrsState>,
  fromVersion: number,
): Record<string, SrsState> {
  let result = items;
  if (fromVersion < 2) result = rebaseLegacyEase(result);
  if (fromVersion < 3) result = migrateLegacyItemIds(result);
  return result;
}

interface ParsedProgress {
  items: Record<string, SrsState>;
  // The version marker found in storage. `undefined` means the legacy bare
  // map, which predates versioning. Reported back so the caller can tell a
  // store written by a *newer* build apart from one this build understands —
  // see the read-only guard in the hook.
  storedVersion?: number;
}

// Accepts a versioned envelope or the legacy bare map (from storage or an
// old export file) and returns the item map, running every migration step
// the stored version is behind on. Unknown fields on individual items
// survive via spread; nothing is discarded.
function parseStoredProgress(raw: string): ParsedProgress {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { items: {} };
  }
  if (typeof parsed.version === 'number') {
    const items = parsed.items;
    const safeItems: Record<string, SrsState> =
      items && typeof items === 'object' && !Array.isArray(items) ? items : {};
    return {
      // A store from a *newer* build is taken verbatim: its keys may mean
      // something this build cannot see, and the session runs read-only
      // anyway (see the guard in the hook), so migrating it would be both
      // wrong and pointless.
      items: parsed.version > STORAGE_VERSION ? safeItems : migrateItems(safeItems, parsed.version),
      storedVersion: parsed.version,
    };
  }
  // Legacy unversioned blob: the bare state map itself, i.e. version 1.
  return { items: migrateItems(parsed as Record<string, SrsState>, 1) };
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
//   no version field -> legacy v1 bare map, ease rebase + id migration
//   version 1         -> envelope form of v1, ease rebase + id migration
//   version 2         -> id migration only (its ease values are already
//                        rebased; re-running the rebase would lift genuinely
//                        difficult items off the floor)
//   version 3         -> current shape, taken as-is
//   version > 3       -> written by a newer build; rejected rather than
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
  let fromVersion: number;

  if (unversioned) {
    items = parsed;
    fromVersion = 1;
  } else {
    const version = envelope.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return null;
    }
    if (version > STORAGE_VERSION) {
      return null;
    }
    items = envelope.items;
    fromVersion = version;
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

  return migrateItems(validated, fromVersion);
}

// One conjugation item: a (verb, form) pair. Kept as the hook's public item
// type; the shape now lives with the conjugation provider.
export type PracticeItem = ConjugationItem;

// `cefrLevels` filter semantics (see createConjugationProvider): `undefined`
// means "no filter, all verbs in scope"; any array - including `[]` - is an
// explicit selection and is honored exactly, so an empty selection matches
// zero verbs rather than silently falling back to "all verbs".
export function useSrsProgress(cefrLevels?: string[]) {
  const [srsStates, setSrsStates] = useState<Record<string, SrsState>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Set when the store on disk was written by a build newer than this one.
  // While true nothing is persisted: see the save effect.
  const [isReadOnly, setIsReadOnly] = useState(false);

  // The hook owns the store; a provider owns what there is to schedule.
  // Rebuilt only when the level selection changes, so getDueItems' identity
  // churns no more than it did before.
  const conjugationProvider = useMemo(() => createConjugationProvider(cefrLevels), [cefrLevels]);

  // Load from localStorage and initialize
  useEffect(() => {
    const initializeStates = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      let loaded: ParsedProgress = { items: {} };

      if (stored) {
        try {
          loaded = parseStoredProgress(stored);
        } catch (e) {
          console.error('Failed to parse SRS data', e);
        }
      }

      // Forward-compat guard. A store stamped with a version this build does
      // not know was written by a newer one, and its items may carry meaning
      // this code cannot see. Persisting over it would rewrite that newer
      // envelope as version 2 and silently discard whatever the newer build
      // recorded — the destructive half of a downgrade, on data that has no
      // backup. So the session runs read-only instead: the learner can
      // practise, nothing is written, and their real progress survives the
      // downgrade intact.
      const fromNewerBuild =
        loaded.storedVersion !== undefined && loaded.storedVersion > STORAGE_VERSION;
      if (fromNewerBuild) {
        console.error(
          `SRS store is version ${loaded.storedVersion}, newer than this build understands (${STORAGE_VERSION}). ` +
            'Running read-only: progress from this session will not be saved.',
        );
      }

      const newStates: Record<string, SrsState> = { ...loaded.items };
      for (const itemId of await conjugationProvider.listEagerInitIds()) {
        if (!newStates[itemId]) {
          newStates[itemId] = initializeSrsState(itemId);
        }
      }

      setIsReadOnly(fromNewerBuild);
      setSrsStates(newStates);
      setIsLoading(false);
    };

    initializeStates();
    // Deliberately once per mount: re-running would re-read storage over
    // in-memory answers. The provider's eager id list does not depend on the
    // level filter (see createConjugationProvider).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!isLoading && !isReadOnly) {
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
  }, [srsStates, isLoading, isReadOnly]);

  // Force refresh all items (useful for debugging)
  const initializeAllItems = () => {
    // This is now handled in the initial useEffect
    // But we keep this function for backward compatibility
    return;
  };

  // Get due items (randomized; scope and level filtering are the provider's)
  const getDueItems = useCallback(async (): Promise<PracticeItem[]> => {
    const available = await conjugationProvider.listAvailableItems();
    // An item with no stored state has not been initialized yet and is not
    // served — the same rule as before the provider split.
    const dueItems = available.filter((item) => {
      const state = srsStates[item.itemId];
      return state !== undefined && isDue(state);
    });

    // Shuffle the items using Fisher-Yates algorithm
    for (let i = dueItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = dueItems[i];
      const b = dueItems[j];
      // i and j are always in [0, length); the guard only satisfies
      // noUncheckedIndexedAccess without a non-null assertion.
      if (a === undefined || b === undefined) continue;
      dueItems[i] = b;
      dueItems[j] = a;
    }

    return dueItems;
  }, [srsStates, conjugationProvider]);

  // Record answer.
  //
  // `modality` is recorded and never branched on in v1 — deliberately. The
  // policy it will eventually drive is written down (a correct multiple-choice
  // answer earns no ease and a capped interval multiplier, because scheduling
  // recognition success at production intervals is how the scheduler comes to
  // believe a learner knows something they cannot produce; see
  // docs/learning/particle-verb-practice.md). Taking the parameter now means
  // the credit will attach to how an item *was* answered rather than to
  // whatever the settings say later, so switching modes can never
  // retroactively reinterpret history. Shipping no branch on it keeps
  // "the scheduler needs zero changes" literally true.
  const recordAnswer = (itemId: string, grade: Grade, modality: AnswerModality = 'typed') => {
    void modality;
    const currentState = srsStates[itemId] || initializeSrsState(itemId);
    const newState = calculateNextReview(currentState, grade);
    setSrsStates((prev) => ({
      ...prev,
      [itemId]: newState,
    }));
  };

  // The particle mode's sitting. Kept as a callback rather than derived
  // state so a caller decides when the queue is snapshotted — a sitting
  // recomputed mid-session would reshuffle under the learner's feet, which
  // is the bug PR #122 fixed for the conjugation deck.
  const getParticleSitting = useCallback(
    (particleDailyGoal: number) => buildParticleSitting({ srsStates, particleDailyGoal }),
    [srsStates],
  );

  const particleReviewsDue = useMemo(() => countParticleReviewsDue(srsStates), [srsStates]);

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
    // True when the stored schedule was written by a newer build, so this
    // session is not being persisted. Exposed so a surface can tell the
    // learner rather than letting them practise into a void.
    isReadOnly,
    initializeAllItems,
    getDueItems,
    getParticleSitting,
    particleReviewsDue,
    recordAnswer,
    exportData,
    importData,
    resetProgress,
  };
}
