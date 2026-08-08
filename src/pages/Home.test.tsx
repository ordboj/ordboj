import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Home from '@/pages/Home';

// Home.tsx composes useSrsProgress and useSettings (both srs-engine owned)
// to show a due-card count. They are mocked here as boundaries this suite
// does not own. `getDueItems` supports two modes, chosen per test via
// `mocks.useDueItemsSequence`:
//  - a fixed list (`mocks.dueItems`), for the DOM-nesting regression below,
//    which only needs a due count > 0.
//  - a call-indexed sequence (like the real hook, whose getDueItems is a
//    useCallback recreated whenever srsStates changes) for the #103
//    recompute-on-unrelated-render regression, where a fresh-but-identical
//    getDueItems reference on every render must not cause a recompute.
// `getVerbs`/`loadVoices` are left real: they are swedish-linguist/
// frontend-expert owned and side-effect free in jsdom.
const mocks = vi.hoisted(() => {
  return {
    srsLoading: false,
    settingsLoading: false,
    cefrLevels: ['A1', 'A2'] as string[],
    dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
    useDueItemsSequence: false,
    dueItemsCallIndex: 0,
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: mocks.srsLoading,
    getDueItems: async () => {
      if (!mocks.useDueItemsSequence) {
        return mocks.dueItems;
      }
      // First call simulates the real due count (5). Any later call (which
      // should never happen once the deck-load effect is fixed to only
      // react to isLoading/settingsLoading/cefrLevels) simulates the count
      // having dropped, so a spurious recompute is loud and observable.
      const lengths = [5, 1, 1, 1, 1];
      const idx = Math.min(mocks.dueItemsCallIndex, lengths.length - 1);
      mocks.dueItemsCallIndex += 1;
      const len = lengths[idx];
      return Array.from({ length: len }, (_, i) => ({
        verbId: String(i),
        infinitive: 'vara',
        form: 'presens' as const,
        itemId: `item-${i}`,
      }));
    },
    recordAnswer: vi.fn(),
    exportData: () => '{}',
    importData: () => true,
    resetProgress: () => undefined,
    srsStates: {},
    initializeAllItems: () => undefined,
  }),
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    isLoading: mocks.settingsLoading,
    settings: {
      practiceMode: 'typing',
      showExamples: false,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: 20,
      cefrLevels: mocks.cefrLevels,
    },
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.cefrLevels = ['A1', 'A2'];
  mocks.useDueItemsSequence = false;
  mocks.dueItemsCallIndex = 0;
  mocks.dueItems = [
    { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
    { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
  ];
});

describe('Home - due-count DOM nesting (regression, issue #112 AC #1)', () => {
  it('does not log a validateDOMNesting <div>-in-<p> warning when cards are due', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProviders(<Home />);

    // Wait for the async getDueItems() effect to resolve and the
    // due-count branch (the one that used to nest divs) to render.
    const dueMessage = await screen.findByText(/conjugations due for review/i);

    // React logs this with a %s-templated format string as args[0] plus the
    // interpolated tag names as separate args (e.g. args = [format, '<div>',
    // 'p', ...]) — console.error never does the substitution itself, so
    // "<p>" never appears as a literal substring anywhere in the raw args
    // (the ancestor tag arg is the bare name "p", not "<p>"). A check for
    // the literal substring "<p>" — on one arg or joined across all of
    // them — passes vacuously whether or not the warning fired. Check the
    // format string and tag-name args separately instead.
    const nestingWarning = errorSpy.mock.calls.find(([message, ...rest]) => {
      return (
        typeof message === 'string' &&
        message.includes('validateDOMNesting') &&
        rest.includes('<div>') &&
        rest.includes('p')
      );
    });
    expect(nestingWarning).toBeUndefined();

    // The due-count text must not be nested inside a <p> element (i.e. it
    // was pulled out of CardDescription's <p> into a plain <div>).
    expect(dueMessage.closest('p')).toBeNull();

    errorSpy.mockRestore();
  });
});

describe('Home page - regression #103 (due count recompute on unrelated render)', () => {
  it('does not recompute the due count when an unrelated re-render happens', async () => {
    mocks.useDueItemsSequence = true;
    const user = userEvent.setup();
    renderWithProviders(<Home />, { route: '/' });

    expect(await screen.findByText(/5 conjugations due for review/i)).toBeInTheDocument();

    // Toggle a CEFR level checkbox: this changes Home's own `selectedLevels`
    // state (an unrelated re-render caused by user interaction elsewhere on
    // the page), not `isLoading`/`settingsLoading`/`settings.cefrLevels`.
    // It must not cause the due-count effect to recompute just because
    // useSrsProgress() handed back a fresh (but functionally identical)
    // getDueItems reference on this render.
    const a2Checkbox = screen.getByRole('checkbox', { name: 'A2' });
    await user.click(a2Checkbox);

    // Give any (incorrect) recompute a chance to land before asserting.
    await waitFor(() => {
      expect(screen.getByText(/conjugations due for review/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/5 conjugations due for review/i)).toBeInTheDocument();
  });
});
