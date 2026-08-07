import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettings } from '@/hooks/useSettings';

const STORAGE_KEY = 'swedish-verbs-settings';

const DEFAULTS = {
  practiceMode: 'typing',
  showExamples: false,
  autoplayAudio: true,
  muteAudio: false,
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
    expect(stored).toEqual({ ...DEFAULTS, dailyGoal: 5 });
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
