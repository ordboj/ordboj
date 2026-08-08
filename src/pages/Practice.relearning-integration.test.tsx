import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, useEffect, useRef } from 'react';
import { useSrsProgress, type PracticeItem } from '@/hooks/useSrsProgress';
import { RELEARNING_MIN_GAP, type Grade } from '@/lib/srs';
import type { ConjugatedVerb, Verb } from '@/lib/verbs';

// Deliberately does NOT mock '@/hooks/useSrsProgress' or '@/lib/srs' (unlike
// Practice.test.tsx, which mocks the whole hook): this suite proves the
// same-session relearning queue (issue #133) against the REAL srs-engine
// code end-to-end, not just Practice.tsx's splice logic in isolation.
//
// It renders a minimal clone of Practice.tsx's own state wiring (same
// effect, same handleAnswer body -- see the comment above PracticeClone)
// instead of the actual Practice.tsx + PracticeCard tree. This is a
// deliberate, evidence-based choice, not a shortcut: an earlier version of
// this suite rendered the real <Practice /> page with the real
// <PracticeCard />, and reproducibly crashed the Vitest worker with an
// out-of-heap-memory error a few hundred milliseconds after a single wrong
// answer was submitted through the real UI (confirmed 3 times, including
// with a render/effect-count safety valve that still did not prevent the
// crash). That crash is a SEPARATE, more severe defect than the one this
// file pins down (see the QA report routed to the lead: an unbounded
// render loop specifically requires PracticeCard's key={itemId}-driven
// remount cycle, not just the hook wiring below) and must not be
// encoded as an automated test: it reliably OOM-kills the test process.
//
// What IS safe, deterministic, and fully proves the acceptance-criterion
// defect on its own: Practice.tsx's own effect + handleAnswer wiring,
// exercised against the real useSrsProgress/srs.ts, with a plain stub
// in place of PracticeCard's UI. This still reproduces the core wiring bug
// (below) without touching the PracticeCard-specific crash trigger.
const FIXTURE_VERBS: Verb[] = [{ id: '1', infinitive: 'testa', cefr: 'A1' }];
const FIXTURE_CONJUGATION: ConjugatedVerb = {
  id: '1',
  infinitive: 'testa',
  cefr: 'A1',
  presens: 'testar',
  preteritum: 'testade',
  supinum: 'testat',
  imperativ: 'testa',
};

vi.mock('@/lib/verbs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/verbs')>();
  return {
    ...actual,
    getVerbs: vi.fn(async () => FIXTURE_VERBS),
    conjugateVerb: vi.fn(async () => FIXTURE_CONJUGATION),
  };
});

beforeEach(() => {
  localStorage.clear();
});

// Stable across renders, matching real useSettings.ts (settings.cefrLevels
// lives in useState, so it is referentially stable unless updateSettings
// runs). An inline ["A1"] literal passed fresh on every render would itself
// make getDueItems churn every render -- a test artifact that would
// misattribute the defect below to the wrong cause.
const STABLE_CEFR_LEVELS = ['A1'];

// A byte-for-byte-equivalent copy of Practice.tsx's own
// `useEffect(loadDueItems, [isLoading, settingsLoading, getDueItems])` and
// `handleAnswer` (settingsLoading omitted: this harness has no useSettings
// dependency to wait on). See file-level comment for why PracticeCard is
// replaced with a plain stub.
function PracticeClone() {
  const { getDueItems, recordAnswer, isLoading } = useSrsProgress(STABLE_CEFR_LEVELS);
  const [dueItems, setDueItems] = useState<PracticeItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const loadDueItems = async () => {
      if (!isLoading) {
        const items = await getDueItems();
        setDueItems(items);
        if (items.length === 0) setComplete(true);
      }
    };
    loadDueItems();
  }, [isLoading, getDueItems]);

  const handleAnswer = (grade: Grade) => {
    const currentItem = dueItems[currentIndex];
    const needsRequeue = recordAnswer(currentItem.itemId, grade)?.needsRequeue ?? false;

    if (needsRequeue) {
      setDueItems((prev) => {
        const next = [...prev];
        const insertAt = Math.min(currentIndex + RELEARNING_MIN_GAP, next.length);
        next.splice(insertAt, 0, currentItem);
        return next;
      });
    }

    if (currentIndex < dueItems.length - 1 || needsRequeue) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setComplete(true);
    }
  };

  if (complete) return <div data-testid="complete" />;
  if (dueItems.length === 0 || !dueItems[currentIndex]) return <div data-testid="empty" />;

  return (
    <div>
      <span data-testid="progress">
        {currentIndex + 1} / {dueItems.length}
      </span>
      <button onClick={() => handleAnswer(0)}>answer-wrong</button>
      <button onClick={() => handleAnswer(5)}>answer-right</button>
    </div>
  );
}

describe('Practice.tsx wiring + real useSrsProgress - same-session relearning (issue #133)', () => {
  it("regression: a wrong answer must grow the session's remaining-card count, not shrink it", async () => {
    const user = userEvent.setup();
    render(<PracticeClone />);

    // All 4 forms of the single fixture verb are freshly initialized and
    // immediately due (dueAt defaults to "now").
    await waitFor(() => expect(screen.getByTestId('progress')).toHaveTextContent('1 / 4'));

    await user.click(screen.getByRole('button', { name: 'answer-wrong' }));

    // The failed card must be requeued INTO this session (issue #133): the
    // remaining count must grow (4 -> 5, RELEARNING_MIN_GAP=3 inserted
    // within a 4-item queue), never shrink or hold steady.
    //
    // useSrsProgress.recordAnswer calls setSrsStates on every answer, which
    // is a dependency of the memoized getDueItems callback; this effect
    // (copied verbatim from Practice.tsx) depends on that same reference.
    // When it re-fires, it overwrites the manually spliced dueItems array
    // with a freshly recomputed due list -- and the failed item's dueAt
    // just moved to tomorrow, so it is no longer due and drops out of that
    // recomputed list entirely. The result is indistinguishable from the
    // pre-#133 bug ("failed cards vanish until tomorrow") this ticket was
    // filed to fix: the queue shrinks to 3, not grows to 5.
    await waitFor(() => expect(screen.getByTestId('progress')).toHaveTextContent('2 / 5'));
  });
});
