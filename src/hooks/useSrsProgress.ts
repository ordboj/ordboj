import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  SrsState,
  initializeSrsState,
  calculateNextReview,
  isDue,
  isPristineSrsState,
  isSrsState,
  isStoredSrsState,
  Grade,
  type AnswerModality,
} from '@/lib/srs';
import {
  createConjugationProvider,
  SCHEDULED_FORMS,
  type ConjugationItem,
} from '@/lib/srsProviders';
import { getVerbs } from '@/lib/verbs';
import { buildParticleSitting, countParticleReviewsDue } from '@/lib/particleQueue';
import { createCoalescedJsonWriter, type CoalescedJsonWriter } from '@/lib/storage';

// How the learner produced the answer. The type moved to src/lib/srs.ts when
// the scheduler started branching on it (#388); re-exported here so existing
// importers keep working.
export type { AnswerModality } from '@/lib/srs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

// One-shot copy of the pre-v3 payload, written verbatim before the first v3
// save. CLAUDE.md calls stored progress irreplaceable and there is no
// backend to recover from; a migration that overwrites its own input in the
// same tick leaves nothing to re-run against if a defect surfaces later.
// Never overwritten once present, so the oldest (pre-migration) copy is the
// one that survives.
const LEGACY_BACKUP_KEY = 'swedish-verbs-srs-progress-backup-pre-v3';

// Storage schema version. Version 1 was the original unversioned blob: a
// bare Record<string, SrsState> at STORAGE_KEY. Version 2 wraps it in
// { version, items } and, on upgrade from the legacy blob, rebases ease
// factors that the old SM-2 formula drove to the floor (see
// docs/learning/lapse-handling.md, Migration). The rebase runs exactly
// once because the migrated payload is persisted with the version marker.
//
// Version 3 (issue #53) changes what a stored item *is*, three ways:
//   - the map key is the canonical verb id from src/lib/verbs.ts, not a
//     position in VERB_DATA (see migrateConjugationKeys below);
//   - `itemId` is not written, because it only ever repeated the key;
//   - an untouched item is not written at all, because it is derivable
//     (see isPristineSrsState in src/lib/srs.ts).
// The bump matters even though older builds tolerate the missing field: the
// #241 forward-compat guard makes a version-2 build treat a version-3 store
// as read-only rather than eagerly re-seeding it under the old key scheme
// and reporting the learner's whole schedule as lost.
//
// NOTE: the issue text asks for an envelope `{ v: 1, items }`. It was
// written before version 2 shipped. Renaming the field and restarting the
// counter would put two different meanings on "version 1" inside stores that
// already exist in learners' browsers with nothing in the payload to tell
// them apart, so the field name and the monotonic counter are kept and only
// the item shape changes. Flagged for staff-engineer / product-manager
// sign-off in the PR rather than decided here.
export const STORAGE_VERSION = 3;

// The ease rebase belongs to the v1 -> v2 upgrade only. Anything already
// stamped version 2 or later was written by the flat-delta scheduler and
// must be taken at face value, whatever its ease.
const EASE_REBASE_BEFORE_VERSION = 2;

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

// A conjugation key written under the old positional scheme: `12-presens`,
// where `12` is VERB_DATA index + 1. Anchored on `\d+` so it can never match
// a key built from an infinitive - no Swedish infinitive starts with a digit
// (verified across all 56 rows of VERB_DATA) - and on the four scheduled
// forms so it can never match the `pv:` particle namespace either.
const LEGACY_CONJUGATION_KEY = new RegExp(`^(\\d+)-(${SCHEDULED_FORMS.join('|')})$`);

// Re-key positional conjugation ids onto the canonical verb id.
//
// `canonicalVerbIds` is `(await getVerbs()).map(v => v.id)` in table order,
// so position p (1-based, as the old key encoded it) maps to
// `canonicalVerbIds[p - 1]`. While verbs.ts still returns `String(index + 1)`
// this is the identity map and rewrites nothing; the moment the id scheme
// becomes the infinitive, the same code turns `12-presens` into
// `tala-presens`. Running it on *every* read rather than once at the version
// bump is deliberate: it means the store repairs itself whichever release
// the id-scheme change lands in, instead of depending on the two shipping in
// the same commit.
//
// Nothing is ever dropped for being unrecognized. A positional key past the
// end of today's table (a verb deleted since) is kept verbatim: it is the
// learner's data, and this code has no basis to decide what it meant.
function migrateConjugationKeys(
  items: Record<string, SrsState>,
  canonicalVerbIds: string[],
): Record<string, SrsState> {
  const migrated: Record<string, SrsState> = {};
  const rekeyed: Array<{ from: string; to: string; state: SrsState }> = [];

  // Pass 1 places every key that needs no rewrite. A key that is already
  // canonical therefore always wins a collision with a positional twin,
  // independently of Object.entries order.
  for (const [itemId, state] of Object.entries(items)) {
    const match = LEGACY_CONJUGATION_KEY.exec(itemId);
    const position = match ? Number(match[1]) : 0;
    const canonicalVerbId = position > 0 ? canonicalVerbIds[position - 1] : undefined;
    if (!match || canonicalVerbId === undefined || `${canonicalVerbId}-${match[2]}` === itemId) {
      migrated[itemId] = state;
      continue;
    }
    rekeyed.push({ from: itemId, to: `${canonicalVerbId}-${match[2]}`, state });
  }

  for (const { from, to, state } of rekeyed) {
    if (migrated[to] !== undefined) {
      console.warn(
        `SRS migration: legacy key "${from}" maps to "${to}", which already has progress. ` +
          'Keeping the existing entry and discarding the legacy one.',
      );
      continue;
    }
    migrated[to] = state.itemId === undefined ? state : { ...state, itemId: to };
  }

  return migrated;
}

// What actually goes to disk under version 3: no `itemId` (it is the key),
// and no untouched item (it is derivable - see isPristineSrsState). Anything
// this build does not recognize on an item survives the round trip via
// spread.
function toStoredItems(
  items: Record<string, SrsState>,
  derivableIds: Set<string>,
  now: number,
): Record<string, Omit<SrsState, 'itemId'>> {
  const stored: Record<string, Omit<SrsState, 'itemId'>> = {};
  for (const [itemId, state] of Object.entries(items)) {
    // Only an id the loader re-creates on its own may be omitted. Particle
    // items are created on first presentation, never eagerly, so a
    // repetitions-0 particle item is real state and is always written.
    if (derivableIds.has(itemId) && isPristineSrsState(state, now)) continue;
    const { itemId: _legacyItemId, ...rest } = state;
    stored[itemId] = rest;
  }
  return stored;
}

function serializeStore(
  items: Record<string, SrsState>,
  derivableIds: Set<string>,
  now: number,
): string {
  return JSON.stringify({
    version: STORAGE_VERSION,
    items: toStoredItems(items, derivableIds, now),
  });
}

interface ParsedProgress {
  items: Record<string, SrsState>;
  // The version marker found in storage. `undefined` means the legacy bare
  // map, which predates versioning. Reported back so the caller can tell a
  // store written by a *newer* build apart from one this build understands —
  // see the read-only guard in the hook.
  storedVersion?: number;
}

// Accepts either the version-2 envelope or the legacy bare map (from
// storage or an old export file) and returns the item map, applying the
// one-time ease rebase to legacy data. Unknown fields on individual items
// survive via spread; nothing is discarded.
function parseStoredProgress(raw: string): ParsedProgress {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { items: {} };
  }
  if (typeof parsed.version === 'number') {
    // Versioned envelope (this version or newer): take the items as-is.
    const items = parsed.items;
    return {
      items: items && typeof items === 'object' && !Array.isArray(items) ? items : {},
      storedVersion: parsed.version,
    };
  }
  // Legacy unversioned blob: the bare state map itself.
  return { items: rebaseLegacyEase(parsed as Record<string, SrsState>) };
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
//   version 2         -> flat-delta scheduler, every item carries itemId
//   version 3         -> current shape: itemId optional, dueAt range-checked
//   version > 3       -> written by a newer build; rejected rather than
//                        guessed at, since the migration cannot be reasoned
//                        about here. The user's current store is left alone.
//
// Whatever the version, the keys are then run through
// migrateConjugationKeys: a backup taken before the id-scheme change is
// still a valid backup and must land on today's keys.
function parseImportedProgress(
  raw: string,
  canonicalVerbIds: string[],
): Record<string, SrsState> | null {
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
  // Only a payload that declares itself version 3 or later may omit itemId.
  // A v1/v2 backup always carried the field, so its absence there is
  // corruption and still rejects the file.
  let itemIdOptional: boolean;

  if (unversioned) {
    items = parsed;
    needsEaseRebase = true;
    itemIdOptional = false;
  } else {
    const version = envelope.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return null;
    }
    if (version > STORAGE_VERSION) {
      return null;
    }
    items = envelope.items;
    needsEaseRebase = version < EASE_REBASE_BEFORE_VERSION;
    itemIdOptional = version >= 3;
  }

  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    return null;
  }

  const entries = Object.entries(items as Record<string, unknown>);
  // An empty item map is rejected whatever the envelope says. Import is the
  // only restore path there is, and applying an empty map wipes the store
  // while the Settings page reports success - the same class of destruction
  // this validator exists to stop. A backup with no progress in it has
  // nothing to restore anyway.
  if (entries.length === 0) {
    return null;
  }

  const validated: Record<string, SrsState> = {};
  for (const [itemId, state] of entries) {
    // The key is the item id under version 3, so an empty one is not
    // addressable state.
    if (typeof itemId !== 'string' || itemId.length === 0) {
      return null;
    }
    // All-or-nothing: one malformed item rejects the whole file rather than
    // silently importing a partial schedule the user cannot see is partial.
    if (itemIdOptional) {
      if (!isStoredSrsState(state)) return null;
      validated[itemId] = state;
    } else {
      if (!isSrsState(state)) return null;
      validated[itemId] = state;
    }
  }

  const rebased = needsEaseRebase ? rebaseLegacyEase(validated) : validated;
  return migrateConjugationKeys(rebased, canonicalVerbIds);
}

// One conjugation item: a (verb, form) pair. Kept as the hook's public item
// type; the shape now lives with the conjugation provider.
export type PracticeItem = ConjugationItem;

// `cefrLevels` filter semantics (see createConjugationProvider): `undefined`
// means "no filter, all verbs in scope"; any array - including `[]` - is an
// explicit selection and is honored exactly, so an empty selection matches
// zero verbs rather than silently falling back to "all verbs". #350: the
// same selection also scopes particle *introductions* (getParticleSitting)
// but never particle due reviews or recall unlocks — see
// buildParticleSitting.
export function useSrsProgress(cefrLevels?: string[]) {
  const [srsStates, setSrsStates] = useState<Record<string, SrsState>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Set when the store on disk was written by a build newer than this one.
  // While true nothing is persisted: see the save effect.
  const [isReadOnly, setIsReadOnly] = useState(false);
  // Ids the loader re-creates on its own, so the save path knows which
  // untouched items it is allowed to leave out. Filled at load; empty until
  // then, which fails safe (nothing is omitted).
  const derivableIdsRef = useRef<Set<string>>(new Set());
  // Canonical verb id per VERB_DATA position, captured at load so the
  // synchronous import path can re-key a backup without awaiting getVerbs().
  const canonicalVerbIdsRef = useRef<string[]>([]);

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

      // Re-key before anything else looks at the map, so every consumer -
      // eager init, due filtering, the save effect - sees one id scheme.
      const canonicalVerbIds = (await getVerbs()).map((verb) => verb.id);
      canonicalVerbIdsRef.current = canonicalVerbIds;
      const migratedItems = migrateConjugationKeys(loaded.items, canonicalVerbIds);

      // Keep the pre-v3 bytes verbatim before the first v3 write replaces
      // them. Written once and never overwritten, so a second launch cannot
      // clobber the pre-migration copy with a post-migration one.
      if (
        stored !== null &&
        !fromNewerBuild &&
        (loaded.storedVersion === undefined || loaded.storedVersion < STORAGE_VERSION) &&
        localStorage.getItem(LEGACY_BACKUP_KEY) === null
      ) {
        try {
          localStorage.setItem(LEGACY_BACKUP_KEY, stored);
        } catch (e) {
          // A backup that cannot be written must not stop the learner from
          // practising; the migration below is still safe on its own.
          console.error('Failed to back up pre-v3 SRS data', e);
        }
      }

      const eagerInitIds = await conjugationProvider.listEagerInitIds();
      derivableIdsRef.current = new Set(eagerInitIds);

      const newStates: Record<string, SrsState> = { ...migratedItems };
      for (const itemId of eagerInitIds) {
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

  // The coalesced writer for this store (see src/lib/storage.ts): created
  // once on mount, disposed on unmount. Disposing flushes any pending value
  // synchronously, so an answer recorded just before navigation away is not
  // lost; the writer also flushes itself on pagehide and on
  // visibilitychange -> hidden.
  const writerRef = useRef<CoalescedJsonWriter | null>(null);

  useEffect(() => {
    const writer = createCoalescedJsonWriter(STORAGE_KEY);
    writerRef.current = writer;
    return () => {
      writer.dispose();
      writerRef.current = null;
    };
  }, []);

  // Save to localStorage. The writer coalesces a burst of answers into one
  // write per window and evaluates serializeStore only at flush, so the
  // per-answer cost does not grow with the size of the store (issue #253).
  // It also swallows a failed write (quota, storage disabled) instead of
  // throwing, so the in-memory session survives without a try/catch here.
  useEffect(() => {
    if (!isLoading && !isReadOnly) {
      writerRef.current?.schedule(() =>
        serializeStore(srsStates, derivableIdsRef.current, Date.now()),
      );
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
    // A missing key means "never practised", and a never-practised item is
    // due now. Version 3 stops persisting untouched items (issue #53), so
    // absence is the normal representation of a new item, not an error
    // state; treating it as "not due" would hide the entire unpractised deck
    // the moment eager initialization goes away.
    const dueItems = available.filter((item) => {
      const state = srsStates[item.itemId];
      return state === undefined || isDue(state);
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

  // Record answer. `modality` is passed through to the scheduler, which
  // branches on it since #388: a correct choice answer earns no ease and a
  // capped interval multiplier, because scheduling recognition success at
  // production intervals is how the scheduler comes to believe a learner
  // knows something they cannot produce (see
  // docs/learning/2026-08-08-discrimination-exercise.md). The credit
  // attaches to how the item *was* answered, so switching modes can never
  // retroactively reinterpret history.
  const recordAnswer = (itemId: string, grade: Grade, modality: AnswerModality = 'typed') => {
    const currentState = srsStates[itemId] || initializeSrsState(itemId);
    const newState = calculateNextReview(currentState, grade, modality);
    setSrsStates((prev) => ({
      ...prev,
      [itemId]: newState,
    }));
  };

  // The particle mode's sitting. Kept as a callback rather than derived
  // state so a caller decides when the queue is snapshotted — a sitting
  // recomputed mid-session would reshuffle under the learner's feet, which
  // is the bug PR #122 fixed for the conjugation deck.
  // #350: the same cefrLevels selection that scopes conjugation items above
  // also scopes which particle verbs are offered as new introductions —
  // never which ones are due for review. See
  // docs/learning/2026-08-09-particle-cefr-majority-decision.md, "The
  // residual risk, named".
  const getParticleSitting = useCallback(
    (particleDailyGoal: number) =>
      buildParticleSitting({ srsStates, particleDailyGoal, cefrLevels }),
    [srsStates, cefrLevels],
  );

  const particleReviewsDue = useMemo(() => countParticleReviewsDue(srsStates), [srsStates]);

  // Export/Import for backup. The exported payload is the same envelope the
  // store persists — same version, same sparse item set — so a backup and
  // the live store cannot describe different things.
  const exportData = () => {
    return JSON.stringify(
      {
        version: STORAGE_VERSION,
        items: toStoredItems(srsStates, derivableIdsRef.current, Date.now()),
      },
      null,
      2,
    );
  };

  // Reset and import are one-shot, user-confirmed actions, so they must not
  // sit in the coalesced 500 ms window: a tab killed right after "Reset all
  // progress" (or a successful import) would otherwise still hold the OLD
  // store on disk, and the action would appear not to have taken after
  // reload. Going through the writer (schedule + flush) rather than a bare
  // setItem also clears any pending pre-action snapshot, so a stale flush
  // cannot land over the new bytes later. The map is passed in explicitly
  // because the matching setSrsStates has not re-rendered yet when this
  // runs. Same isLoading/isReadOnly guard as the save effect.
  const persistNow = (items: Record<string, SrsState>) => {
    if (isLoading || isReadOnly) return;
    const writer = writerRef.current;
    if (!writer) return;
    writer.schedule(() => serializeStore(items, derivableIdsRef.current, Date.now()));
    writer.flush();
  };

  // Accepts both versioned exports and legacy bare-map exports; legacy
  // imports get the same one-time ease rebase as legacy storage. Anything
  // that is not a structurally valid backup is rejected: false is returned
  // (the Settings page raises the error toast) and neither the in-memory
  // state nor localStorage is touched.
  const importData = (jsonString: string) => {
    const imported = parseImportedProgress(jsonString, canonicalVerbIdsRef.current);
    if (imported === null) {
      console.error('Failed to import data: not a valid progress backup');
      return false;
    }
    setSrsStates(imported);
    persistNow(imported);
    return true;
  };

  // Reset all progress. "Reset" means reset: the one-shot pre-v3 backup
  // (see LEGACY_BACKUP_KEY above) is a migration safety net, not a
  // recovery feature the learner can reach from the UI. If a restore path
  // is ever built, this call needs to move behind it; until then, keeping
  // a full copy of progress the learner explicitly asked to delete is a
  // silent violation of "reset all progress".
  const resetProgress = () => {
    setSrsStates({});
    persistNow({});
    localStorage.removeItem(LEGACY_BACKUP_KEY);
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
