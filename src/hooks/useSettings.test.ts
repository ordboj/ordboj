import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useSettings,
  reloadSettingsFromStorage,
  SETTINGS_STORAGE_VERSION,
} from '@/hooks/useSettings';

const STORAGE_KEY = 'swedish-verbs-settings';

const DEFAULTS = {
  practiceMode: 'typing',
  showExamples: false,
  autoplayAudio: true,
  muteAudio: false,
  dailyGoal: 20,
  // Particle mode's own budget, stored independently of dailyGoal (#245).
  particleDailyGoal: 12,
  cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

beforeEach(() => {
  localStorage.clear();
});

describe('defaults', () => {
  it('starts from DEFAULT_SETTINGS when localStorage is empty', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings).toEqual(DEFAULTS);
  });
});

describe('persistence', () => {
  it('writes updates to the documented localStorage key', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ dailyGoal: 5 });
    });

    await waitFor(() => expect(result.current.settings.dailyGoal).toBe(5));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    // Writes go out in the versioned envelope as of #240. Still an exact
    // whole-payload comparison, so an unexpected extra key still fails.
    expect(stored).toEqual({
      version: SETTINGS_STORAGE_VERSION,
      settings: { ...DEFAULTS, dailyGoal: 5 },
    });
  });

  it('merges a partial update onto the previous settings rather than replacing them', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ muteAudio: true });
    });
    await waitFor(() => expect(result.current.settings.muteAudio).toBe(true));

    act(() => {
      result.current.updateSettings({ dailyGoal: 7 });
    });
    await waitFor(() => expect(result.current.settings.dailyGoal).toBe(7));

    // The earlier partial update must still be in effect.
    expect(result.current.settings.muteAudio).toBe(true);
  });
});

describe('issue #92: interfaceLanguage removal', () => {
  it('does not include interfaceLanguage in the settings returned for a fresh install', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).not.toHaveProperty('interfaceLanguage');
  });

  it('tolerates a legacy stored object that still has interfaceLanguage without breaking or dropping other fields', async () => {
    // A stored object from before #92 shipped, still carrying the no-op key.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        practiceMode: 'multiple-choice',
        showExamples: true,
        autoplayAudio: true,
        muteAudio: false,
        interfaceLanguage: 'sv',
        dailyGoal: 15,
        cefrLevels: ['A1', 'A2'],
      }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Nothing throws, and every field the app still cares about survives the
    // load intact - the stray field is carried non-destructively rather than
    // migrated away or used to reject the whole object.
    expect(result.current.settings).toMatchObject({
      practiceMode: 'multiple-choice',
      showExamples: true,
      autoplayAudio: true,
      muteAudio: false,
      dailyGoal: 15,
      cefrLevels: ['A1', 'A2'],
    });
  });

  it('does not reintroduce interfaceLanguage into a fresh write after loading a legacy object that had it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, interfaceLanguage: 'sv' }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ dailyGoal: 42 });
    });
    await waitFor(() => expect(result.current.settings.dailyGoal).toBe(42));

    // updateSettings spreads over the in-memory state, so the stray field
    // that was already loaded rides along - it is not the app writing a new
    // interfaceLanguage decision, just an untouched legacy value.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.settings.dailyGoal).toBe(42);
    expect(stored.settings.interfaceLanguage).toBe('sv');
    expect(Object.keys(DEFAULTS)).not.toContain('interfaceLanguage');
  });
});

describe('#240: settings store versioning', () => {
  it('upgrades a legacy bare object to the versioned envelope on first write, losing nothing', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        practiceMode: 'multiple-choice',
        showExamples: true,
        autoplayAudio: false,
        muteAudio: true,
        dailyGoal: 33,
        cefrLevels: ['A2', 'B1'],
      }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Read of the legacy shape is unchanged: nothing is migrated on load.
    expect(localStorage.getItem(STORAGE_KEY) as string).not.toContain('"version"');
    expect(result.current.settings).toEqual({
      practiceMode: 'multiple-choice',
      showExamples: true,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: 33,
      // Not in the stored object: a key added after this store was written
      // arrives from the defaults, which is exactly what the merge is for.
      particleDailyGoal: DEFAULTS.particleDailyGoal,
      cefrLevels: ['A2', 'B1'],
    });

    act(() => {
      result.current.updateSettings({ muteAudio: false });
    });
    await waitFor(() => expect(result.current.settings.muteAudio).toBe(false));

    // Every pre-existing choice survives the upgrade; only the edited field
    // changed and the version marker appeared.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual({
      version: SETTINGS_STORAGE_VERSION,
      settings: {
        practiceMode: 'multiple-choice',
        showExamples: true,
        autoplayAudio: false,
        muteAudio: false,
        dailyGoal: 33,
        particleDailyGoal: DEFAULTS.particleDailyGoal,
        cefrLevels: ['A2', 'B1'],
      },
    });
  });

  it('reads settings back out of the versioned envelope', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: SETTINGS_STORAGE_VERSION,
        settings: { ...DEFAULTS, dailyGoal: 11, cefrLevels: ['C1'] },
      }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual({ ...DEFAULTS, dailyGoal: 11, cefrLevels: ['C1'] });
  });

  it('round-trips: what updateSettings writes is what a fresh mount reads', async () => {
    const first = renderHook(() => useSettings());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    act(() => {
      first.result.current.updateSettings({ dailyGoal: 8, showExamples: true });
    });
    await waitFor(() => expect(first.result.current.settings.dailyGoal).toBe(8));

    const second = renderHook(() => useSettings());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.settings).toEqual({
      ...DEFAULTS,
      dailyGoal: 8,
      showExamples: true,
    });
  });

  it('still applies the #137 empty-cefrLevels guard inside the envelope', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: SETTINGS_STORAGE_VERSION,
        settings: { ...DEFAULTS, cefrLevels: [] },
      }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.cefrLevels).toEqual(DEFAULTS.cefrLevels);
  });

  it('reads what it can from an envelope written by a newer build rather than resetting', async () => {
    // Preferences are cheap to re-pick, so a store from the future is read
    // best-effort. (Progress does the opposite and refuses one outright —
    // see useSrsProgress: a lost schedule cannot be re-picked from a menu.)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: SETTINGS_STORAGE_VERSION + 99,
        settings: { ...DEFAULTS, dailyGoal: 44, aSettingFromTheFuture: true },
      }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.dailyGoal).toBe(44);
  });

  it('falls back to defaults when the envelope has no usable settings object', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SETTINGS_STORAGE_VERSION, settings: null }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(DEFAULTS);
  });
});

describe('forward-compat: merging stored settings over defaults', () => {
  it('fills in missing keys from DEFAULT_SETTINGS when the stored object is older/partial', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dailyGoal: 99 }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual({ ...DEFAULTS, dailyGoal: 99 });
  });

  it('keeps unknown extra fields from a newer stored object without crashing', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULTS, someFutureField: 'from-a-newer-build' }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toMatchObject(DEFAULTS);
    expect((result.current.settings as unknown as Record<string, unknown>).someFutureField).toBe(
      'from-a-newer-build',
    );
  });

  it('does not throw and falls back to defaults when the stored value is malformed JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(DEFAULTS);
  });
});

describe('issue #104: one shared store instead of a copy per caller', () => {
  it('never lets two live consumers diverge: same object identity, and a write through either one is visible to both without clobbering the other', async () => {
    // Progress.tsx and VerbDetailsModal.tsx used to each mount their own copy
    // of this hook. This pins the fix: both calls to useSettings() must read
    // the same underlying object, and a write issued through one consumer
    // must not overwrite a field just written through the other.
    const a = renderHook(() => useSettings());
    const b = renderHook(() => useSettings());
    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    await waitFor(() => expect(b.result.current.isLoading).toBe(false));

    expect(a.result.current.settings).toBe(b.result.current.settings);

    act(() => {
      a.result.current.updateSettings({ dailyGoal: 33 });
    });
    await waitFor(() => expect(b.result.current.settings.dailyGoal).toBe(33));
    expect(a.result.current.settings).toBe(b.result.current.settings);

    act(() => {
      b.result.current.updateSettings({ muteAudio: true });
    });
    await waitFor(() => expect(a.result.current.settings.muteAudio).toBe(true));
    // The write issued through b must not clobber the write already made
    // through a - the exact #104 bug.
    expect(a.result.current.settings.dailyGoal).toBe(33);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual({
      version: SETTINGS_STORAGE_VERSION,
      settings: { ...DEFAULTS, dailyGoal: 33, muteAudio: true },
    });
  });

  it('repairs a corrupt field without resetting the rest of the object or dropping unknown keys', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: SETTINGS_STORAGE_VERSION,
        settings: {
          practiceMode: 'interpretive-dance',
          dailyGoal: 'lots',
          showExamples: true,
          cefrLevels: ['A2'],
          keptUnknown: 'yes',
        },
      }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The two corrupt fields fall back to their defaults individually...
    expect(result.current.settings.practiceMode).toBe('typing');
    expect(result.current.settings.dailyGoal).toBe(20);
    // ...while every field that did validate, and the unknown key, survive.
    expect(result.current.settings.showExamples).toBe(true);
    expect(result.current.settings.cefrLevels).toEqual(['A2']);
    expect((result.current.settings as unknown as Record<string, unknown>).keptUnknown).toBe('yes');
  });

  it('drops its hydration flag on full unmount, so a fresh mount re-reads storage instead of trusting stale memory', async () => {
    const first = renderHook(() => useSettings());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    act(() => {
      first.result.current.updateSettings({ dailyGoal: 7 });
    });
    await waitFor(() => expect(first.result.current.settings.dailyGoal).toBe(7));

    first.unmount();

    const second = renderHook(() => useSettings());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(second.result.current.settings.dailyGoal).toBe(7);
  });
});

describe('issue #137: coercing a stored empty cefrLevels', () => {
  it('restores DEFAULT_SETTINGS.cefrLevels when the stored object has cefrLevels: []', async () => {
    // Before the checkbox guard shipped, a user could reach this state and
    // get stuck: an empty stored selection must not read as "zero verbs"
    // forever, so it is coerced back to every level on load.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, cefrLevels: [] }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.cefrLevels).toEqual(DEFAULTS.cefrLevels);
  });

  it('leaves a non-empty stored cefrLevels selection untouched', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, cefrLevels: ['B1'] }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.cefrLevels).toEqual(['B1']);
  });
});

describe('issue #384: reload settings state after whole-app backup import', () => {
  it('picks up a direct localStorage write (bypassing updateSettings) once reloadSettingsFromStorage runs, without a remount', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The hook's in-memory cache still holds the defaults at this point.
    expect(result.current.settings).toEqual(DEFAULTS);

    // Simulate restoreAppStores: a whole-app backup import writes the
    // settings key straight to localStorage, bypassing updateSettings
    // entirely (src/lib/backup.ts).
    const imported = {
      ...DEFAULTS,
      practiceMode: 'multiple-choice' as const,
      dailyGoal: 40,
      particleDailyGoal: 5,
      muteAudio: true,
      cefrLevels: ['B1', 'B2'],
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SETTINGS_STORAGE_VERSION, settings: imported }),
    );

    // Without calling reloadSettingsFromStorage, the mounted hook would keep
    // showing the stale in-memory snapshot (useSyncExternalStore's
    // getSnapshot only re-reads storage once, on first hydration).
    expect(result.current.settings).toEqual(DEFAULTS);

    act(() => {
      reloadSettingsFromStorage();
    });

    // The existing hook instance - no remount - now reflects the imported
    // values.
    await waitFor(() => expect(result.current.settings).toEqual(imported));
  });

  it('regression: a later updateSettings call does not revert the other imported fields to their pre-import values', async () => {
    // This is the actual #384 clobber: before the fix, `currentSettings`
    // stayed on the pre-import snapshot after a direct localStorage write,
    // so the next updateSettings() call spread its single changed field
    // over that stale snapshot and silently reverted every other field the
    // import had just changed.
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateSettings({ dailyGoal: 3, muteAudio: false });
    });
    await waitFor(() => expect(result.current.settings.dailyGoal).toBe(3));

    // A whole-app backup import restores settings via a direct localStorage
    // write, bypassing updateSettings.
    const imported = {
      ...DEFAULTS,
      practiceMode: 'multiple-choice' as const,
      dailyGoal: 40,
      particleDailyGoal: 5,
      muteAudio: true,
      showExamples: true,
      cefrLevels: ['B1', 'B2'],
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SETTINGS_STORAGE_VERSION, settings: imported }),
    );

    act(() => {
      reloadSettingsFromStorage();
    });
    await waitFor(() => expect(result.current.settings).toEqual(imported));

    // Now change exactly one field, as a learner tweaking a single
    // preference right after the import would.
    act(() => {
      result.current.updateSettings({ autoplayAudio: false });
    });
    await waitFor(() => expect(result.current.settings.autoplayAudio).toBe(false));

    // Every other imported field must survive untouched - none of them
    // should have reverted to the pre-import (or pre-reload) values.
    expect(result.current.settings).toEqual({
      ...imported,
      autoplayAudio: false,
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored).toEqual({
      version: SETTINGS_STORAGE_VERSION,
      settings: { ...imported, autoplayAudio: false },
    });
  });
});

describe('#300: zod/v4-mini schema checks', () => {
  it('repairs a non-integer stored dailyGoal (1.5) back to the default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, dailyGoal: 1.5 }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.dailyGoal).toBe(20);
  });

  it('repairs a non-positive stored dailyGoal (0) back to the default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, dailyGoal: 0 }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.dailyGoal).toBe(20);
  });

  it('repairs a negative stored dailyGoal (-5) back to the default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, dailyGoal: -5 }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.dailyGoal).toBe(20);
  });

  it('repairs a non-positive stored particleDailyGoal (0) back to the default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, particleDailyGoal: 0 }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.particleDailyGoal).toBe(12);
  });

  it('repairs a stored cefrLevels array holding an empty string back to the default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, cefrLevels: [''] }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.cefrLevels).toEqual(DEFAULTS.cefrLevels);
  });

  it('repairs a stored dailyGoal above Number.MAX_SAFE_INTEGER back to the default', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULTS, dailyGoal: Number.MAX_SAFE_INTEGER + 2 }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.dailyGoal).toBe(20);
  });
});
