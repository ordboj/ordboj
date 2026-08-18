import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Settings from '@/pages/Settings';
import { STORAGE_VERSION } from '@/hooks/useSrsProgress';

// Unlike Settings.test.tsx, this suite does NOT mock '@/hooks/useSrsProgress'
// (srs-engine-owned). Issue #93's guard only matters if the confirm action
// inside the dialog reaches the real reset path and leaves localStorage in
// the expected state - a mocked resetProgress can prove the button was
// clicked, but not that anything real happened. Progress lives only in
// localStorage with no backend and no accounts, so this pins the exact set
// of localStorage keys/content the confirm action is allowed to touch.
// useSettings (frontend-expert-owned) is still mocked: it is unrelated to
// the reset path and this suite does not own it.
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: true,
      muteAudio: false,
      dailyGoal: 20,
      cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    },
    updateSettings: vi.fn(),
  }),
}));

const SETTINGS_KEY = 'swedish-verbs-settings';
const SRS_KEY = 'swedish-verbs-srs-progress';
// Issue #53: a one-shot, never-overwritten copy of whatever was at SRS_KEY
// before the first v3 migration write. Written on load, before reset ever
// runs, so a seeded pre-v3 store always produces this key too.
const LEGACY_BACKUP_KEY = 'swedish-verbs-srs-progress-backup-pre-v3';

function storedKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    keys.push(localStorage.key(i) as string);
  }
  return keys.sort();
}

beforeEach(() => {
  localStorage.clear();
});

describe('Settings page - issue #93: reset confirmation reaches the real reset path', () => {
  it('closes the dialog and empties the SRS store (version envelope, no items) after confirming, without touching the unrelated settings key', async () => {
    // Seed both stores like a real user with existing progress and
    // settings, so the assertions below can tell "touched" from "untouched".
    const preV3Store = JSON.stringify({
      version: 2,
      items: { '1-presens': { repetitions: 3, easeFactor: 2.5 } },
    });
    localStorage.setItem(SRS_KEY, preV3Store);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ practiceMode: 'typing' }));

    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: '/settings' });

    // The backup is written on load, before reset ever runs - pin that half
    // of the behaviour here (async: the migration load awaits getVerbs()),
    // before the confirm click below removes it.
    await waitFor(() => {
      expect(localStorage.getItem(LEGACY_BACKUP_KEY)).toBe(preV3Store);
    });

    await user.click(screen.getByRole('button', { name: /reset all progress/i }));
    const dialog = await screen.findByRole('alertdialog');
    // The AlertDialogAction ("confirm") inside the dialog, distinct from the
    // trigger button of the same name that opened it.
    await user.click(within(dialog).getByRole('button', { name: /^reset all progress$/i }));

    // The dialog closes as part of confirming, not only when cancelled.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    // Pin the exact post-reset shape of the SRS store: emptied items under
    // the same version envelope - not a removed key, not a bare {}.
    await waitFor(() => {
      const stored = localStorage.getItem(SRS_KEY);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored as string)).toEqual({ version: STORAGE_VERSION, items: {} });
    });

    // Reset means reset: the one-shot pre-v3 backup the load path wrote is a
    // migration safety net, not a second undo history, so "reset all
    // progress" removes it along with the live store. Only the unrelated
    // settings key survives untouched.
    expect(storedKeys()).toEqual([SETTINGS_KEY, SRS_KEY].sort());
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify({ practiceMode: 'typing' }));
    expect(localStorage.getItem(LEGACY_BACKUP_KEY)).toBeNull();
  });
});
