import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import PracticeParticles from '@/pages/PracticeParticles';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { FREE_PARTICLE_PRACTICE_SIZE } from '@/lib/particleQueue';
import { findParticleVerb, getVerifiedParticleVerbs } from '@/lib/particleVerbs';
import { verbs } from '@/lib/verbs';
import { STORAGE_VERSION } from '@/hooks/useSrsProgress';
import type { SrsState } from '@/lib/srs';

// Drives the real page against the real dataset, the real queue rules and the
// real localStorage-backed hook. Only the clock is fixed. This is the closest
// thing to an end-to-end run of the mode available under this harness: a
// learner arrives, is shown a card, types, and the schedule moves.

const STORAGE_KEY = 'swedish-verbs-srs-progress';
const NOW = new Date('2026-05-04T09:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function state(itemId: string, overrides: Partial<SrsState> = {}): SrsState {
  return {
    itemId,
    repetitions: 3,
    intervalDays: 10,
    easeFactor: 2.5,
    dueAt: NOW - DAY,
    ...overrides,
  };
}

function readyBase(infinitive: string): Record<string, SrsState> {
  const verbId = verbs.find((verb) => verb.infinitive === infinitive)!.id;
  const out: Record<string, SrsState> = {};
  for (const form of ['presens', 'preteritum'] as const) {
    const itemId = conjugationItemId(verbId, form);
    out[itemId] = state(itemId, { repetitions: 2, dueAt: NOW + 6 * DAY });
  }
  return out;
}

// Issue #315 dropped the conjugation-store gate on particle introductions,
// so a totally fresh account is no longer a totally empty sitting: every
// verified particle verb in the real dataset (this page always builds its
// sitting from the real one) is introduction-eligible from the first
// render. A test that wants one specific card first has to say so, by
// giving every other verified entry a cloze state that already exists —
// not due, and below the recall-unlock threshold — so it can take neither a
// review slot nor an introduction slot.
function otherEntriesAlreadyIntroduced(exceptIds: string[] = []): Record<string, SrsState> {
  const out: Record<string, SrsState> = {};
  for (const candidate of getVerifiedParticleVerbs()) {
    if (exceptIds.includes(candidate.id)) continue;
    const clozeId = particleItemId(candidate.id, 'cloze');
    out[clozeId] = state(clozeId, { repetitions: 1, dueAt: NOW + 90 * DAY });
  }
  return out;
}

function seed(items: Record<string, SrsState>, version = 2) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version, items }));
}

function storedItems(): Record<string, SrsState> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) as string).items;
}

// Writes go through a coalesced writer (src/lib/storage.ts) that debounces
// on a real 500ms timer. A test that reads localStorage twice and compares
// the results is racing that timer: if the initial flush lands between the
// two reads, the comparison sees a shape change (e.g. itemId stripped under
// v3) that has nothing to do with what the test is actually checking. Force
// a synchronous flush before each read instead of waiting on the timer.
function flushPersistence() {
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

beforeEach(() => {
  localStorage.clear();
  // Fake only Date: the page has no production setTimeout/debounce to
  // control (auto-submit and the feedback transition are plain synchronous
  // React state updates), so the sole reason to touch the clock at all is
  // pinning Date.now() for SRS due-date math. Faking setTimeout too (the
  // old shouldAdvanceTime setup did, implicitly) ties @testing-library's
  // internal waitFor polling to the fake clock, which only ever moved
  // because shouldAdvanceTime chased the real host clock — exactly the
  // real-time dependency that starved under parallel-worker/CI contention.
  // Leaving setTimeout real removes that dependency entirely. Symptom report:
  // issue #271 (duplicate #273). Reproduction recipe and repeat-run counts:
  // PR #292. Do not reintroduce shouldAdvanceTime or advanceTimers, and do not
  // add a second bare fake-timer call site — src/test/practice-particles-timers.test.ts
  // fails if you do.
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  return () => vi.useRealTimers();
});

describe('particle practice flow', () => {
  it('tells a learner with nothing due and nothing left to introduce today, without a dead end', async () => {
    // Issue #315: introductions are no longer gated on conjugation progress,
    // so a bare-empty store is not this state any more — with zero pv:
    // state at all, every verified entry is introduction-eligible instead
    // (see the next test) and the sitting is never empty. The one way left
    // to reach an empty sitting is a learner who has already met every
    // verified entry and has nothing due today — which, by the same logic,
    // means every one of those entries is a "not yet due" candidate for the
    // free-practice pool. So unlike the old gated behaviour, the pool here
    // is never empty either, and the button is enabled, not disabled.
    seed(otherEntriesAlreadyIntroduced());

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(
      await screen.findByText(
        /Nothing is due right now, and you have already met every particle verb/,
      ),
    ).toBeInTheDocument();
    // Never a dead end: free practice is offered instead. The button mounts
    // disabled and flips enabled once the freePool effect resolves (see the
    // other two "Keep practising" checks in this file) -- assert after that
    // settles instead of racing it (issue #378's fix, applied here too).
    const keepPractising = await screen.findByRole('button', { name: 'Keep practising' });
    await waitFor(() => expect(keepPractising).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Back to Home' })).toBeInTheDocument();
  });

  it('introduces a new verb without asking anything, then records nothing for it', async () => {
    const user = userEvent.setup();
    // Without the base-verb gate every other verified entry would also be
    // introduction-eligible on a fresh account (issue #315), so every other
    // entry is pinned as already-met to keep pv:tycka-om the only candidate.
    seed({ ...readyBase('tycka'), ...otherEntriesAlreadyIntroduced(['pv:tycka-om']) });
    const pvKeysBeforeSession = Object.keys(storedItems()).filter((key) => key.startsWith('pv:'));

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('A new particle verb')).toBeInTheDocument();
    expect(screen.getByText('to be fond of; to enjoy')).toBeInTheDocument();
    // An introduction is shown, not tested: no input, no grading.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    // Lone introduction with nothing to intervene: the first cloze is
    // deferred rather than asked adjacent to its own answer.
    await waitFor(() => expect(screen.getByText(/finished today's particle verbs/)).toBeVisible());
    // The set of stored pv: keys is exactly what it was before the session:
    // the introduction added none of its own.
    expect(Object.keys(storedItems()).filter((key) => key.startsWith('pv:'))).toEqual(
      pvKeysBeforeSession,
    );
  });

  it('grades a correct cloze answer and advances the schedule', async () => {
    const user = userEvent.setup();
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    // Pin every other verified entry as already-met (issue #315: no more
    // conjugation-store gate, so they would otherwise be introduction- or
    // review-eligible too) so this cloze is the only card in the sitting.
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      [clozeId]: state(clozeId, { repetitions: 3 }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('Fill in the missing particle')).toBeInTheDocument();
    // The gloss is shown alongside the blanked sentence, which is what makes
    // the answer determinate.
    expect(screen.getByText('to be fond of; to enjoy')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'om');

    // Auto-submit on an exact match: "om" is a prefix of nothing else here.
    expect(await screen.findByText('Correct!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    await waitFor(() => expect(storedItems()[clozeId]!.repetitions).toBe(4));
    expect(storedItems()[clozeId]!.dueAt).toBeGreaterThan(NOW);
  });

  it('marks a wrong particle wrong and shows the accepted answer', async () => {
    const user = userEvent.setup();
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    // Pin every other verified entry as already-met (issue #315: no more
    // conjugation-store gate, so they would otherwise be introduction- or
    // review-eligible too) so this cloze is the only card in the sitting.
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      [clozeId]: state(clozeId, { repetitions: 3 }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'upp');
    await user.click(screen.getByRole('button', { name: 'Check Answer' }));

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expect(screen.getByText('upp')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next Card' }));
    await waitFor(() => expect(storedItems()[clozeId]!.repetitions).toBe(0));
  });

  it('accepts every documented alternative on an ambiguous frame, and says so', async () => {
    // skriva ner / ned / upp are all correct in this frame. Marking one wrong
    // would be marking correct Swedish wrong.
    const user = userEvent.setup();
    const clozeId = particleItemId('pv:skriva-ner', 'cloze');
    // `skriva` has a second entry (skriva ut). Give it state so it is not a
    // new verb — an introduction would legitimately take the first slot and
    // this test is about the cloze — and keep it below the recall-unlock
    // threshold so it contributes nothing else either.
    const siblingId = particleItemId('pv:skriva-ut', 'cloze');
    seed({
      ...readyBase('skriva'),
      ...otherEntriesAlreadyIntroduced(['pv:skriva-ner', 'pv:skriva-ut']),
      [clozeId]: state(clozeId, { repetitions: 3 }),
      [siblingId]: state(siblingId, { repetitions: 1, dueAt: NOW + 30 * DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    // Auto-submits: "upp" is an exact accepted answer and a prefix of no
    // other one, so no button press is needed.
    await user.type(screen.getByRole('textbox'), 'upp');

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(screen.getByText('ner, ned and upp are all correct here.')).toBeInTheDocument();
  });

  it('asks a recall card for the whole phrase and accepts a leading att', async () => {
    const user = userEvent.setup();
    const recallId = particleItemId('pv:tycka-om', 'recall');
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      // Cloze not due, recall due: no sibling clash.
      [clozeId]: state(clozeId, { repetitions: 4, dueAt: NOW + 20 * DAY }),
      [recallId]: state(recallId, { repetitions: 2, dueAt: NOW - DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('Produce the whole phrase')).toBeInTheDocument();
    expect(screen.getByText('Write the Swedish particle verb')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'att tycka om');
    await user.click(screen.getByRole('button', { name: 'Check Answer' }));

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });

  it('shows the four conjugated forms as reference on the feedback screen', async () => {
    const user = userEvent.setup();
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    // Pin every other verified entry as already-met (issue #315: no more
    // conjugation-store gate, so they would otherwise be introduction- or
    // review-eligible too) so this cloze is the only card in the sitting.
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      [clozeId]: state(clozeId, { repetitions: 3 }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'om');
    await screen.findByText('Correct!');

    // Exposure only — labelled as untested, so lexical-unit-first holds.
    expect(screen.getByText('For reference — not tested')).toBeInTheDocument();
  });

  it('offers no pronunciation control anywhere on a particle card', async () => {
    // Web Speech cannot be trusted to place particle stress, and wrong
    // prosody teaches wrong Swedish. There is no toggle to get this wrong.
    const user = userEvent.setup();
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    // Pin every other verified entry as already-met (issue #315: no more
    // conjugation-store gate, so they would otherwise be introduction- or
    // review-eligible too) so this cloze is the only card in the sitting.
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      [clozeId]: state(clozeId, { repetitions: 3 }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    expect(screen.queryByRole('button', { name: /pronounce/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'om');
    await screen.findByText('Correct!');
    expect(screen.queryByRole('button', { name: /pronounce/i })).not.toBeInTheDocument();
  });

  it('names the prepositional twin on a card that has one', async () => {
    const user = userEvent.setup();
    const talaOm = findParticleVerb('pv:tala-om')!;
    expect(talaOm.contrast).toBeDefined();
    const clozeId = particleItemId(talaOm.id, 'cloze');
    seed({
      ...readyBase('tala'),
      ...otherEntriesAlreadyIntroduced([talaOm.id]),
      [clozeId]: state(clozeId, { repetitions: 3 }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'om');
    await screen.findByText('Correct!');

    expect(screen.getByText(talaOm.contrast as string)).toBeInTheDocument();
  });

  it('runs a free-practice round that records nothing', async () => {
    const user = userEvent.setup();
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    const recallId = particleItemId('pv:tycka-om', 'recall');
    // Nothing due and nothing left to unlock, so the scheduled sitting is
    // empty. Issue #315: with the base-verb gate gone, an empty scheduled
    // sitting only happens once every verified entry already has a not-due
    // cloze state (see otherEntriesAlreadyIntroduced), so unlike the old
    // gated behaviour the free-practice pool is full rather than a single
    // item. pv:tycka-om still has the nearest due date, so it is what the
    // pool serves first, which is enough to prove a free round writes
    // nothing without walking the rest of a pool this test does not own.
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      [clozeId]: state(clozeId, { repetitions: 4, dueAt: NOW + 10 * DAY }),
      [recallId]: state(recallId, { repetitions: 2, dueAt: NOW + 30 * DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    const keepPractising = await screen.findByRole('button', { name: 'Keep practising' });
    await waitFor(() => expect(keepPractising).toBeEnabled());

    flushPersistence();
    const before = JSON.stringify(storedItems()[clozeId]);
    await user.click(keepPractising);

    expect(await screen.findByText(/Free practice/)).toBeInTheDocument();
    expect(screen.getByText('to be fond of; to enjoy')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'om');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    // The whole point: a free round never writes, whatever else is in the
    // pool. The real schedule for the card just answered did not move.
    flushPersistence();
    expect(JSON.stringify(storedItems()[clozeId])).toBe(before);
  });

  it('shows the free-practice completion message once the round is answered through', async () => {
    // Regression: an earlier revision of this suite asserted this message
    // right after one answer, back when the free pool held a single card.
    // Issue #315 grew the pool to up to FREE_PARTICLE_PRACTICE_SIZE items, so
    // that assertion was dropped rather than updated, leaving the string
    // uncovered. This answers every card the round actually draws and checks
    // the real completion screen it lands on.
    const user = userEvent.setup();
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    const recallId = particleItemId('pv:tycka-om', 'recall');
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      [clozeId]: state(clozeId, { repetitions: 4, dueAt: NOW + 10 * DAY }),
      [recallId]: state(recallId, { repetitions: 2, dueAt: NOW + 30 * DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    const keepPractising = await screen.findByRole('button', { name: 'Keep practising' });
    await waitFor(() => expect(keepPractising).toBeEnabled());
    await user.click(keepPractising);

    for (let cardIndex = 0; cardIndex < FREE_PARTICLE_PRACTICE_SIZE; cardIndex++) {
      // Content does not matter here: a free round never grades, so a
      // deliberately wrong answer exercises the same "advance" path as a
      // right one without depending on each card's accepted answer.
      await user.type(await screen.findByRole('textbox'), 'zzz');
      const checkAnswer = screen.queryByRole('button', { name: 'Check Answer' });
      if (checkAnswer) await user.click(checkAnswer);
      await user.click(await screen.findByRole('button', { name: 'Next Card' }));
    }

    expect(
      await screen.findByText(
        "You've finished this free-practice round — nothing here was saved to your progress.",
      ),
    ).toBeInTheDocument();
  });

  it('never puts both items of one verb in the same sitting', async () => {
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    const recallId = particleItemId('pv:tycka-om', 'recall');
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      [clozeId]: state(clozeId, { repetitions: 4, dueAt: NOW - 2 * DAY }),
      [recallId]: state(recallId, { repetitions: 3, dueAt: NOW - 3 * DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    // The cloze wins; the recall waits, so the sitting is one card long and
    // the cloze feedback cannot hand the learner the recall answer.
    expect(await screen.findByText('Fill in the missing particle')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.queryByText('Produce the whole phrase')).not.toBeInTheDocument();
  });

  // Issue #263: a store written by a build newer than this one (version >
  // the current STORAGE_VERSION) puts useSrsProgress into isReadOnly mode --
  // real localStorage, real hook, so this exercises the actual version
  // guard in useSrsProgress.ts, not a mock's opinion of it.
  describe('read-only progress banner', () => {
    const BANNER_TEXT = /your progress from this session won.t be saved/i;

    it('shows the read-only banner above an active card when the stored version is newer than this build', async () => {
      const clozeId = particleItemId('pv:tycka-om', 'cloze');
      seed(
        {
          ...readyBase('tycka'),
          ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
          [clozeId]: state(clozeId, { repetitions: 3 }),
        },
        STORAGE_VERSION + 1,
      );

      renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

      expect(await screen.findByText('Fill in the missing particle')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(BANNER_TEXT);
    });

    it('shows the read-only banner on the session-complete screen when the stored version is newer than this build', async () => {
      // Issue #315: an empty store is no longer this state (see the top-level
      // "nothing due" test) — every entry already met and nothing due is.
      seed(otherEntriesAlreadyIntroduced(), STORAGE_VERSION + 1);

      renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

      expect(
        await screen.findByText(
          /Nothing is due right now, and you have already met every particle verb/,
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(BANNER_TEXT);
    });

    it('renders no read-only banner for a normal (non-newer) stored version', async () => {
      const clozeId = particleItemId('pv:tycka-om', 'cloze');
      // Pin every other verified entry as already-met (issue #315: no more
      // conjugation-store gate, so they would otherwise be introduction- or
      // review-eligible too) so this cloze is the only card in the sitting.
      seed({
        ...readyBase('tycka'),
        ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
        [clozeId]: state(clozeId, { repetitions: 3 }),
      });

      renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

      expect(await screen.findByText('Fill in the missing particle')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});
