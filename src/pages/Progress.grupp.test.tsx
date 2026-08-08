import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import Progress from '@/pages/Progress';
import type { ConjugatedVerb } from '@/lib/verbs';

// Issue #228 (AC): a "Grupp" column/badge in the Progress table. This suite
// controls getAllConjugatedVerbs/getVerbGrupp directly (rather than relying
// on real VERB_DATA, which currently has a grupp assigned on every row) so
// the "unknown grupp renders as absent, never guessed" branch
// (src/lib/verbs.ts:29-32) is actually exercised.
// Fixture names deliberately avoid the substring "grupp" so that a
// `/grupp/i` text query only ever matches the rendered badge, not the verb
// name itself.
const KNOWN_FIXTURE_VERB = 'known-class-verb-fixture';
const UNKNOWN_FIXTURE_VERB = 'unclassified-verb-fixture';

const FIXTURE_VERBS: ConjugatedVerb[] = [
  {
    id: '1',
    infinitive: KNOWN_FIXTURE_VERB,
    cefr: 'A1',
    presens: 'x-presens',
    preteritum: 'x-preteritum',
    supinum: 'x-supinum',
    imperativ: 'x-imperativ',
  },
  {
    id: '2',
    infinitive: UNKNOWN_FIXTURE_VERB,
    cefr: 'A1',
    presens: 'y-presens',
    preteritum: 'y-preteritum',
    supinum: 'y-supinum',
    imperativ: 'y-imperativ',
  },
];

vi.mock('@/lib/verbs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/verbs')>('@/lib/verbs');
  return {
    ...actual,
    getAllConjugatedVerbs: async () => FIXTURE_VERBS,
    getVerbGrupp: (infinitive: string) =>
      infinitive === KNOWN_FIXTURE_VERB ? ('2a' as const) : undefined,
  };
});

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

describe('Progress page - Grupp column (issue #228)', () => {
  it('renders a "Grupp" column header', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    expect(await screen.findByRole('columnheader', { name: 'Grupp' })).toBeInTheDocument();
  });

  it('shows a "grupp 2a" badge for a verb with a known grupp, and an em-dash (never a literal "undefined") for a verb whose grupp is unknown', async () => {
    renderWithProviders(<Progress />, { route: '/progress' });

    // #113: scoped to the desktop table's span, since the mobile card list
    // (below sm, still present in the DOM) renders the same infinitive
    // concurrently, in its own identically-texted, font-semibold span.
    const knownCell = await screen.findByText(KNOWN_FIXTURE_VERB, {
      selector: 'span:not(.font-semibold)',
    });
    const knownRow = knownCell.closest('tr') as HTMLElement;
    expect(within(knownRow).getByText('grupp 2a')).toBeInTheDocument();

    const unknownCell = await screen.findByText(UNKNOWN_FIXTURE_VERB, {
      selector: 'span:not(.font-semibold)',
    });
    const unknownRow = unknownCell.closest('tr') as HTMLElement;
    expect(within(unknownRow).queryByText(/grupp/i)).not.toBeInTheDocument();
    expect(within(unknownRow).getByText('—')).toBeInTheDocument();
    expect(within(unknownRow).getByText('not available')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });
});
