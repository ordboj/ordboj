import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import Settings from '@/pages/Settings';
import Home from '@/pages/Home';
import Practice from '@/pages/Practice';
import PracticeParticles from '@/pages/PracticeParticles';

// ORD-105. The pages under test compose hooks this file does not own.
// The mocks only supply the fields those pages read while rendering, so the
// assertions stay on the donation link itself.
//
// Settings, the sitting, and srsStates stay referentially stable. Home and
// PracticeParticles re-run effects when those identities change, and a fresh
// object on every render loops setState forever.

const LOSEV_DONATION_URL = 'https://www.losev.org.tr/international-donations';
const SUPPORT_COPY =
  'Ordböj is free. If you want, you can donate to LÖSEV, a foundation for children with leukemia.';

const mocks = vi.hoisted(() => {
  const settings = {
    practiceMode: 'typing' as const,
    showExamples: false,
    autoplayAudio: false,
    muteAudio: true,
    autoReadAllForms: false,
    dailyGoal: 20,
    particleDailyGoal: 12,
    cefrLevels: ['A1'],
  };
  const sitting = {
    cards: [],
    reviewsDue: 0,
    newAllowedToday: 0,
    deferredFirstClozes: [] as string[],
  };
  const dueItem = {
    verbId: '1',
    infinitive: 'vara',
    form: 'presens' as const,
    itemId: '1-presens',
  };
  return {
    settings,
    srsStates: {},
    getDueItems: vi.fn(async () => [dueItem]),
    getParticleSitting: vi.fn(() => sitting),
    updateSettings: vi.fn(),
    recordAnswer: vi.fn(),
    resetProgress: vi.fn(),
    logAnswer: vi.fn(),
    reloadSettingsFromStorage: vi.fn(),
  };
});

vi.mock('@/hooks/useSettings', () => ({
  reloadSettingsFromStorage: mocks.reloadSettingsFromStorage,
  useSettings: () => ({
    isLoading: false,
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
  }),
}));

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: false,
    isReadOnly: false,
    getDueItems: mocks.getDueItems,
    recordAnswer: mocks.recordAnswer,
    srsStates: mocks.srsStates,
    exportData: () => '{}',
    importData: () => true,
    resetProgress: mocks.resetProgress,
    initializeAllItems: () => undefined,
    particleReviewsDue: 0,
    getParticleSitting: mocks.getParticleSitting,
  }),
}));

vi.mock('@/hooks/useAnswerLog', () => ({
  useAnswerLog: () => ({ logAnswer: mocks.logAnswer }),
}));

function expectDonationLink(link: HTMLElement) {
  expect(link).toHaveAttribute('href', LOSEV_DONATION_URL);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
}

describe('ORD-105 Support LÖSEV donation link', () => {
  it('renders the link on Settings, in the About section, with href, target and rel', () => {
    renderWithProviders(<Settings />, { route: '/settings' });

    const about = screen.getByRole('region', { name: 'About' });
    const link = within(about).getByRole('link', { name: /support lösev/i });
    expectDonationLink(link);
    expect(screen.getByText(SUPPORT_COPY)).toBeInTheDocument();
  });

  it('renders the same link in the home footer', async () => {
    renderWithProviders(<Home />, { route: '/' });

    // Home fills the due count and the verb total after mount. Wait for both
    // so the assertion below is not racing a setState.
    await screen.findByText(/conjugations due for review/i);
    await screen.findByText(/verbs in selected levels/i);

    const footer = screen.getByRole('contentinfo');
    const link = within(footer).getByRole('link', { name: /support lösev/i });
    expectDonationLink(link);
    expect(within(footer).getByText(SUPPORT_COPY)).toBeInTheDocument();
  });

  it('does not render the link on the conjugation practice session screen', async () => {
    renderWithProviders(<Practice />, { route: '/practice' });

    // The session chrome is up, so this is the review screen and not an
    // empty render that would hide the link by accident.
    expect(await screen.findByText('1 / 1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /support lösev/i })).not.toBeInTheDocument();
    expect(screen.queryByText(SUPPORT_COPY)).not.toBeInTheDocument();
  });

  it('does not render the link on the particle review session screen', async () => {
    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByRole('button', { name: 'Back to Home' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /support lösev/i })).not.toBeInTheDocument();
    expect(screen.queryByText(SUPPORT_COPY)).not.toBeInTheDocument();
  });
});
