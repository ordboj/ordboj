import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    await screen.findByText('kunna');

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
    await screen.findByText('kunna');

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
    await screen.findByText('kunna');

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
    await screen.findByText('kunna');

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

    const infinitiveCell = await screen.findByText('kunna');
    expect(infinitiveCell).toHaveAttribute('lang', 'sv');
  });
});
