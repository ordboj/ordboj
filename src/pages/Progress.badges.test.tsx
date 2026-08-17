import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Split from the original monolithic Progress.test.tsx (one describe block
// per file) as a qa-side fix for a deterministic CI killer - see the header
// comment in Progress.responsive.test.tsx for the full rationale (per-render
// heap that survives unmount + cleanup() + forced GC, bounded here by
// keeping each file's render count low so vitest's per-file process
// isolation resets it between files).
//
// Temporary until #424 lands: issue #415 grew VERB_DATA from 68 to 971 rows,
// and Progress.tsx renders every row unvirtualized (~13s per render in
// jsdom), blowing past vitest's default 5s testTimeout on every test in this
// file. This is a real perf finding tracked as #424, owned by frontend-expert
// -- qa does not fix the page. frontend-expert removes this raise in the
// #424 PR.
vi.setConfig({ testTimeout: 60000 });

// Progress.tsx composes useSrsProgress (srs-engine) and useSettings
// (frontend-expert) with the real getAllConjugatedVerbs() lookup
// (swedish-linguist). Only the two hooks are mocked here as boundaries this
// suite does not own; the real VERB_DATA / conjugateVerb wiring is left
// untouched so this exercises PR #199 / issue #112's cosmetic fixes
// end-to-end against real data.
vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    srsStates: {},
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: false,
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

describe('Progress page - header emoji fix (AC #2, issue #112)', () => {
  it("renders the page title without the literal flag emoji or 'SE' text, using an icon instead", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const heading = await screen.findByRole('heading', { name: /Progress & Review/i });
    // The Windows-Chrome-hostile flag emoji (U+1F1F8 U+1F1EA "🇸🇪") must be gone.
    expect(heading.textContent).not.toMatch(/\u{1F1F8}\u{1F1EA}/u);
    // And it must not have been replaced by a literal "SE" text fallback.
    expect(heading.textContent?.trim()).toBe('Progress & Review');
    // An icon (lucide Trophy) renders in its place.
    expect(heading.querySelector('svg')).toBeInTheDocument();
  });
});

describe("Progress page - 'New' stage badge color token (AC #4, issue #112)", () => {
  it('renders the New badge using the bg-stage-new token, not the off-palette bg-purple-500', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // Every verb starts at stage 0 ("New") with empty srsStates.
    const newBadges = await screen.findAllByText('New');
    expect(newBadges.length).toBeGreaterThan(0);
    for (const badge of newBadges) {
      // Issue #227 moved this color from the generic bg-primary token to
      // the dedicated bg-stage-new token; the off-palette-purple guard
      // from issue #112 still applies.
      expect(badge).toHaveClass('bg-stage-new');
      expect(badge).not.toHaveClass('bg-purple-500');
    }
  });
});

// Issue #129: same track-contrast fix as Practice.tsx's header bar, applied
// to the mastery summary bar on this page. Pinned separately because it's a
// second, independent call site of the shared Progress primitive.
describe('Progress page - issue #129: mastery bar track contrast', () => {
  it("renders the mastery summary bar's track with a token that has real contrast against the card surface", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // The page carries more than one summary bar since particle mode got its
    // own section (#245). Assert the contrast token on every track rather
    // than narrowing the query to one of them: the #129 defect is a bar the
    // learner cannot see, and that is just as bad on the second bar.
    const tracks = await screen.findAllByRole('progressbar');
    expect(tracks.length).toBeGreaterThan(0);
    for (const track of tracks) {
      expect(track).toHaveClass('bg-muted-foreground');
      expect(track).not.toHaveClass('bg-muted');
      expect(track).not.toHaveClass('bg-secondary');
    }
  });
});
