import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

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
// untouched so this exercises PR #199 / issue #112's cosmetic fixes,
// issue #132's overlapping em-dash fix, and issue #113's responsive
// mobile card list end-to-end against real data.
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

describe('Progress page - responsive table at 360px (#113)', () => {
  it('renders a desktop table (hidden below sm) and a separate mobile card list (hidden at sm+) with the same verb data', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });

    // Narrow to the one verb we can assert on precisely ("vara" is the only
    // infinitive containing that substring in VERB_DATA).
    const search = await screen.findByPlaceholderText('Search by verb...');
    await user.type(search, 'vara');

    // Desktop table: a real <table> row for "vara" with each conjugated form
    // as its own cell.
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table).toHaveTextContent('vara');
    expect(table).toHaveTextContent('är');
    expect(table).toHaveTextContent('varit');

    // The table's Card ancestor must carry both "hidden" (default: not shown
    // below sm) and "sm:block" (shown at sm+) - a 7-column table cannot stay
    // readable at 360px width, so it must not be the layout used there.
    const tableCard = table!.closest('.hidden');
    expect(tableCard).not.toBeNull();
    expect(tableCard!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['hidden', 'sm:block']),
    );

    // Mobile card list: same verb's data rendered as a card, in a container
    // hidden at sm+ (shown only below sm).
    const mobileHeading = screen.getByText('vara', { selector: 'span.font-semibold' });
    expect(mobileHeading).toBeInTheDocument();
    const mobileContainer = mobileHeading.closest('.sm\\:hidden');
    expect(mobileContainer).not.toBeNull();
    expect(mobileContainer!.className.split(/\s+/)).toContain('sm:hidden');
    expect(mobileContainer).toHaveTextContent('är');
    expect(mobileContainer).toHaveTextContent('varit');

    // Regression: before #113 there was only the table, so a 360px-wide
    // screen had no readable alternative at all. Both layouts must coexist
    // in the DOM (CSS breakpoints decide which is visible).
    expect(tableCard).not.toBe(mobileContainer);
  });

  it('gives the results table a bounded, viewport-relative scroll height instead of a fixed 600px', async () => {
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });
    await screen.findByPlaceholderText('Search by verb...');

    // Regression: a bare h-[600px] ScrollArea does not shrink on short
    // viewports (e.g. keyboard open), pushing content off-screen. The fix
    // caps it at the smaller of 600px and 70% of the dynamic viewport
    // height.
    const scrollArea = container.querySelector('[class*="70dvh"]');
    expect(scrollArea).not.toBeNull();
    expect(scrollArea!.className).toContain('h-[min(600px,70dvh)]');

    // The old unbounded fixed-height class must be gone, not just
    // supplemented.
    const oldFixedHeight = container.querySelector('.h-\\[600px\\]');
    expect(oldFixedHeight).toBeNull();
  });

  it('gives the mobile card list a keyboard-operable role, tabIndex and Enter/Space handler that opens the verb modal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const search = await screen.findByPlaceholderText('Search by verb...');
    await user.type(search, 'vara');

    const mobileHeading = screen.getByText('vara', { selector: 'span.font-semibold' });
    const mobileCard = mobileHeading.closest('.sm\\:hidden [role="button"]') as HTMLElement | null;
    expect(mobileCard).not.toBeNull();
    expect(mobileCard).toHaveAttribute('tabIndex', '0');

    mobileCard!.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers a sort affordance below sm that is wired to the same sortBy/sortOrder state as the desktop table headers', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });
    await screen.findByPlaceholderText('Search by verb...');

    // Below sm the table headers (with their onClick sort handlers) are
    // hidden along with the rest of the table, so the card list needs its
    // own control wired to the same sort state - otherwise phone users lose
    // sorting entirely.
    const mobileSort = screen.getByLabelText(/sort verbs/i);
    expect(mobileSort).toBeInTheDocument();
  });
});

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

// Issue #110 AC: sortable TableHead columns need aria-sort plus a keyboard
// path (Enter/Space), not just an onClick a mouse/touch user could reach.
describe('Progress page - sortable column headers: aria-sort + keyboard (issue #110 AC)', () => {
  it('marks the default-sorted "Verb" column ascending via aria-sort; other headers stay unsorted', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });
    // #113: scoped to the desktop table's span, since the mobile card list
    // renders the same infinitive concurrently in the DOM (see the AC #3
    // test above for why plain findByText('kunna') is ambiguous now).
    await screen.findByText('kunna', { selector: 'span:not(.font-semibold)' });

    const verbHeader = screen.getByRole('columnheader', { name: /verb/i });
    const difficultyHeader = screen.getByRole('columnheader', { name: /difficulty/i });
    expect(verbHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(difficultyHeader).toHaveAttribute('aria-sort', 'none');

    // A non-sortable column never got a sort role at all.
    const presensHeader = screen.getByRole('columnheader', { name: 'Presens' });
    expect(presensHeader).not.toHaveAttribute('aria-sort');
  });

  it('reverses the verb row order and flips aria-sort when the "Verb" header is activated by keyboard Enter', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Progress />, { route: '/progress' });
    // #113: scoped to the desktop table's span, since the mobile card list
    // renders the same infinitive concurrently in the DOM (see the AC #3
    // test above for why plain findByText('kunna') is ambiguous now).
    await screen.findByText('kunna', { selector: 'span:not(.font-semibold)' });

    const infinitivesOf = () =>
      Array.from(container.querySelectorAll('tbody tr td:first-child span[lang="sv"]')).map(
        (el) => el.textContent,
      );

    const before = infinitivesOf();
    expect(before.length).toBeGreaterThan(1);

    const verbHeader = screen.getByRole('columnheader', { name: /verb/i });
    const verbSortButton = within(verbHeader).getByRole('button');
    // Real keyboard activation, not a synthetic click: @testing-library/user-event
    // implements the browser's native "Enter triggers click on a focused
    // <button>" default action (event/behavior/keypress.js), unlike a bare
    // fireEvent.keyDown which jsdom does not turn into a click on its own.
    verbSortButton.focus();
    await user.keyboard('{Enter}');

    expect(verbHeader).toHaveAttribute('aria-sort', 'descending');
    expect(infinitivesOf()).toEqual([...before].reverse());
  });

  it('switches sorting to the "Difficulty" column when it is activated by keyboard Space, and the "Verb" header goes back to unsorted', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });
    // #113: scoped to the desktop table's span, since the mobile card list
    // renders the same infinitive concurrently in the DOM (see the AC #3
    // test above for why plain findByText('kunna') is ambiguous now).
    await screen.findByText('kunna', { selector: 'span:not(.font-semibold)' });

    const verbHeader = screen.getByRole('columnheader', { name: /verb/i });
    const difficultyHeader = screen.getByRole('columnheader', { name: /difficulty/i });
    const difficultySortButton = within(difficultyHeader).getByRole('button');
    // Real keyboard activation: user-event's keyup behavior for ' ' dispatches
    // a click on a focused <button> (event/behavior/keyup.js), mirroring the
    // browser's native Space-activates-button default action.
    difficultySortButton.focus();
    await user.keyboard(' ');

    expect(difficultyHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(verbHeader).toHaveAttribute('aria-sort', 'none');
  });
});

// Issue #110 AC: the verb row opens the details modal via a real, focusable
// <button> in its first cell (native keyboard semantics), not a custom
// role="button" TableRow with a hand-rolled onKeyDown.
describe('Progress page - verb row opens the details modal by keyboard (issue #110 AC)', () => {
  it('opens the VerbDetailsModal for "kunna" when its row button is activated by keyboard Enter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const button = await screen.findByRole('button', { name: 'kunna' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Real keyboard activation (see keypress.js note above), not a click
    // stand-in: this is what proves the button is keyboard-reachable, which
    // is the actual issue #110 AC.
    button.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('kunna').length).toBeGreaterThan(0);
  });

  it('opens the VerbDetailsModal when its row button is activated by keyboard Space', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const button = await screen.findByRole('button', { name: 'kunna' });
    button.focus();
    await user.keyboard(' ');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not open the modal on an unrelated key (e.g. Tab) and leaves the row button focusable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Progress />, { route: '/progress' });

    const button = await screen.findByRole('button', { name: 'kunna' });
    button.focus();
    await user.keyboard('{Tab}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // A native <button> needs no tabIndex/role/aria-label wiring to be
    // reachable; pin that contract so a future regression back to a
    // non-native, role="button" element is caught (see next describe block).
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('renders the row button at a 44x44 minimum touch target, not height-only', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });
    const button = await screen.findByRole('button', { name: 'kunna' });
    expect(button).toHaveClass('min-h-11');
    expect(button).toHaveClass('min-w-11');
  });
});

// Regression test for PR #308 round-1 BLOCKER: the verb TableRow previously
// carried role="button"/tabIndex/onKeyDown/aria-label, hijacking the row's
// own semantics away from the table. The fix moved the keyboard-activatable
// control into a nested <button> and left the <tr>/<td> as plain table
// cells. Pin that: if the row semantics ever get clobbered again (e.g. by
// re-adding role="button" to the <tr>), this fails loud.
describe('Progress page - table semantics survive the row-button a11y fix (regression, PR #308)', () => {
  it('still exposes real table row/cell semantics, not a row hijacked into role="button"', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });
    // #113: scoped to the desktop table's span, since the mobile card list
    // renders the same infinitive concurrently in the DOM (see the AC #3
    // test above for why plain findByText('kunna') is ambiguous now).
    await screen.findByText('kunna', { selector: 'span:not(.font-semibold)' });

    const rows = screen.getAllByRole('row');
    // Header row + at least one data row.
    expect(rows.length).toBeGreaterThan(1);

    const firstDataRow = rows[1];
    if (!firstDataRow) {
      throw new Error('expected at least one data row after the header row');
    }
    expect(firstDataRow).not.toHaveAttribute('role', 'button');
    expect(firstDataRow).not.toHaveAttribute('tabindex');

    const cellsInRow = within(firstDataRow).getAllByRole('cell');
    expect(cellsInRow.length).toBeGreaterThan(1);
  });
});

describe("Progress page - lang='sv' on inline Swedish word display (AC #5, issue #112)", () => {
  it("wraps the verb infinitive cell in a lang='sv' span", async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // #113: scoped to the desktop table's span, since the mobile card list
    // also wraps its infinitive in its own lang="sv" span (fact pinned
    // separately by the "responsive table at 360px" suite above).
    const infinitiveCell = await screen.findByText('kunna', {
      selector: 'span:not(.font-semibold)',
    });
    expect(infinitiveCell).toHaveAttribute('lang', 'sv');
  });
});
