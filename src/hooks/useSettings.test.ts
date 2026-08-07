import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettings } from '@/hooks/useSettings';

const STORAGE_KEY = 'swedish-verbs-settings';

const DEFAULTS = {
  practiceMode: 'typing',
  showExamples: false,
  autoplayAudio: true,
  muteAudio: false,
  interfaceLanguage: 'en',
  dailyGoal: 20,
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
    expect(stored).toEqual({ version: 1, data: { ...DEFAULTS, dailyGoal: 5 } });
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

describe('forward-compat: merging stored settings over defaults', () => {
  it('fills in missing keys from DEFAULT_SETTINGS when the stored object is older/partial', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: { dailyGoal: 99 } }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual({ ...DEFAULTS, dailyGoal: 99 });
  });

  it('drops unknown extra fields from a newer stored object rather than letting them through', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        data: { ...DEFAULTS, someFutureField: 'from-a-newer-build' },
      }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Known fields still round-trip correctly...
    expect(result.current.settings).toEqual(DEFAULTS);
    // ...but the unknown field must not survive sanitization.
    expect(
      (result.current.settings as unknown as Record<string, unknown>).someFutureField,
    ).toBeUndefined();
    expect(Object.keys(result.current.settings)).toEqual(Object.keys(DEFAULTS));
  });

  it('sanitizes a legacy unversioned raw blob (no envelope) the same way', async () => {
    // readVersioned treats an unversioned/legacy raw object as best-effort
    // data for migration purposes; sanitize must still validate it.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULTS, dailyGoal: 12, someFutureField: 'legacy-junk' }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual({ ...DEFAULTS, dailyGoal: 12 });
    expect(
      (result.current.settings as unknown as Record<string, unknown>).someFutureField,
    ).toBeUndefined();
  });

  it('does not throw and falls back to defaults when the stored value is malformed JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(DEFAULTS);
  });
});

describe('versioned envelope round-trip', () => {
  it('round-trips a fully valid settings object unchanged', async () => {
    const validSettings = {
      practiceMode: 'multiple-choice',
      showExamples: true,
      autoplayAudio: false,
      muteAudio: true,
      interfaceLanguage: 'sv',
      dailyGoal: 42,
      cefrLevels: ['B1', 'B2'],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: validSettings }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(validSettings);
  });
});

describe('per-field garbage fallback', () => {
  it('falls back dailyGoal to the default when stored as a string instead of a number', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, data: { ...DEFAULTS, dailyGoal: '20' } }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.dailyGoal).toBe(DEFAULTS.dailyGoal);
  });

  it('falls back cefrLevels to the default when stored as a non-array', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, data: { ...DEFAULTS, cefrLevels: 42 } }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.cefrLevels).toEqual(DEFAULTS.cefrLevels);
  });

  it('falls back cefrLevels to the default when it contains an unknown level code', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, data: { ...DEFAULTS, cefrLevels: ['XX'] } }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.cefrLevels).toEqual(DEFAULTS.cefrLevels);
  });

  it('falls back practiceMode to the default when stored as an unrecognized string', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, data: { ...DEFAULTS, practiceMode: 'nonsense' } }),
    );

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.practiceMode).toBe(DEFAULTS.practiceMode);
  });

  it('falls back to the full DEFAULT_SETTINGS when the stored value is fully malformed JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings).toEqual(DEFAULTS);
  });
});
