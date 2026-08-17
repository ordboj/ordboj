import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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
// untouched so this exercises PR #308's table-semantics fix and AC #5's
// lang="sv" wiring end-to-end against real data.
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
