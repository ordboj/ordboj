import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
// untouched so this exercises issue #132's overlapping em-dash fix
// end-to-end against real data. The last test below (issue #124) mocks
// @/lib/verbs directly instead, for reasons explained at its describe block.
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

describe('Progress page - Imperativ placeholder (AC #3, issue #112)', () => {
  it("renders an em-dash instead of raw '(not available)' text for a verb with no imperativ", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // "kunna" is a modal verb: VERB_DATA pins its imperativ as "" on
    // purpose (no Swedish imperativ exists for modal verbs). getByText's
    // default node-text matching only considers an element's own direct
    // text-node children, so it matches the innermost <span lang="sv">, not
    // the <td> around it; scoped to the desktop table's plain span
    // (:not(.font-semibold)), not the mobile card list's identically-texted
    // span (which (#113) renders the same infinitive concurrently in the
    // DOM, styled with font-semibold).
    const infinitiveCell = await screen.findByText('kunna', {
      selector: 'span:not(.font-semibold)',
    });
    const row = infinitiveCell.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('—')).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText('(not available)')).not.toBeInTheDocument();
  });
});

describe("Progress page - issue #132: no raw '(not available)' placeholder", () => {
  it('never shows the raw literal "(not available)" string anywhere on the page', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // Wait for the async verb list to finish loading before asserting a
    // global negative, otherwise the assertion would trivially pass while
    // the table is still empty. Scoped to the desktop table's span (see the
    // AC #3 test above for why plain findByText('kunna') is ambiguous now).
    await screen.findByText('kunna', { selector: 'span:not(.font-semibold)' });
    expect(screen.queryByText('(not available)')).not.toBeInTheDocument();
    expect(screen.queryByText(/not available/i)).not.toBeInTheDocument();
  });

  it('still renders a real imperativ form as plain text for a verb that has one', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const infinitiveCell = await screen.findByText('använda', {
      selector: 'span:not(.font-semibold)',
    });
    const row = infinitiveCell.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('använd')).toBeInTheDocument();
  });

  it('renders an em dash, not the raw literal string, for a verb with no imperativ in the mobile card list too', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const search = await screen.findByPlaceholderText('Search by verb...');
    await user.type(search, 'kunna');

    const mobileHeading = screen.getByText('kunna', { selector: 'span.font-semibold' });
    const mobileContainer = mobileHeading.closest('.sm\\:hidden');
    expect(mobileContainer).not.toBeNull();
    expect(within(mobileContainer as HTMLElement).getByText('—')).toBeInTheDocument();
    expect(
      within(mobileContainer as HTMLElement).queryByText('(not available)'),
    ).not.toBeInTheDocument();
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
// actually contain. It also renders a single-row fixture rather than the
// real 900+-row VERB_DATA, so it is unaffected by this file's render-count
// budget (see the header comment above).
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

    // #113: scoped to the desktop table's span, since the mobile card list
    // renders the same infinitive concurrently in the DOM (see the AC #3
    // test above for why plain findByText is ambiguous now).
    const infinitiveCell = await screen.findByText('flagga-fixture', {
      selector: 'span:not(.font-semibold)',
    });
    const row = infinitiveCell.closest('tr') as HTMLElement;
    // The row now also has an unrelated empty-grupp em-dash cell (main's
    // Progress.tsx change), rendered with its own sr-only "not available"
    // label vs. this flag's sr-only "not applicable" label. Scope to the
    // specific cell carrying the "not applicable" label so this stays a
    // targeted assertion about the imperativ column, not a bare-em-dash
    // count that would pass by accident.
    const imperativCell = within(row)
      .getByText('not applicable', { selector: '.sr-only' })
      .closest('td') as HTMLElement;
    expect(within(imperativCell).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('realimperativvalue')).not.toBeInTheDocument();

    vi.resetModules();
    vi.doUnmock('@/lib/verbs');
  });
});
