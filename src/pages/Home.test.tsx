import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Home from '@/pages/Home';

// Home.tsx composes useSrsProgress and useSettings (both srs-engine) and
// react-router-dom's useNavigate (a third-party boundary this suite does not
// own). All three are mocked here; getVerbs() (swedish-linguist's real
// VERB_DATA) is left untouched since it's fast and not what issue #110
// changed.
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  srsLoading: false,
  settingsLoading: false,
  muteAudio: false,
  updateSettings: vi.fn(),
  dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: mocks.srsLoading,
    getDueItems: async () => mocks.dueItems,
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: mocks.settingsLoading,
    settings: { cefrLevels: ['A1'], muteAudio: mocks.muteAudio },
    updateSettings: mocks.updateSettings,
  }),
}));

beforeEach(() => {
  mocks.navigate.mockClear();
  mocks.updateSettings.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.muteAudio = false;
  mocks.dueItems = [{ verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' }];
});

// Issue #110: Card onClick must get role/tabIndex/onKeyDown so keyboard
// users (and assistive tech that emulates click via Enter/Space on
// role="button") can reach /progress and /settings without a mouse.
describe('Home page - Progress/Settings cards are keyboard-operable (issue #110)', () => {
  it('exposes the Progress card as a focusable role=button and activates it with Enter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />, { route: '/' });

    const progressCard = await screen.findByRole('button', {
      name: /progress: track your learning/i,
    });
    expect(progressCard).toHaveAttribute('tabIndex', '0');

    progressCard.focus();
    await user.keyboard('{Enter}');

    expect(mocks.navigate).toHaveBeenCalledWith('/progress');
  });

  it('activates the Settings card with the Space key', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />, { route: '/' });

    const settingsCard = await screen.findByRole('button', {
      name: /settings: customize your practice/i,
    });
    expect(settingsCard).toHaveAttribute('tabIndex', '0');

    settingsCard.focus();
    await user.keyboard(' ');

    expect(mocks.navigate).toHaveBeenCalledWith('/settings');
  });

  it('does not navigate on unrelated key presses', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />, { route: '/' });

    const progressCard = await screen.findByRole('button', {
      name: /progress: track your learning/i,
    });
    progressCard.focus();
    await user.keyboard('a');

    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

// Issue #110: touch targets must be at least 44px. Tailwind's default
// spacing scale makes h-11/w-11 == 2.75rem == 44px at the default root font
// size; jsdom does not compute real layout, so pinning the utility classes
// is the only way to make a regression here fail loudly.
describe('Home page - mute button 44px touch target (issue #110)', () => {
  it('renders the mute toggle at h-11 w-11 with an accessible name', async () => {
    renderWithProviders(<Home />, { route: '/' });

    const muteButton = await screen.findByRole('button', { name: /mute audio/i });
    expect(muteButton).toHaveClass('h-11', 'w-11');
  });

  it("flips the accessible name to 'Unmute audio' once audio is muted", async () => {
    mocks.muteAudio = true;
    renderWithProviders(<Home />, { route: '/' });

    expect(await screen.findByRole('button', { name: /unmute audio/i })).toBeInTheDocument();
  });
});
