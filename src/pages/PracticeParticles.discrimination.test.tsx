import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import PracticeParticles from '@/pages/PracticeParticles';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { getVerifiedParticleVerbs } from '@/lib/particleVerbs';
import { verbs } from '@/lib/verbs';
import { ANSWER_LOG_STORAGE_KEY, type AnswerLogEntry } from '@/lib/answerLog';
import type { SrsState } from '@/lib/srs';

// Issue #473: the 3-option discrimination card render mode on the particle
// practice page. Fixtures duplicated verbatim from
// src/pages/PracticeParticles.test.tsx on purpose, not imported -- that
// file's own header explains why (src/test/practice-particles-timers.test.ts
// asserts it contains exactly one fake-timer call site, so a shared
// beforeEach cannot live there and be re-exported here without becoming a
// second one).

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

// The diagnostic log's own store, separate from STORAGE_KEY above (same
// helper as src/pages/PracticeParticles.answerLog.test.tsx). Never having
// been set at all (raw === null) reads as zero entries.
function readAnswerLogEntries(): AnswerLogEntry[] {
  const raw = localStorage.getItem(ANSWER_LOG_STORAGE_KEY);
  if (raw === null) return [];
  return (JSON.parse(raw) as { entries: AnswerLogEntry[] }).entries;
}

beforeEach(() => {
  localStorage.clear();
  // Fake only Date -- see PracticeParticles.test.tsx's beforeEach comment
  // (issue #271 / PR #292) for why setTimeout stays real.
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  return () => vi.useRealTimers();
});

const kommaIhagClozeId = particleItemId('pv:komma-ihag', 'cloze');

// pv:komma-ihag's excludedParticles are ['in', 'fram'] on every frame
// (src/data/particleVerbData.ts). Seeding readyBase('komma') plus every
// other verified entry as already-met (which gives pv:komma-in and
// pv:komma-fram their own cloze SRS state, satisfying "introduced" per
// docs/learning/2026-08-08-discrimination-exercise.md) makes both lures
// eligible, so this frame is discrimination-eligible from repetitions 3 on
// whenever the trigger lands.
function seedKommaIhag(overrides: Partial<SrsState> = {}) {
  seed({
    ...readyBase('komma'),
    ...otherEntriesAlreadyIntroduced(['pv:komma-ihag']),
    [kommaIhagClozeId]: state(kommaIhagClozeId, overrides),
  });
}

describe('particle practice discrimination card', () => {
  it('(a) renders a 3-option choice card, not a textbox, at the trigger repetitions', async () => {
    seedKommaIhag({ repetitions: 3 });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('Choose the correct particle verb')).toBeInTheDocument();
    const options = screen.getAllByRole('button', { name: /^komma / });
    expect(options).toHaveLength(3);
    expect(options.map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['komma ihåg', 'komma in', 'komma fram']),
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('(b) falls back to a typed cloze off the trigger repetitions', async () => {
    seedKommaIhag({ repetitions: 4 });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('Fill in the missing particle')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('(c) falls back to a typed cloze for a frame with no excludedParticles, even at the trigger repetitions', async () => {
    const clozeId = particleItemId('pv:tycka-om', 'cloze');
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      [clozeId]: state(clozeId, { repetitions: 3 }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });

    expect(await screen.findByText('Fill in the missing particle')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('(d) tapping a lure grades it wrong, lapses the schedule and logs the tapped lure', async () => {
    const user = userEvent.setup();
    seedKommaIhag({ repetitions: 3 });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Choose the correct particle verb');

    await user.click(screen.getByRole('button', { name: 'komma in' }));

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    flushPersistence();
    expect(storedItems()[kommaIhagClozeId]).toMatchObject({
      repetitions: 0,
      easeFactor: 2.3,
      intervalDays: 1,
    });

    const entries = readAnswerLogEntries();
    expect(entries[0]).toMatchObject({
      i: 'pv:komma-ihag:cloze',
      m: 'choice',
      k: false,
      f: 0,
      l: ['in', 'fram'],
      p: 'in',
    });
  });

  it('(e) tapping the target grades it correct, advances the schedule and logs no tapped lure', async () => {
    const user = userEvent.setup();
    seedKommaIhag({ repetitions: 3 });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Choose the correct particle verb');

    await user.click(screen.getByRole('button', { name: 'komma ihåg' }));

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    flushPersistence();
    expect(storedItems()[kommaIhagClozeId]).toMatchObject({
      repetitions: 4,
      easeFactor: 2.5,
      intervalDays: 16,
    });

    const entries = readAnswerLogEntries();
    expect(entries[0]).toMatchObject({
      m: 'choice',
      k: true,
      p: null,
      l: ['in', 'fram'],
    });
  });

  it('(f) the first tap commits: the option buttons unmount immediately, no re-tap', async () => {
    const user = userEvent.setup();
    seedKommaIhag({ repetitions: 3 });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Choose the correct particle verb');

    await user.click(screen.getByRole('button', { name: 'komma in' }));
    await screen.findByText('Not quite');

    expect(screen.queryAllByRole('button', { name: /^komma / })).toHaveLength(0);
  });

  it('(g) rotates the target option position across renders, keyed on the render index', async () => {
    const renders: [number, string[]][] = [
      [3, ['komma ihåg', 'komma in', 'komma fram']],
      [6, ['komma in', 'komma fram', 'komma ihåg']],
      [9, ['komma fram', 'komma ihåg', 'komma in']],
    ];

    const positions: number[] = [];
    for (const [repetitions, expectedOrder] of renders) {
      localStorage.clear();
      seedKommaIhag({ repetitions });

      const { unmount } = renderWithProviders(<PracticeParticles />, {
        route: '/practice-particles',
      });
      await screen.findByText('Choose the correct particle verb');

      const options = screen.getAllByRole('button', { name: /^komma / });
      expect(options.map((button) => button.textContent)).toEqual(expectedOrder);
      positions.push(expectedOrder.indexOf('komma ihåg'));

      unmount();
    }

    // Not the same index at every one of the three renders.
    expect(new Set(positions).size).toBeGreaterThan(1);
  });

  it('(h) shows the chosen lure gloss on the feedback screen', async () => {
    const user = userEvent.setup();
    seedKommaIhag({ repetitions: 3 });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Choose the correct particle verb');

    await user.click(screen.getByRole('button', { name: 'komma in' }));
    await screen.findByText('Not quite');

    // The gloss text is a sibling text node next to the bold lemma span
    // (ParticleVerbCard.tsx), not its own element, so match on the
    // containing paragraph's text via regex rather than an exact string.
    expect(screen.getByText(/to enter; to gain admission/)).toBeInTheDocument();
  });

  it('(i) offers a pronounce-sentence control on the discrimination feedback screen', async () => {
    const user = userEvent.setup();
    seedKommaIhag({ repetitions: 3 });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Choose the correct particle verb');

    await user.click(screen.getByRole('button', { name: 'komma ihåg' }));
    await screen.findByText('Correct!');

    expect(screen.getByRole('button', { name: /pronounce sentence/i })).toBeInTheDocument();
  });
});
