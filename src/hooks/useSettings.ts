import { useSyncExternalStore } from 'react';
// zod/v4-mini instead of zod: the classic zod v3 build is not tree-shakeable
// and put ~13kB gzip on this hook's first-load chunk (#300). Same validation
// behavior, functional-check style API instead of chained methods.
import * as z from 'zod/v4-mini';

export interface Settings {
  practiceMode: 'typing' | 'multiple-choice';
  showExamples: boolean;
  autoplayAudio: boolean;
  muteAudio: boolean;
  dailyGoal: number;
  // Particle practice is time the learner is *adding*, so it gets its own
  // budget rather than quietly eating the conjugation one. Stored
  // independently and never derived from dailyGoal: deriving it would make
  // one slider silently move two queues.
  //
  // It paces the particle queue and nothing else. It must never appear in a
  // streak or adherence calculation — the day still counts when
  // answeredToday >= dailyGoal, with particle cards counting toward that
  // total, so turning this mode on can never make a streak harder to keep
  // (docs/learning/particle-verb-practice.md, "Two goals, one adherence
  // line").
  particleDailyGoal: number;
  cefrLevels: string[];
}

const DEFAULT_SETTINGS: Settings = {
  practiceMode: 'typing',
  showExamples: false,
  autoplayAudio: true,
  muteAudio: false,
  dailyGoal: 20,
  // Twelve, not fifty: additional time on top of an existing commitment, and
  // the standing rule is a number the median learner hits on a bad day. About
  // four minutes at three particle cards a minute.
  particleDailyGoal: 12,
  cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

const STORAGE_KEY = 'swedish-verbs-settings';

// Storage schema version for the settings store. The original shape was
// unversioned — the bare Settings object written straight to STORAGE_KEY —
// which is what every existing install still holds and what a `version`
// field being absent means. Version 1 wraps it in { version, settings }.
//
// The point of the marker is not this change (merging stored values over
// DEFAULT_SETTINGS already absorbs added and removed keys, which is how
// #92's interfaceLanguage removal was handled without one). It is that a
// future change which *reinterprets* an existing key — a range change, a
// units change, a rename — is undetectable in the bare shape: the old value
// and the new value are both just a number, and the app would apply the
// wrong reading silently. The version field is what lets that be noticed.
export const SETTINGS_STORAGE_VERSION = 1;

// Shape validation for the stored payload. `looseObject` is deliberate: a key
// this build does not know about belongs to a newer build and rides along
// untouched, exactly as the plain merge used to carry it. What the schema is
// here to stop is the other case — a key this build *does* know, holding a
// value of the wrong type or an impossible value, which used to be spread
// straight into `Settings` and then read as if it were real.
//
// The bounds are intentionally loose. This is a type gate, not the settings
// UI's range policy (Settings.tsx clamps what a learner can pick); a stored
// dailyGoal of 99 is an unusual choice, not corruption, and resetting it
// would be the app overruling the learner.
const settingsSchema = z.looseObject({
  practiceMode: z.enum(['typing', 'multiple-choice']),
  showExamples: z.boolean(),
  autoplayAudio: z.boolean(),
  muteAudio: z.boolean(),
  dailyGoal: z.int().check(z.positive()),
  particleDailyGoal: z.int().check(z.positive()),
  // Non-empty carries the #137 guard: a stored empty selection must not
  // read as "zero verbs" forever, so it fails validation and the field
  // falls back to every level.
  cefrLevels: z.array(z.string().check(z.minLength(1))).check(z.minLength(1)),
});

// Repairs per field rather than per object. One corrupt key resetting every
// other preference would be a bigger loss than the corrupt key itself, so
// each failing path falls back to its default and everything that validated
// is kept, including unknown keys from a newer build.
function validateSettings(candidate: Record<string, unknown>): Settings {
  const first = settingsSchema.safeParse(candidate);
  if (first.success) return first.data;

  const defaults: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const repaired: Record<string, unknown> = { ...candidate };
  for (const issue of first.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && key in defaults) {
      repaired[key] = defaults[key];
    }
  }

  const second = settingsSchema.safeParse(repaired);
  return second.success ? second.data : DEFAULT_SETTINGS;
}

// Accepts both the versioned envelope and the legacy bare object, and
// returns settings ready to use. Stored values are merged over the defaults
// rather than replacing them, so a partial or older object keeps working and
// unknown keys ride along untouched.
//
// Deliberately best-effort about a version *newer* than this build: the
// envelope's `settings` are still read and merged. This is the opposite of
// the progress store's rule, which refuses a newer store outright, and the
// asymmetry is the point — losing a schedule is unrecoverable, whereas the
// worst case here is that a preference this build does not understand is
// dropped on the next write and the learner re-picks it from a menu.
function parseStoredSettings(raw: string): Settings {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return DEFAULT_SETTINGS;
  }

  const envelope = parsed as { version?: unknown; settings?: unknown };
  const versioned = typeof envelope.version === 'number';
  const stored = versioned ? envelope.settings : parsed;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return DEFAULT_SETTINGS;
  }

  // The empty-cefrLevels coercion of #137 now lives in the schema's
  // `z.minLength(1)`: an empty selection fails validation and the
  // field falls back to every level, which is what that guard did.
  return validateSettings({ ...DEFAULT_SETTINGS, ...(stored as Record<string, unknown>) });
}

// --- The store ------------------------------------------------------------
//
// One module-level value, not one useState per caller. Two components used to
// mount two independent copies of these settings in the same tree (#104:
// Progress and VerbDetailsModal), so a write through one copy left the other
// showing — and then re-persisting — the value from before the change. The
// store is read through useSyncExternalStore, so every consumer reads the
// same object and re-renders off the same notification. A Context provider
// would do the same job; this way costs no change to the App tree.

let currentSettings: Settings = DEFAULT_SETTINGS;
// False means `currentSettings` is a placeholder that has not been read out
// of storage yet. Cleared again when the last consumer detaches, so a tree
// that unmounts and remounts re-reads rather than trusting stale memory.
let isHydrated = false;
const listeners = new Set<() => void>();

function readStoredSettings(): Settings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return parseStoredSettings(raw);
  } catch (e) {
    console.error('Failed to load settings', e);
    return DEFAULT_SETTINGS;
  }
}

// getSnapshot must return a stable reference while nothing has changed, or
// useSyncExternalStore re-renders forever. Re-reading storage produces a new
// object every time, so an unchanged payload keeps the previous one.
function getSnapshot(): Settings {
  if (!isHydrated) {
    const loaded = readStoredSettings();
    if (JSON.stringify(loaded) !== JSON.stringify(currentSettings)) {
      currentSettings = loaded;
    }
    isHydrated = true;
  }
  return currentSettings;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) isHydrated = false;
  };
}

// The upgrade to the versioned envelope happens on the next write, not on
// load. Loading would otherwise rewrite the store just to stamp a version —
// a write on every startup, each a chance to fail on quota — and reading a
// legacy blob already works, so there is nothing to gain by rushing it.
//
// Module-level, so the identity every consumer gets is stable for the life of
// the page and never invalidates a memo downstream.
function updateSettings(newSettings: Partial<Settings>): void {
  const updated = { ...getSnapshot(), ...newSettings };
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SETTINGS_STORAGE_VERSION, settings: updated }),
    );
  } catch (e) {
    // Quota or a blocked store: keep the session usable with the new value in
    // memory rather than dropping the learner's choice on the floor.
    console.error('Failed to save settings', e);
  }
  currentSettings = updated;
  isHydrated = true;
  for (const listener of listeners) listener();
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot);

  // Reading storage is synchronous, so there is never a moment where settings
  // are unknown. Kept in the return shape because callers gate their first
  // paint on it; it is now always false.
  return { settings, updateSettings, isLoading: false };
}
