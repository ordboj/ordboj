import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import PracticeParticles from '@/pages/PracticeParticles';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { findParticleVerb } from '@/lib/particleVerbs';
import { verbs } from '@/lib/verbs';
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

function seed(items: Record<string, SrsState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, items }));
}

function storedItems(): Record<string, SrsState> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) as string).items;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  return () => vi.useRealTimers();
});

describe('particle practice flow', () => {
  it('tells a learner with no eligible verbs that the mode unlocks later, without a dead end', async () => {
    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText(/No particle verbs are ready for you yet/)).toBeInTheDocument();
    // Never a dead end: the button exists even when the pool is empty, it is
    // simply disabled rather than absent.
    expect(screen.getByRole('button', { name: 'Keep practising' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to Home' })).toBeInTheDocument();
  });

  it('introduces a new verb without asking anything, then records nothing for it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    seed(readyBase('tycka'));

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('A new particle verb')).toBeInTheDocument();
    expect(screen.getByText('to be fond of; to enjoy')).toBeInTheDocument();
    // An introduction is shown, not tested: no input, no grading.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    // Lone introduction with nothing to intervene: the first cloze is
    // deferred rather than asked adjacent to its own answer.
    await waitFor(() => expect(screen.getByText(/finished today's particle verbs/)).toBeVisible());
    expect(Object.keys(storedItems()).filter((key) => key.startsWith('pv:'))).toEqual([]);
  });

  it('grades a correct cloze answer and advances the schedule', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    seed({ ...readyBase('tycka'), [clozeId]: state(clozeId, { repetitions: 3 }) });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('Fill in the missing particle')).toBeInTheDocument();
    // The gloss is shown alongside the blanked sentence, which is what makes
    // the answer determinate.
    expect(screen.getByText('to be fond of; to enjoy')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'om');

    // Auto-submit on an exact match: "om" is a prefix of nothing else here.
    // Real-time slack: fake timers with shouldAdvanceTime tie this wait to
    // the host clock, and parallel workers starve the default 1000ms budget.
    expect(await screen.findByText('Correct!', {}, { timeout: 3000 })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    await waitFor(() => expect(storedItems()[clozeId]!.repetitions).toBe(4));
    expect(storedItems()[clozeId]!.dueAt).toBeGreaterThan(NOW);
  });

  it('marks a wrong particle wrong and shows the accepted answer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    seed({ ...readyBase('tycka'), [clozeId]: state(clozeId, { repetitions: 3 }) });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'upp');
    await user.click(screen.getByRole('button', { name: 'Check Answer' }));

    // Real-time slack: fake timers with shouldAdvanceTime tie this wait to
    // the host clock, and parallel workers starve the default 1000ms budget.
    expect(await screen.findByText('Not quite', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('upp')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next Card' }));
    await waitFor(() => expect(storedItems()[clozeId]!.repetitions).toBe(0));
  });

  it('accepts every documented alternative on an ambiguous frame, and says so', async () => {
    // skriva ner / ned / upp are all correct in this frame. Marking one wrong
    // would be marking correct Swedish wrong.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const clozeId = particleItemId('pv:skriva-ner', 'cloze');
    // `skriva` has a second entry (skriva ut). Give it state so it is not a
    // new verb — an introduction would legitimately take the first slot and
    // this test is about the cloze — and keep it below the recall-unlock
    // threshold so it contributes nothing else either.
    const siblingId = particleItemId('pv:skriva-ut', 'cloze');
    seed({
      ...readyBase('skriva'),
      [clozeId]: state(clozeId, { repetitions: 3 }),
      [siblingId]: state(siblingId, { repetitions: 1, dueAt: NOW + 30 * DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    // Auto-submits: "upp" is an exact accepted answer and a prefix of no
    // other one, so no button press is needed.
    await user.type(screen.getByRole('textbox'), 'upp');

    // Real-time slack: fake timers with shouldAdvanceTime tie this wait to
    // the host clock, and parallel workers starve the default 1000ms budget.
    expect(await screen.findByText('Correct!', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('ner, ned and upp are all correct here.')).toBeInTheDocument();
  });

  it('asks a recall card for the whole phrase and accepts a leading att', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const recallId = particleItemId('pv:tycka-om', 'recall');
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    seed({
      ...readyBase('tycka'),
      // Cloze not due, recall due: no sibling clash.
      [clozeId]: state(clozeId, { repetitions: 4, dueAt: NOW + 20 * DAY }),
      [recallId]: state(recallId, { repetitions: 2, dueAt: NOW - DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('Produce the whole phrase')).toBeInTheDocument();
    expect(screen.getByText('Write the Swedish particle verb')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'att tycka om');
    await user.click(screen.getByRole('button', { name: 'Check Answer' }));

    // Real-time slack: fake timers with shouldAdvanceTime tie this wait to
    // the host clock, and parallel workers starve the default 1000ms budget.
    expect(await screen.findByText('Correct!', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('shows the four conjugated forms as reference on the feedback screen', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    seed({ ...readyBase('tycka'), [clozeId]: state(clozeId, { repetitions: 3 }) });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'om');
    // Real-time slack: fake timers with shouldAdvanceTime tie this wait to
    // the host clock, and parallel workers starve the default 1000ms budget.
    await screen.findByText('Correct!', {}, { timeout: 3000 });

    // Exposure only — labelled as untested, so lexical-unit-first holds.
    expect(screen.getByText('For reference — not tested')).toBeInTheDocument();
  });

  it('offers no pronunciation control anywhere on a particle card', async () => {
    // Web Speech cannot be trusted to place particle stress, and wrong
    // prosody teaches wrong Swedish. There is no toggle to get this wrong.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    seed({ ...readyBase('tycka'), [clozeId]: state(clozeId, { repetitions: 3 }) });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    expect(screen.queryByRole('button', { name: /pronounce/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'om');
    // Real-time slack: fake timers with shouldAdvanceTime tie this wait to
    // the host clock, and parallel workers starve the default 1000ms budget.
    await screen.findByText('Correct!', {}, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /pronounce/i })).not.toBeInTheDocument();
  });

  it('names the prepositional twin on a card that has one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const talaOm = findParticleVerb('pv:tala-om')!;
    expect(talaOm.contrast).toBeDefined();
    const clozeId = particleItemId(talaOm.id, 'cloze');
    seed({ ...readyBase('tala'), [clozeId]: state(clozeId, { repetitions: 3 }) });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'om');
    // Real-time slack: fake timers with shouldAdvanceTime tie this wait to
    // the host clock, and parallel workers starve the default 1000ms budget.
    await screen.findByText('Correct!', {}, { timeout: 3000 });

    expect(screen.getByText(talaOm.contrast as string)).toBeInTheDocument();
  });

  it('runs a free-practice round that records nothing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    const recallId = particleItemId('pv:tycka-om', 'recall');
    // Nothing due and nothing left to unlock, so the scheduled sitting is
    // empty and the free pool is not. The cloze has the nearer future due
    // date, so it is what the pool serves first.
    seed({
      ...readyBase('tycka'),
      [clozeId]: state(clozeId, { repetitions: 4, dueAt: NOW + 10 * DAY }),
      [recallId]: state(recallId, { repetitions: 2, dueAt: NOW + 30 * DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    const keepPractising = await screen.findByRole('button', { name: 'Keep practising' });
    await waitFor(() => expect(keepPractising).toBeEnabled());

    const before = JSON.stringify(storedItems()[clozeId]);
    await user.click(keepPractising);

    expect(await screen.findByText(/Free practice/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'om');
    // Real-time slack: fake timers with shouldAdvanceTime tie this wait to
    // the host clock, and parallel workers starve the default 1000ms budget.
    await screen.findByText('Correct!', {}, { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    await waitFor(() =>
      expect(screen.getByText(/nothing here was saved to your progress/)).toBeVisible(),
    );
    // The whole point: the real schedule did not move.
    expect(JSON.stringify(storedItems()[clozeId])).toBe(before);
  });

  it('never puts both items of one verb in the same sitting', async () => {
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    const recallId = particleItemId('pv:tycka-om', 'recall');
    seed({
      ...readyBase('tycka'),
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
});
