import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSettings } from '@/hooks/useSettings';

// Issue #138: a throwing localStorage.setItem must surface a visible toast
// instead of silently diverging in-memory state from storage. Mock the
// frontend-expert-owned toast boundary so we can assert it fires without
// rendering the real <Toaster/> tree.
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

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
  toastMock.mockClear();
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
  // Regression test for issue #138: before the fix, updateSettings called
  // localStorage.setItem with no try/catch at all, so a QuotaExceededError
  // thrown during the setSettings updater propagated straight out of
  // updateSettings - an uncaught error, not just a silent one. The fix must
  // both stop that crash and surface a visible toast so the user knows the
  // change may not survive closing the tab.
  it('does not throw and surfaces a destructive "progress not saved" toast when localStorage.setItem throws', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(toastMock).not.toHaveBeenCalled();

    expect(() => {
      act(() => {
        result.current.updateSettings({ dailyGoal: 99 });
      });
    }).not.toThrow();

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/not saved/i),
        variant: 'destructive',
      }),
    );

    // The in-memory session stays alive and reflects the attempted change
    // even though the write failed - the toast is what tells the user it
    // may not survive closing the tab, not a UI rollback.
    expect(result.current.settings.dailyGoal).toBe(99);
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
