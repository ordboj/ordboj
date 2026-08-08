import { useState, useEffect, useCallback } from 'react';
import {
  SrsState,
  initializeSrsState,
  calculateNextReview,
  isDue,
  roundEase,
  INITIAL_EASE_FACTOR,
  Grade,
} from '@/lib/srs';
import { getVerbs, Form, Verb, conjugateVerb } from '@/lib/verbs';

const STORAGE_KEY = 'swedish-verbs-srs-progress';

// Storage schema history for STORAGE_KEY:
//
//   v1 (unversioned) — a bare Record<itemId, SrsState>, itemId
//       `${VERB_DATA index + 1}-${form}`, `itemId` duplicated inside the
//       value, every verb x form materialized on first launch.
//   v2 — `{ version: 2, items }`. Same keys and values; adds the one-time
//       rebase of ease factors the old SM-2 formula drove to the floor (see
//       docs/learning/lapse-handling.md, Migration).
//   v3 — `{ version: 3, items }`. Items keyed `${infinitive}-${form}`, only
//       practiced items stored, `itemId` dropped from the value, easeFactor
//       rounded to 2 decimals.
//
// Issue #53 spelled the new envelope `{ v: 1, items }`. It was written before
// the v2 envelope shipped, and reusing the number 1 under a renamed field
// would put two incompatible meanings on "version 1" in stores that already
// exist in users' browsers, with no way for a reader to tell them apart. The
// field name and the monotonic counter are therefore kept and the counter
// advances to 3; the shape change the issue asks for is what actually ships.
const STORAGE_VERSION = 3;

// Sentinel for the unversioned v1 blob, which carries no version field.
const LEGACY_UNVERSIONED_VERSION = 1;

const FORMS: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];

// v1/v2 item ids: a 1-based VERB_DATA index, a hyphen, then the form. No
// infinitive in the current table is all digits, so an infinitive-keyed id can
// never be mistaken for a positional one.
const LEGACY_ITEM_ID = new RegExp(`^(\\d+)-(${FORMS.join('|')})$`);

// Legacy -0.80-per-miss ease penalty pinned items at the 1.3 floor after a
// single early miss. An item with repetitions >= 2 has since proven itself,
// so its floor-stuck ease reflects the old formula, not real difficulty.
const REBASE_EASE_MIN = 1.8;
const REBASE_MIN_REPETITIONS = 2;

// Plausibility bounds, used only to *reject an import* — never to filter
// storage (see isUsableItem). They are deliberately far wider than anything
// this scheduler can produce today, because pre-#39 data legitimately exceeds
// today's limits: the old formula had no ease ceiling (+0.1 per success,
// unbounded) and no MAX_INTERVAL_DAYS clamp, so a long streak really could
// leave a 900-day interval and an ease above 2.8 in a user's store. Anything
// outside these bounds is not "unusual progress", it is not SRS data.
const MIN_PLAUSIBLE_DUE_AT = Date.UTC(2020, 0, 1); // predates the app itself
const MAX_PLAUSIBLE_DUE_AT_AHEAD_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const MAX_PLAUSIBLE_INTERVAL_DAYS = 36500;
const MAX_PLAUSIBLE_REPETITIONS = 10000;
const MAX_PLAUSIBLE_EASE_FACTOR = 10;
const MIN_PLAUSIBLE_EASE_FACTOR = 1;

type ItemMap = Record<string, SrsState>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Read-path filter: the four scheduling numbers must be present and finite.
// An item missing one of them cannot be scheduled at all — `isDue` on an
// undefined dueAt is false, so such an item would silently never come up for
// review again — so keeping it would be worse than dropping it. Values are
// range-checked only on import, not here: a user's own stored progress is
// irreplaceable and an out-of-range-but-usable number is still their history.
function isUsableItem(value: unknown): value is SrsState {
  if (!isPlainObject(value)) return false;
  if (!isFiniteNumber(value.repetitions)) return false;
  if (!isFiniteNumber(value.intervalDays)) return false;
  if (!isFiniteNumber(value.easeFactor)) return false;
  if (!isFiniteNumber(value.dueAt)) return false;
  if (value.lastGrade !== undefined && !isFiniteNumber(value.lastGrade)) return false;
  if (value.itemId !== undefined && typeof value.itemId !== 'string') return false;
  return true;
}

// Import-path filter: usable *and* within plausible ranges. Import is the only
// backup path there is, so it must not be the easiest way to destroy progress:
// a single implausible item rejects the whole file rather than being repaired
// into something the user never recorded.
function isPlausibleItem(value: unknown): value is SrsState {
  if (!isUsableItem(value)) return false;
  const { repetitions, intervalDays, easeFactor, dueAt } = value;
  if (repetitions < 0 || repetitions > MAX_PLAUSIBLE_REPETITIONS) return false;
  if (intervalDays < 0 || intervalDays > MAX_PLAUSIBLE_INTERVAL_DAYS) return false;
  if (easeFactor < MIN_PLAUSIBLE_EASE_FACTOR || easeFactor > MAX_PLAUSIBLE_EASE_FACTOR)
    return false;
  if (dueAt < MIN_PLAUSIBLE_DUE_AT) return false;
  if (dueAt > Date.now() + MAX_PLAUSIBLE_DUE_AT_AHEAD_MS) return false;
  return true;
}

function keepUsableItems(items: Record<string, unknown>): ItemMap {
  const kept: ItemMap = {};
  const dropped: string[] = [];
  for (const [itemId, state] of Object.entries(items)) {
    if (isUsableItem(state)) {
      kept[itemId] = state;
    } else {
      dropped.push(itemId);
    }
  }
  if (dropped.length > 0) {
    console.error(`Dropped ${dropped.length} unschedulable SRS item(s): ${dropped.join(', ')}`);
  }
  return kept;
}

// An untouched item is 100% derivable from initializeSrsState, so v3 does not
// persist it: an absent key means "new, due now". dueAt is deliberately not
// part of the test — a never-reviewed item's dueAt is whenever the app first
// ran, always in the past, i.e. already due. A lapsed item (repetitions back
// to 0 but intervalDays 1 and a recorded lastGrade) is NOT untouched and is
// kept.
function isUntouched(state: SrsState): boolean {
  return (
    state.repetitions === 0 &&
    state.intervalDays === 0 &&
    state.easeFactor === INITIAL_EASE_FACTOR &&
    state.lastGrade === undefined
  );
}

// Strip the legacy duplicated id and collapse float drift in the ease factor.
// Unknown fields survive: nothing that is not explicitly legacy is discarded.
function normalizeItem(state: SrsState): SrsState {
  const { itemId: _legacyItemId, ...rest } = state;
  return { ...rest, easeFactor: roundEase(rest.easeFactor) };
}

function rebaseLegacyEase(items: ItemMap): ItemMap {
  const rebased: ItemMap = {};
  for (const [itemId, state] of Object.entries(items)) {
    if (state.repetitions >= REBASE_MIN_REPETITIONS) {
      rebased[itemId] = { ...state, easeFactor: Math.max(state.easeFactor, REBASE_EASE_MIN) };
    } else {
      rebased[itemId] = state;
    }
  }
  return rebased;
}

// Maps a legacy positional verb id ("12") to an infinitive ("tycka") using the
// CURRENT VERB_DATA order. This is only correct while the table is still in the
// order it had when those ids were written, which is why the migration had to
// ship before the table is extended or re-sorted (issue #53).
function buildLegacyIdMap(verbs: Verb[]): Map<string, string> {
  const legacyIdToInfinitive = new Map<string, string>();
  const seen = new Set<string>();
  verbs.forEach((verb, index) => {
    if (seen.has(verb.infinitive)) {
      // Two rows with the same infinitive would merge two verbs' progress into
      // one key. Uniqueness holds for the 50-row table this migration was
      // written against (verified row by row); a CSV import that breaks it
      // must fail loudly here instead of silently collapsing user progress.
      // The colliding row is left unmapped, so its items keep their positional
      // key and stay inert rather than being attached to the wrong verb.
      console.error(
        `Duplicate infinitive in verb table, SRS migration skipped: ${verb.infinitive}`,
      );
      return;
    }
    seen.add(verb.infinitive);
    legacyIdToInfinitive.set(String(index + 1), verb.infinitive);
  });
  return legacyIdToInfinitive;
}

let legacyIdMapCache: Map<string, string> | null = null;

async function getLegacyIdMap(): Promise<Map<string, string>> {
  if (!legacyIdMapCache) {
    legacyIdMapCache = buildLegacyIdMap(await getVerbs());
  }
  return legacyIdMapCache;
}

// v1/v2 -> v3: re-key positional ids to infinitives, drop untouched items,
// strip the duplicated itemId, round the ease factor.
function migrateLegacyItems(items: ItemMap, legacyIdToInfinitive: Map<string, string>): ItemMap {
  const migrated: ItemMap = {};
  for (const [itemId, state] of Object.entries(items)) {
    if (isUntouched(state)) continue;
    // Keys that cannot be mapped — already infinitive-keyed, or a positional
    // index past the end of the current table — are carried over verbatim.
    // Inert at worst; never reattached to a different verb.
    let migratedId = itemId;
    const match = LEGACY_ITEM_ID.exec(itemId);
    if (match) {
      const infinitive = legacyIdToInfinitive.get(match[1]);
      if (infinitive) {
        migratedId = srsItemId(infinitive, match[2] as Form);
      }
    }
    migrated[migratedId] = normalizeItem(state);
  }
  return migrated;
}

// Read path. Accepts the v3 envelope, the v2 envelope, and the v1 bare map,
// and returns v3-shaped items. Never throws for a shape reason (JSON.parse can
// still throw and is caught by the caller): the app has to boot even on
// damaged storage.
function parseStoredProgress(raw: string, legacyIdToInfinitive: Map<string, string>): ItemMap {
  const parsed = JSON.parse(raw);
  if (!isPlainObject(parsed)) {
    return {};
  }

  const version = isFiniteNumber(parsed.version) ? parsed.version : LEGACY_UNVERSIONED_VERSION;

  if (version >= STORAGE_VERSION) {
    // This version or newer. Items are taken as-is: no re-keying, no rebase,
    // no pruning — that is what makes every migration one-shot. A payload from
    // a newer build is read on a best-effort basis; its items survive, but the
    // next write stamps it back down to this version's marker.
    return keepUsableItems(isPlainObject(parsed.items) ? parsed.items : {});
  }

  const rawItems =
    version === LEGACY_UNVERSIONED_VERSION
      ? (parsed as Record<string, unknown>)
      : isPlainObject(parsed.items)
        ? parsed.items
        : {};
  const usable = keepUsableItems(rawItems);
  const rebased = version === LEGACY_UNVERSIONED_VERSION ? rebaseLegacyEase(usable) : usable;
  return migrateLegacyItems(rebased, legacyIdToInfinitive);
}

// Import path. Returns null to mean "reject, change nothing" — the caller must
// not touch in-memory state on null. Rejects rather than repairs: a file we
// cannot fully account for is not imported at all.
function validateImportedProgress(
  parsed: unknown,
  legacyIdToInfinitive: Map<string, string> | null,
): ItemMap | null {
  if (!isPlainObject(parsed)) {
    // Covers `[]`, `"text"`, `42`, `null`.
    return null;
  }

  let version: number;
  let rawItems: Record<string, unknown>;

  if (parsed.version !== undefined) {
    if (!isFiniteNumber(parsed.version) || !Number.isInteger(parsed.version)) return null;
    if (parsed.version < LEGACY_UNVERSIONED_VERSION || parsed.version > STORAGE_VERSION) {
      // Older-than-v1 is nonsense; newer-than-current cannot be validated,
      // because we do not know what its fields mean. Both are refused.
      return null;
    }
    if (!isPlainObject(parsed.items)) return null;
    version = parsed.version;
    rawItems = parsed.items;
  } else {
    // No envelope: the only thing this may be is a v1 bare map, and only if it
    // actually looks like one. A settings export, `{"x":1}` or an empty object
    // lands here and is refused because its entries are not SRS items.
    version = LEGACY_UNVERSIONED_VERSION;
    rawItems = parsed;
    if (Object.keys(rawItems).length === 0) return null;
  }

  for (const [itemId, state] of Object.entries(rawItems)) {
    if (typeof itemId !== 'string' || itemId.length === 0) return null;
    if (!isPlausibleItem(state)) return null;
  }
  const items = rawItems as ItemMap;

  if (version >= STORAGE_VERSION) {
    return Object.fromEntries(
      Object.entries(items).map(([itemId, state]) => [itemId, normalizeItem(state)]),
    );
  }

  if (!legacyIdToInfinitive) {
    // Unreachable in the app (the load effect fills the cache on mount), but a
    // legacy import re-keyed against an unknown table order would attach
    // progress to the wrong verbs, so refuse instead of guessing.
    console.error('Cannot migrate a legacy import before the verb table has loaded');
    return null;
  }
  const rebased = version === LEGACY_UNVERSIONED_VERSION ? rebaseLegacyEase(items) : items;
  return migrateLegacyItems(rebased, legacyIdToInfinitive);
}

export interface PracticeItem {
  verbId: string;
  infinitive: string;
  form: Form;
  itemId: string;
}

// Canonical v3 item id. Keyed on the infinitive, which is content-derived and
// stable, instead of the verb's position in VERB_DATA, which is not.
export function srsItemId(infinitive: string, form: Form): string {
  return `${infinitive}-${form}`;
}

export function useSrsProgress(cefrLevels?: string[]) {
  const [srsStates, setSrsStates] = useState<ItemMap>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage, migrating older payloads forward on read.
  useEffect(() => {
    const initializeStates = async () => {
      const legacyIdToInfinitive = await getLegacyIdMap();
      const stored = localStorage.getItem(STORAGE_KEY);
      let loadedStates: ItemMap = {};

      if (stored) {
        try {
          loadedStates = parseStoredProgress(stored, legacyIdToInfinitive);
        } catch (e) {
          console.error('Failed to parse SRS data', e);
        }
      }

      // No eager materialization: an item the user has never answered is not
      // stored at all. getDueItems treats an absent key as new and due now.
      setSrsStates(loadedStates);
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

      for (const form of FORMS) {
        // Skip forms that are not available
        if (conjugated[form] === '(not available)' || !conjugated[form]) {
          continue;
        }

        const itemId = srsItemId(verb.infinitive, form);
        const state = srsStates[itemId];
        // Absent key == never practiced == due now. This is the other half of
        // not persisting untouched items.
        if (!state || isDue(state)) {
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
    const currentState = srsStates[itemId] || initializeSrsState();
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

  // Accepts a v3 envelope, a v2 envelope or a legacy bare map, and rejects
  // anything else outright: existing progress is left exactly as it was and
  // false is returned. Legacy payloads get the same one-time ease rebase and
  // positional-id migration as legacy storage.
  const importData = (jsonString: string) => {
    try {
      const imported = validateImportedProgress(JSON.parse(jsonString), legacyIdMapCache);
      if (!imported) {
        console.error('Rejected SRS import: not a recognizable progress export');
        return false;
      }
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
