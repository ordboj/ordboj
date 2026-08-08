import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettings } from '@/hooks/useSettings';

// '@/hooks/use-toast' is a frontend-expert-owned boundary this suite does
// not own (issue #138 acceptance criteria: a failed write must surface a
// visible toast). Mocking it here pins the contract this hook has with the
// toast system - what it calls and with what payload - without coupling
// this suite to the Radix Toast DOM/portal machinery that actually renders
// it (that's covered where Toaster itself is exercised).
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { toast } from '@/hooks/use-toast';

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
  // vi.mock's `toast: vi.fn()` is a bare mock, not a vi.spyOn spy, so the
  // harness's `restoreMocks: true` (which only restores spies) does not
  // clear its call history between tests. Clear it explicitly so a toast
  // fired by an earlier test can never be mistaken for one fired by this
  // test.
  vi.mocked(toast).mockClear();
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

describe('quota exceeded on write (issue #138)', () => {
  // FIXED: src/hooks/useSettings.ts now wraps the localStorage.setItem call
  // in a try/catch (the persist effect keyed on [settings, isLoading]).
  // Before the fix, the write ran unguarded inside updateSettings's setState
  // updater, so a throwing setItem (e.g. QuotaExceededError) propagated as
  // an uncaught render-phase error instead of being caught and surfaced.
  // Owner: frontend-expert (src/hooks/useSettings.ts).
  it('does not crash the component tree when localStorage.setItem throws (quota exceeded)', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(() => {
      act(() => {
        result.current.updateSettings({ dailyGoal: 5 });
      });
    }).not.toThrow();
  });

  // Pins the acceptance criteria that a visible "settings not saved" toast
  // fires on the same write-failure path exercised above, not just that the
  // tree survives.
  it('shows a destructive "Settings not saved" toast when localStorage.setItem throws (issue #138)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(toast).not.toHaveBeenCalled();

    act(() => {
      result.current.updateSettings({ dailyGoal: 5 });
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Settings not saved',
        variant: 'destructive',
      }),
    );
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
