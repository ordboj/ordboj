import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import ProgressPage from '@/pages/Progress';

// Progress.tsx composes useSrsProgress (srs-engine), useSettings
// (frontend-expert) and getAllConjugatedVerbs (swedish-linguist). All three
// are mocked here as boundaries this suite does not own.
vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    srsStates: {},
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: 20,
      cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    },
    updateSettings: vi.fn(),
  }),
}));

vi.mock('@/lib/verbs', () => ({
  getAllConjugatedVerbs: async () => [
    {
      id: '1',
      infinitive: 'vara',
      presens: 'är',
      preteritum: 'var',
      supinum: 'varit',
      imperativ: 'var',
      cefr: 'A1',
    },
  ],
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Issue #129: same track-contrast fix as Practice.tsx's header bar, applied
// to the mastery summary bar on this page. Pinned separately because it's a
// second, independent call site of the shared Progress primitive.
describe('Progress page - issue #129: mastery bar track contrast', () => {
  it("renders the mastery summary bar's track with a token that has real contrast against the card surface", async () => {
    renderWithProviders(<ProgressPage />, { route: '/progress' });

    const track = await screen.findByRole('progressbar');
    expect(track).toHaveClass('bg-muted-foreground');
    expect(track).not.toHaveClass('bg-muted');
    expect(track).not.toHaveClass('bg-secondary');
  });
});
