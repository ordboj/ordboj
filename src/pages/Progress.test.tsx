import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Progress.tsx composes useSrsProgress (srs-engine) and useSettings
// (frontend-expert) with the real getAllConjugatedVerbs() lookup
// (swedish-linguist). Only the two hooks are mocked here as boundaries this
// suite does not own; the real VERB_DATA / conjugateVerb wiring is left
// untouched so this exercises PR #199 / issue #112's cosmetic fixes (and
// issue #132's overlapping em-dash fix) end-to-end against real data.
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
      cefrLevels: ['A1'],
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
  it('renders the New badge using the bg-primary token, not the off-palette bg-purple-500', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // Every verb starts at stage 0 ("New") with empty srsStates.
    const newBadges = await screen.findAllByText('New');
    expect(newBadges.length).toBeGreaterThan(0);
    for (const badge of newBadges) {
      expect(badge).toHaveClass('bg-primary');
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

describe('Progress page - Imperativ placeholder (AC #3, issue #112)', () => {
  it("renders an em-dash instead of raw '(not available)' text for a verb with no imperativ", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // "kunna" is a modal verb: VERB_DATA pins its imperativ as "" on
    // purpose (no Swedish imperativ exists for modal verbs).
    const infinitiveCell = await screen.findByText('kunna');
    const row = infinitiveCell.closest('tr') as HTMLElement;
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('(not available)')).not.toBeInTheDocument();
  });
});

describe("Progress page - issue #132: no raw '(not available)' placeholder", () => {
  it('never shows the raw literal "(not available)" string anywhere on the page', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // Wait for the async verb list to finish loading before asserting a
    // global negative, otherwise the assertion would trivially pass while
    // the table is still empty.
    await screen.findByText('kunna');
    expect(screen.queryByText('(not available)')).not.toBeInTheDocument();
    expect(screen.queryByText(/not available/i)).not.toBeInTheDocument();
  });

  it('still renders a real imperativ form as plain text for a verb that has one', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const infinitiveCell = await screen.findByText('använda');
    const row = infinitiveCell.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('använd')).toBeInTheDocument();
  });
});

// Issue #124: verb.imperativNotApplicable flags a form as grammatically
// confirmed absent (modal verbs), distinct from a merely empty/placeholder
// value. This fixture gives the flagged verb a REAL, non-empty imperativ
// value (not the "(not available)" sentinel), so rendering the em-dash can
// only be explained by the new flag -- against pre-#124 code (no such
// field, no such check), a real non-empty value always rendered as plain
// text, so this fails there for the right reason. getAllConjugatedVerbs is
// mocked directly (the one boundary this test needs) rather than the
// underlying data table, so this is independent of what VERB_DATA/verbs.ts
// actually contain.
describe('Progress page - imperativNotApplicable flag hides imperativ regardless of stored value (issue #124)', () => {
  it('renders the em-dash placeholder for a verb flagged imperativNotApplicable, even though its imperativ is a real, non-empty string', async () => {
    vi.resetModules();
    vi.doMock('@/lib/verbs', async () => {
      const actual = await vi.importActual<typeof import('@/lib/verbs')>('@/lib/verbs');
      return {
        ...actual,
        getAllConjugatedVerbs: async () => [
          {
            id: '1',
            infinitive: 'flagga-fixture',
            cefr: 'A1',
            presens: 'flaggarx',
            preteritum: 'flaggadex',
            supinum: 'flaggatx',
            imperativ: 'realimperativvalue',
            imperativNotApplicable: true,
          },
        ],
      };
    });

    const { default: MockedProgress } = await import('@/pages/Progress');
    renderWithProviders(<MockedProgress />, { route: '/progress' });

    const infinitiveCell = await screen.findByText('flagga-fixture');
    const row = infinitiveCell.closest('tr') as HTMLElement;
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('realimperativvalue')).not.toBeInTheDocument();

    vi.resetModules();
    vi.doUnmock('@/lib/verbs');
  });
});

describe("Progress page - lang='sv' on inline Swedish word display (AC #5, issue #112)", () => {
  it("wraps the verb infinitive cell in a lang='sv' span", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const infinitiveCell = await screen.findByText('kunna');
    expect(infinitiveCell).toHaveAttribute('lang', 'sv');
  });
});
