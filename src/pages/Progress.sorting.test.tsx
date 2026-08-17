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
// untouched so this exercises issue #110's sortable headers end-to-end
// against real data.
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
