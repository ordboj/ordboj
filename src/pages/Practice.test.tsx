import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Practice from '@/pages/Practice';
import { MAX_REQUEUES_PER_DAY } from '@/lib/srs';

// Practice.tsx composes useSrsProgress (srs-engine) and useSettings
// (srs-engine) with PracticeCard (ui-craft). Those two hooks are mocked here
// as boundaries this suite does not own, driven by hoisted mutable state so
// each test can steer them without re-declaring vi.mock. The real
// conjugateVerb() lookup (swedish-linguist) is left untouched, so the actual
// answer-checking wiring between the page and the card is exercised
// end-to-end, not just the page's own state machine.
const mocks = vi.hoisted(() => {
  return {
    recordAnswer: vi.fn(),
    dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
    srsLoading: false,
    settingsLoading: false,
  };
});

vi.mock('@/hooks/useSrsProgress', () => ({
  useSrsProgress: () => ({
    isLoading: mocks.srsLoading,
    getDueItems: async () => mocks.dueItems,
    recordAnswer: mocks.recordAnswer,
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
      cefrLevels: ['A1'],
    },
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.recordAnswer.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.dueItems = [
    { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
    { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
  ];
});

describe('Practice page - one full session', () => {
  it('walks through both due cards and lands on the completion screen, recording each answer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1 of 2: "vara" presens -> "är"
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    const firstInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(firstInput, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Card 2 of 2: "vara" preteritum -> "var"
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    const secondInput = await screen.findByPlaceholderText('Type your answer...');
    await user.type(secondInput, 'var');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Session complete screen.
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(screen.getByText(/completed all due cards/i)).toBeInTheDocument();

    expect(mocks.recordAnswer).toHaveBeenCalledTimes(2);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(1, '1-presens', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(2, '1-preteritum', 5);
  });

  it('shows the completion screen immediately when there are no due cards', async () => {
    mocks.dueItems = [];
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
  });

  it('shows a loading state before settings and progress have loaded', async () => {
    mocks.settingsLoading = true;
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(screen.getByText(/Loading practice cards/i)).toBeInTheDocument();
    expect(screen.queryByText('1 / 2')).not.toBeInTheDocument();
  });
});

// docs/learning/lapse-handling.md, "Decision" and "Interaction with the
// sitting cap": a lapsed (grade 0) item re-enters the same sitting after at
// least REQUEUE_GAP_ITEMS (3) intervening items and requires one correct
// answer before the sitting can end. These tests drive a real session
// end-to-end (mocked hooks only) to pin that behavior at the level of what
// the learner sees, not by inspecting Practice.tsx internals.
describe('Practice page - same-sitting relearning queue (lapse policy #13)', () => {
  // Six items, distinct real "presens" fixtures from VERB_DATA so each
  // card's correct answer is unambiguous and unique.
  const ANSWERS: Record<string, string> = {
    'v1-presens': 'är', // vara
    'v2-presens': 'har', // ha
    'v3-presens': 'kan', // kunna
    'v4-presens': 'får', // få
    'v5-presens': 'blir', // bli
    'v6-presens': 'kommer', // komma
  };

  beforeEach(() => {
    mocks.dueItems = [
      { verbId: 'v1', infinitive: 'vara', form: 'presens', itemId: 'v1-presens' },
      { verbId: 'v2', infinitive: 'ha', form: 'presens', itemId: 'v2-presens' },
      { verbId: 'v3', infinitive: 'kunna', form: 'presens', itemId: 'v3-presens' },
      { verbId: 'v4', infinitive: 'få', form: 'presens', itemId: 'v4-presens' },
      { verbId: 'v5', infinitive: 'bli', form: 'presens', itemId: 'v5-presens' },
      { verbId: 'v6', infinitive: 'komma', form: 'presens', itemId: 'v6-presens' },
    ];
  });

  it('re-queues a lapsed item after the 3-item gap, does not inflate the progress denominator, and requires a correct retry before the sitting ends', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1: v1 ("vara"), answered wrong. It must stay in the sitting
    // instead of being lost to tomorrow's dueAt.
    expect(await screen.findByText('1 / 6')).toBeInTheDocument();
    let input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'totallywrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    // Still eligible for a same-sitting retry (0 requeues used of the cap).
    expect(screen.getByText(/you'll see this one again/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Cards 2-4: v2, v3, v4, all correct. This clears the 3-item gap for v1,
    // but v1 has not yet resolved, so the "N / total" numerator (backed by
    // completedItemIds) does not advance past what has actually resolved.
    for (const id of ['v2-presens', 'v3-presens', 'v4-presens']) {
      input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, ANSWERS[id]);
      await screen.findByText('Correct!');
      await user.click(screen.getByRole('button', { name: /next card/i }));
    }

    // Cards 5-6: v5, v6, also correct.
    for (const id of ['v5-presens', 'v6-presens']) {
      input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, ANSWERS[id]);
      await screen.findByText('Correct!');
      await user.click(screen.getByRole('button', { name: /next card/i }));
    }

    // v1 must reappear now (spliced back after v4 cleared the gap) instead
    // of the sitting ending at 6/6 with the lapse unresolved.
    expect(screen.queryByText(/Great Work/i)).not.toBeInTheDocument();
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Only now, once the retry is resolved, does the sitting end.
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();

    // v1 was graded twice: the lapse (0) and the successful retry (5). Every
    // other item was graded once, correct (5).
    expect(mocks.recordAnswer).toHaveBeenCalledTimes(7);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(1, 'v1-presens', 0);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(2, 'v2-presens', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(3, 'v3-presens', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(4, 'v4-presens', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(5, 'v5-presens', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(6, 'v6-presens', 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(7, 'v1-presens', 5);
  });

  // History: this test originally caught a real stuck-session bug, fixed by
  // the duplicate-splice guard in Practice.tsx's handleAnswer (39a1a00). A
  // pending item's `itemsSinceLapse` kept advancing while a previously
  // spliced, not-yet-retried copy of it already sat later in the queue, so
  // with enough filler items the gap threshold cleared a second time before
  // the first retry was shown and a *second* copy was spliced in -- burning
  // the MAX_REQUEUES_PER_DAY cap unseen, and (because PracticeCard is keyed
  // on itemId) freezing the UI on the previous attempt's feedback panel when
  // the two copies ended up back-to-back. The guard now blocks a splice for
  // any item that already has a copy beyond the currently-shown card; this
  // test and the "double gap clearance" test below pin that invariant.
  it('caps a same-day lapsing item at MAX_REQUEUES_PER_DAY re-queues, then lets the sitting end without it looping forever', async () => {
    // A generous, always-answered-correctly filler supply so the 3-item gap
    // is never starved -- "vara" is the one item this learner always gets
    // wrong, to exercise the daily cap deterministically.
    const fillers: Array<[string, string, string]> = [
      ['ha', 'har', 'presens'],
      ['kunna', 'kan', 'presens'],
      ['få', 'får', 'presens'],
      ['bli', 'blir', 'presens'],
      ['komma', 'kommer', 'presens'],
      ['vilja', 'vill', 'presens'],
      ['göra', 'gör', 'presens'],
      ['finna', 'finner', 'presens'],
      ['ta', 'tar', 'presens'],
      ['se', 'ser', 'presens'],
      ['gå', 'går', 'presens'],
      ['säga', 'säger', 'presens'],
    ];
    const answerByInfinitive: Record<string, string> = { vara: 'är' };
    mocks.dueItems = [
      { verbId: 'lapser', infinitive: 'vara', form: 'presens', itemId: 'lapser-presens' },
      ...fillers.map(([infinitive, answer], i) => {
        answerByInfinitive[infinitive] = answer;
        return {
          verbId: `filler${i}`,
          infinitive,
          form: 'presens',
          itemId: `filler${i}-presens`,
        };
      }),
    ];

    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    let lapsingItemAppearances = 0;
    let safety = 0;
    while (!screen.queryByText(/Great Work/i)) {
      safety += 1;
      if (safety > 60) {
        throw new Error(
          'Session did not complete within 60 answers -- the requeue cap did not stop the loop',
        );
      }
      const heading = await screen.findByRole('heading', { level: 2 });
      const headingText = heading.textContent;
      const input = await waitFor(() => {
        const el = screen.queryByPlaceholderText('Type your answer...');
        if (!el) {
          throw new Error(
            `Step ${safety}: expected a fresh answer input for card "${headingText}", but none ` +
              `appeared (the feedback panel from the previous attempt is still showing). This is the ` +
              `stuck-session bug: the same item got queued twice before its first retry was ever shown ` +
              `and answered, and PracticeCard's key={itemId} does not remount for the duplicate, so the ` +
              `UI is frozen with no way for the learner to continue.`,
          );
        }
        return el;
      });

      if (headingText?.includes('vara')) {
        lapsingItemAppearances += 1;
        await user.type(input, 'wrongwrongwrong');
        await user.click(screen.getByRole('button', { name: /check answer/i }));
        await screen.findByText('Not quite');
      } else {
        const infinitive = Object.keys(answerByInfinitive).find((inf) =>
          heading.textContent?.includes(inf),
        );
        expect(infinitive).toBeDefined();
        await user.type(input, answerByInfinitive[infinitive as string]);
        await screen.findByText('Correct!');
      }
      await user.click(screen.getByRole('button', { name: /next card/i }));
    }

    // Decision: "max re-queues per item per day: 2, then drop to tomorrow" --
    // so the always-wrong item may appear at most once (the original lapse)
    // plus MAX_REQUEUES_PER_DAY same-sitting retries, never more.
    expect(lapsingItemAppearances).toBeGreaterThan(1); // proves a re-queue did happen
    expect(lapsingItemAppearances).toBeLessThanOrEqual(3); // 1 initial + MAX_REQUEUES_PER_DAY(2)

    // The lapsing item's every submission was graded wrong (0); the cap
    // means it never gets a chance to resolve correctly in this sitting.
    const lapsingCalls = mocks.recordAnswer.mock.calls.filter(([id]) => id === 'lapser-presens');
    expect(lapsingCalls.length).toBe(lapsingItemAppearances);
    for (const [, grade] of lapsingCalls) {
      expect(grade).toBe(0);
    }
  });

  // The duplicate-splice guard at scale: with 8 always-correct fillers the
  // lapser's 3-item gap clears at filler 3 (splice) and clears AGAIN at
  // filler 6 while the first retry copy is still waiting at the tail.
  // Without the guard that second clearing spliced a second copy and burned
  // the daily cap unseen; with it, exactly one retry is served. Also pins
  // the mid-session counter: a lapse never ticks the numerator, and the
  // retry card shows resolved-count, not queue position.
  it('splices only one retry copy even when the gap threshold clears twice before the retry is shown', async () => {
    const fillers: Array<[string, string]> = [
      ['ha', 'har'],
      ['kunna', 'kan'],
      ['få', 'får'],
      ['bli', 'blir'],
      ['komma', 'kommer'],
      ['vilja', 'vill'],
      ['göra', 'gör'],
      ['finna', 'finner'],
    ];
    mocks.dueItems = [
      { verbId: 'lapser', infinitive: 'vara', form: 'presens', itemId: 'lapser-presens' },
      ...fillers.map(([infinitive], i) => ({
        verbId: `filler${i}`,
        infinitive,
        form: 'presens',
        itemId: `filler${i}-presens`,
      })),
    ];

    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    // Card 1: the lapser, wrong.
    expect(await screen.findByText('1 / 9')).toBeInTheDocument();
    let input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'wrongwrongwrong');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await screen.findByText('Not quite');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    // Mid-session counter: the lapse did not tick the numerator, so the
    // next card still reads 1 / 9 (0 resolved + the card being shown).
    expect(await screen.findByText('1 / 9')).toBeInTheDocument();

    for (const [, answer] of fillers) {
      input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, answer);
      await screen.findByText('Correct!');
      await user.click(screen.getByRole('button', { name: /next card/i }));
    }

    // The single retry copy. Counter shows the 8 resolved fillers, not a
    // ninth position for the re-shown card.
    expect(await screen.findByText('8 / 9')).toBeInTheDocument();
    input = await screen.findByPlaceholderText('Type your answer...');
    await user.type(input, 'är');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: /next card/i }));

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();

    // Exactly one retry happened: 9 first passes + 1 retry, lapser graded
    // wrong then correct.
    expect(mocks.recordAnswer).toHaveBeenCalledTimes(10);
    const lapsingCalls = mocks.recordAnswer.mock.calls.filter(([id]) => id === 'lapser-presens');
    expect(lapsingCalls.map(([, grade]) => grade)).toEqual([0, 5]);
  });

  // Wrong answer on the requeued copy itself: the lapse -> retry(wrong) ->
  // second retry(wrong) chain must consume the cap one shown retry at a
  // time and still terminate. Three late-lapsing fillers supply the 3-item
  // gap after the first failed retry (their own retries are the intervening
  // answers), so the lapser earns its second and final requeue.
  it('a wrong retry re-queues again until the cap is spent, then the item drops to tomorrow', async () => {
    const script: Array<{ infinitive: string; answer: string | null }> = [
      { infinitive: 'vara', answer: null }, // lapse
      { infinitive: 'ha', answer: 'har' },
      { infinitive: 'kunna', answer: 'kan' },
      { infinitive: 'få', answer: 'får' }, // gap cleared -> retry 1 spliced
      { infinitive: 'bli', answer: 'blir' },
      { infinitive: 'komma', answer: 'kommer' },
      { infinitive: 'vilja', answer: 'vill' },
      { infinitive: 'göra', answer: null }, // late lapses...
      { infinitive: 'finna', answer: null },
      { infinitive: 'ta', answer: null },
      { infinitive: 'vara', answer: null }, // retry 1, wrong (cap 1 of 2 spent)
      { infinitive: 'göra', answer: 'gör' }, // the late lapsers' retries...
      { infinitive: 'finna', answer: 'finner' },
      { infinitive: 'ta', answer: 'tar' }, // ...clear the lapser's gap again
      { infinitive: 'vara', answer: null }, // retry 2, wrong (cap spent)
    ];
    const fillerInfinitives = ['ha', 'kunna', 'få', 'bli', 'komma', 'vilja', 'göra', 'finna', 'ta'];
    mocks.dueItems = [
      { verbId: 'lapser', infinitive: 'vara', form: 'presens', itemId: 'lapser-presens' },
      ...fillerInfinitives.map((infinitive, i) => ({
        verbId: `filler${i}`,
        infinitive,
        form: 'presens',
        itemId: `filler${i}-presens`,
      })),
    ];

    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    for (const step of script) {
      const input = await screen.findByPlaceholderText('Type your answer...');
      if (step.answer === null) {
        await user.type(input, 'wrongwrongwrong');
        await user.click(screen.getByRole('button', { name: /check answer/i }));
        await screen.findByText('Not quite');
      } else {
        await user.type(input, step.answer);
        await screen.findByText('Correct!');
      }
      await user.click(screen.getByRole('button', { name: /next card/i }));
    }

    // The cap-spending third failure ends the sitting: no fourth showing.
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(mocks.recordAnswer).toHaveBeenCalledTimes(script.length);

    // 1 initial lapse + MAX_REQUEUES_PER_DAY shown retries, all wrong.
    const lapsingCalls = mocks.recordAnswer.mock.calls.filter(([id]) => id === 'lapser-presens');
    expect(lapsingCalls.map(([, grade]) => grade)).toEqual([0, 0, 0]);
    expect(lapsingCalls.length).toBe(1 + MAX_REQUEUES_PER_DAY);

    // The late lapsers each resolved on their single retry.
    for (const verb of ['göra', 'finna', 'ta']) {
      const i = fillerInfinitives.indexOf(verb);
      const calls = mocks.recordAnswer.mock.calls.filter(([id]) => id === `filler${i}-presens`);
      expect(calls.map(([, grade]) => grade)).toEqual([0, 5]);
    }
  });

  // docs/learning/lapse-handling.md: "If the day ends with a re-queue still
  // pending, it is simply due tomorrow with the lapse already applied --
  // nothing is lost." The in-memory bookkeeping implements that by wiping
  // itself on the first answer of a new local day (baseMap = {}), so a
  // pending retry is dropped rather than served: the item's dueAt, set at
  // the lapse, already falls on the new day. This pins that reset.
  it('drops a pending re-queue when the local day flips mid-sitting', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 0, 15, 23, 50, 0));
      const fillers: Array<[string, string]> = [
        ['ha', 'har'],
        ['kunna', 'kan'],
        ['få', 'får'],
        ['bli', 'blir'],
      ];
      mocks.dueItems = [
        { verbId: 'lapser', infinitive: 'vara', form: 'presens', itemId: 'lapser-presens' },
        ...fillers.map(([infinitive], i) => ({
          verbId: `filler${i}`,
          infinitive,
          form: 'presens',
          itemId: `filler${i}-presens`,
        })),
      ];

      const user = userEvent.setup();
      renderWithProviders(<Practice />, { route: '/practice' });

      // 23:50, Jan 15: the lapser goes wrong and starts waiting for its gap.
      let input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, 'wrongwrongwrong');
      await user.click(screen.getByRole('button', { name: /check answer/i }));
      await screen.findByText('Not quite');
      await user.click(screen.getByRole('button', { name: /next card/i }));

      // Still Jan 15 for one filler...
      input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, fillers[0][1]);
      await screen.findByText('Correct!');
      await user.click(screen.getByRole('button', { name: /next card/i }));

      // ...then midnight passes mid-sitting.
      vi.setSystemTime(new Date(2026, 0, 16, 0, 5, 0));

      for (const [, answer] of fillers.slice(1)) {
        input = await screen.findByPlaceholderText('Type your answer...');
        await user.type(input, answer);
        await screen.findByText('Correct!');
        await user.click(screen.getByRole('button', { name: /next card/i }));
      }

      // The sitting ends without serving the retry: the pending entry was
      // dropped at the day flip, and the item is simply due on the new day.
      expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
      expect(mocks.recordAnswer).toHaveBeenCalledTimes(5);
      const lapsingCalls = mocks.recordAnswer.mock.calls.filter(([id]) => id === 'lapser-presens');
      expect(lapsingCalls.map(([, grade]) => grade)).toEqual([0]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Regression for #103: the deck must be fixed once at session start. The
// mocked useSrsProgress hook below returns a brand-new `getDueItems`
// closure on every render (exactly like the real hook, whose getDueItems is
// recreated whenever srsStates changes) and `recordAnswer` mutates the
// underlying due list the way a real answer does: the answered item stops
// being due, so a fresh call to getDueItems() would no longer include it.
// Before the fix, Practice.tsx's load effect depended on `getDueItems`
// itself, so every post-answer re-render (a fresh getDueItems identity)
// re-ran the effect and overwrote `dueItems` with the shrunken list while
// `currentIndex` kept advancing into it -- skipping a card. This test walks
// a full 3-card session and asserts every item is shown exactly once, in a
// stable order, with the denominator never changing size mid-session.
describe('Practice page - regression #103 (mid-session deck reshuffle)', () => {
  it('keeps the deck fixed for the whole session: every item seen exactly once, none skipped or repeated', async () => {
    mocks.dueItems = [
      { verbId: '1', infinitive: 'vara', form: 'presens', itemId: '1-presens' },
      { verbId: '1', infinitive: 'vara', form: 'preteritum', itemId: '1-preteritum' },
      { verbId: '1', infinitive: 'vara', form: 'supinum', itemId: '1-supinum' },
    ];

    const answeredOrder: string[] = [];
    mocks.recordAnswer.mockImplementation((itemId: string) => {
      answeredOrder.push(itemId);
      // Simulate the real SRS hook: once an item is answered its next
      // review moves into the future, so it drops out of getDueItems().
      mocks.dueItems = mocks.dueItems.filter((item) => item.itemId !== itemId);
    });

    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    const expectedAnswers = [
      { itemId: '1-presens', answer: 'är' },
      { itemId: '1-preteritum', answer: 'var' },
      { itemId: '1-supinum', answer: 'varit' },
    ];

    for (let i = 0; i < expectedAnswers.length; i++) {
      // The denominator must stay 3 for the whole session, on every card --
      // this is exactly what the reshuffle bug breaks.
      expect(await screen.findByText(`${i + 1} / 3`)).toBeInTheDocument();

      const input = await screen.findByPlaceholderText('Type your answer...');
      await user.type(input, expectedAnswers[i].answer);
      expect(await screen.findByText('Correct!')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /next card/i }));
    }

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(answeredOrder).toEqual(expectedAnswers.map((e) => e.itemId));
    // No repeats, none skipped, all three seen exactly once.
    expect(new Set(answeredOrder).size).toBe(3);
  });
});
