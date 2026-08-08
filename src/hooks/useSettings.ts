import { useState, useEffect } from 'react';

export interface Settings {
  practiceMode: 'typing' | 'multiple-choice';
  showExamples: boolean;
  autoplayAudio: boolean;
  muteAudio: boolean;
  dailyGoal: number;
  cefrLevels: string[];
}

const DEFAULT_SETTINGS: Settings = {
  practiceMode: 'typing',
  showExamples: false,
  autoplayAudio: true,
  muteAudio: false,
  dailyGoal: 20,
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

  const merged = { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
  // A stored empty cefrLevels predates the guard against unselecting every
  // level (#137). Without this, those users silently fall from "all verbs"
  // to "zero verbs" and see a false permanent "all caught up".
  if (Array.isArray(merged.cefrLevels) && merged.cefrLevels.length === 0) {
    merged.cefrLevels = DEFAULT_SETTINGS.cefrLevels;
  }
  return merged;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSettings(parseStoredSettings(stored));
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    }
    setIsLoading(false);
  }, []);

  // The upgrade to the versioned envelope happens on the next write, not on
  // load. Every mount of this hook would otherwise rewrite the store just to
  // stamp a version — several redundant writes per page, each a chance to
  // fail on quota — and reading a legacy blob already works, so there is
  // nothing to gain by rushing it.
  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: SETTINGS_STORAGE_VERSION, settings: updated }),
      );
      return updated;
    });
  };

  return { settings, updateSettings, isLoading };
}
