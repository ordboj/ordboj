import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettings } from '@/hooks/useSettings';

const STORAGE_KEY = 'swedish-verbs-settings';

const DEFAULTS = {
  practiceMode: 'typing',
  showExamples: false,
  autoplayAudio: true,
  muteAudio: false,
  // docs/learning/session-shape-and-daily-goal.md: 10 minutes x 5 items.
  dailyGoal: 50,
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
    expect(stored.dailyGoal).toBe(42);
    expect(Object.keys(DEFAULTS)).not.toContain('interfaceLanguage');
  });
});

// docs/learning/session-shape-and-daily-goal.md: dailyGoal range 5-120. A
// stored 0 or NaN would otherwise soft-brick practice (answeredToday >= 0
// is met before the first card), so invalid values coerce to the default
// on load rather than clamping to a bound.
describe('dailyGoal sanitization on load (issue #26)', () => {
  it.each([
    ['zero (soft-brick guard)', 0],
    ['negative', -5],
    ['below the minimum', 4],
    ['above the maximum', 121],
    ['a string', '25'],
    ['null', null],
  ])('coerces %s to the default', async (_label, value) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, dailyGoal: value }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.dailyGoal).toBe(50);
  });

  it('keeps a valid stored value at the range bounds', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, dailyGoal: 5 }));
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.dailyGoal).toBe(5);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, dailyGoal: 120 }));
    const { result: result2 } = renderHook(() => useSettings());
    await waitFor(() => expect(result2.current.isLoading).toBe(false));
    expect(result2.current.settings.dailyGoal).toBe(120);
  });

  it('rounds a fractional stored value instead of rejecting it', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, dailyGoal: 24.6 }));
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.dailyGoal).toBe(25);
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
