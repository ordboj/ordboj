import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';

// Progress.tsx composes useSrsProgress and useSettings (srs-engine). Those
// are mocked here as boundaries this suite does not own, matching the
// pattern already used in Practice.test.tsx. The real getAllConjugatedVerbs()
// (swedish-linguist, src/lib/verbs.ts + src/data/verbData.ts) is left
// untouched, so the actual imperativ audit + the em-dash rendering fix are
// exercised together end-to-end, the way a user would see them.
const mocks = vi.hoisted(() => {
  return {
    srsStates: {} as Record<string, { repetitions: number }>,
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    srsStates: mocks.srsStates,
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

beforeEach(() => {
  mocks.srsStates = {};
});

// Finds the table row whose "Verb" (first) cell matches the given
// infinitive exactly, and returns its cells in column order:
// [Verb, Presens, Preteritum, Supinum, Imperativ, Difficulty, SRS Stage].
// Does not use screen.findByRole('cell', { name }) directly, because for
// verbs whose imperativ equals the infinitive (e.g. "börja" -> "börja")
// that would match two cells in the same row and throw.
async function getRowCells(infinitive: string) {
  const rows = await screen.findAllByRole('row');
  for (const row of rows) {
    const cells = within(row).queryAllByRole('cell');
    if (cells.length > 0 && cells[0].textContent === infinitive) {
      return cells;
    }
  }
  throw new Error(`no table row found with Verb cell "${infinitive}"`);
}

describe('Progress page - imperativ column (issue #132)', () => {
  it('never renders the raw "(not available)" sentinel literal anywhere in the table', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // Wait for the async verb load to finish and the table to be populated.
    await screen.findByRole('cell', { name: 'vara' });

    expect(screen.queryByText('(not available)', { exact: false })).not.toBeInTheDocument();
  });

  it('renders an em dash in the Imperativ cell for a verb that genuinely has no imperativ ("kunna", a modal verb)', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const cells = await getRowCells('kunna');
    // Verb, Presens, Preteritum, Supinum, Imperativ, Difficulty, SRS Stage
    expect(cells[4]).toHaveTextContent('—');
    expect(cells[4]).not.toHaveTextContent('(not available)');
  });

  it('renders the real imperativ form for a verb the audit filled in ("börja" -> "börja")', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const cells = await getRowCells('börja');
    expect(cells[4]).toHaveTextContent('börja');
  });

  it('renders the real imperativ form for a verb the audit filled in ("använda" -> "använd")', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const cells = await getRowCells('använda');
    expect(cells[4]).toHaveTextContent('använd');
  });

  it('renders the real imperativ form for a verb the audit filled in ("behöva" -> "behöv")', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    const cells = await getRowCells('behöva');
    expect(cells[4]).toHaveTextContent('behöv');
  });
});
