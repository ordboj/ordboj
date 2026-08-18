import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import PracticeParticles from '@/pages/PracticeParticles';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { findParticleVerb, getVerifiedParticleVerbs } from '@/lib/particleVerbs';
import { verbs } from '@/lib/verbs';
import { ANSWER_LOG_STORAGE_KEY, type AnswerLogEntry } from '@/lib/answerLog';
import { useAnswerLog } from '@/hooks/useAnswerLog';
import type { SrsState } from '@/lib/srs';

// Pins the one call site in PracticeParticles.tsx (handleAnswer's
// `if (card.kind === 'cloze' && card.entry.examples.length > 0)` block) that
// writes to the per-answer diagnostic log: a scheduled cloze answer logs
// exactly one entry with the shape the three falsifier functions in
// src/lib/answerLog.ts expect, a recall answer / an introduction / a
// free-practice answer log nothing, and a logAnswer failure can never block
// the practice flow (the try/catch fixed at 634b89d, "fix: guarantee
// fire-and-forget logAnswer at the call site").
//
// The fixtures below (state/readyBase/otherEntriesAlreadyIntroduced/seed/
// flushPersistence) and the fake-timer beforeEach are duplicated from
// src/pages/PracticeParticles.test.tsx on purpose, not imported: this file
// owns its own fixtures, and src/test/practice-particles-timers.test.ts
// already asserts that PracticeParticles.test.tsx contains exactly the one
// fake-timer call site documented there. Adding a second one there (e.g. by
// re-exporting this file's beforeEach into it) is exactly what that scanner
// exists to catch, so this file's beforeEach stays local instead.

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
// giving every other verified entry a cloze state that already exists --
// not due, and below the recall-unlock threshold -- so it can take neither a
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

// Writes go through a coalesced writer (src/lib/storage.ts) that debounces
// on a real 500ms timer. Force a synchronous flush before reading storage
// instead of waiting on it -- both the progress store and the answer log's
// own writer (src/hooks/useAnswerLog.ts) listen for the same 'pagehide'
// event.
function flushPersistence() {
  act(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

// The diagnostic log's own store, separate from STORAGE_KEY above. Never
// having been set at all (raw === null) is the routine "nothing logged yet"
// case -- useAnswerLog.ts only schedules a write on load when the stored
// payload had to be replaced, which a clean beforeEach never triggers -- so
// it reads as zero entries rather than a parse error.
function readAnswerLogEntries(): AnswerLogEntry[] {
  const raw = localStorage.getItem(ANSWER_LOG_STORAGE_KEY);
  if (raw === null) return [];
  return (JSON.parse(raw) as { entries: AnswerLogEntry[] }).entries;
}

// useAnswerLog is mocked only for the one test (case g) that needs
// logAnswer to throw. Every other test resets the mock to the real
// implementation in beforeEach, so cases (a)-(f) exercise the actual hook,
// the actual coalesced writer and actual localStorage; the mock exists
// solely to prove the call site's try/catch, not to stand in for the hook
// generally (this file does not own src/hooks/useAnswerLog.ts and must not
// pretend to test it).
// vi.mock is hoisted above every other top-level statement in this file, so
// the holder for the real implementation has to be created through
// vi.hoisted rather than a plain `let` -- a plain variable referenced inside
// the factory below would still be in its temporal dead zone at the point
// the hoisted mock runs.
const actualHolder = vi.hoisted(() => ({
  useAnswerLog: undefined as unknown as typeof import('@/hooks/useAnswerLog').useAnswerLog,
}));
vi.mock('@/hooks/useAnswerLog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAnswerLog')>();
  actualHolder.useAnswerLog = actual.useAnswerLog;
  return { useAnswerLog: vi.fn() };
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(useAnswerLog).mockImplementation(actualHolder.useAnswerLog);
  // Fake only Date, matching src/pages/PracticeParticles.test.tsx: the page
  // has no production setTimeout/debounce this suite needs to control, so
  // the sole reason to touch the clock is pinning Date.now() for SRS
  // due-date math (the fixtures above) and for the log entry's own `t`
  // field. See that file's beforeEach for the full history (issue #271,
  // PR #292) of why setTimeout stays real.
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  return () => vi.useRealTimers();
});

const clozeId = particleItemId('pv:tycka-om', 'cloze');

// Pins every other verified entry as already-met (issue #315) so this cloze
// is the only card in the sitting, same shape as the "grades a correct
// cloze answer" test in PracticeParticles.test.tsx.
function seedSingleCloze(overrides: Partial<SrsState> = {}) {
  seed({
    ...readyBase('tycka'),
    ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
    [clozeId]: state(clozeId, { repetitions: 3, ...overrides }),
  });
}

describe('particle practice answer log', () => {
  it('(a) writes exactly one entry for a correct scheduled cloze answer', async () => {
    const user = userEvent.setup();
    seedSingleCloze();

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'om');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    flushPersistence();
    const entries = readAnswerLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      i: 'pv:tycka-om:cloze',
      m: 'typed',
      k: true,
      f: 0,
    });
  });

  it('(b) logs the frame index that was actually rendered on screen, not a recomputed one', async () => {
    // Pins the call site's `repetitions % card.entry.examples.length`
    // against selectExample (src/lib/particleVerbs.ts) -- the function the
    // card itself uses to pick which example to show. Both are fed the same
    // pre-answer repetitions value, so if they ever drift apart (a
    // different modulus base, an off-by-one) the logged frame would
    // silently point at a sentence the learner was never actually shown.
    const user = userEvent.setup();
    seedSingleCloze();
    const entry = findParticleVerb('pv:tycka-om')!;

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'om');
    await screen.findByText('Correct!');

    // Captured while the card is still mounted: clicking Next Card advances
    // straight past this screen to session-complete, and this test's whole
    // point is what was on screen at the moment the answer was logged.
    const screenText = document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    flushPersistence();
    const entries = readAnswerLogEntries();
    expect(entries).toHaveLength(1);
    const loggedFrame = entries[0]!.f;

    expect(screenText).toContain(entry.examples[loggedFrame]!.sv);
  });

  it('(c) writes k:false for a wrong particle', async () => {
    const user = userEvent.setup();
    seedSingleCloze();

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'upp');
    await user.click(screen.getByRole('button', { name: 'Check Answer' }));
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    flushPersistence();
    const entries = readAnswerLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      i: 'pv:tycka-om:cloze',
      m: 'typed',
      k: false,
    });
  });

  it('(d) writes no entry for a recall card answer', async () => {
    const user = userEvent.setup();
    const recallId = particleItemId('pv:tycka-om', 'recall');
    seed({
      ...readyBase('tycka'),
      ...otherEntriesAlreadyIntroduced(['pv:tycka-om']),
      // Cloze not due, recall due: no sibling clash (same shape as "asks a
      // recall card for the whole phrase" in PracticeParticles.test.tsx).
      [clozeId]: state(clozeId, { repetitions: 4, dueAt: NOW + 20 * DAY }),
      [recallId]: state(recallId, { repetitions: 2, dueAt: NOW - DAY }),
    });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    expect(await screen.findByText('Produce the whole phrase')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'att tycka om');
    await user.click(screen.getByRole('button', { name: 'Check Answer' }));
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    flushPersistence();
    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();
  });

  it('(e) writes no entry for an introduction card', async () => {
    const user = userEvent.setup();
    // Without the base-verb gate every other verified entry would also be
    // introduction-eligible on a fresh account (issue #315), so every other
    // entry is pinned as already-met to keep pv:tycka-om the only candidate.
    seed({ ...readyBase('tycka'), ...otherEntriesAlreadyIntroduced(['pv:tycka-om']) });

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    expect(await screen.findByText('A new particle verb')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.getByText(/finished today's particle verbs/)).toBeVisible());

    flushPersistence();
    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();
  });

  it('(f) writes no entry for a free-practice round answer', async () => {
    const user = userEvent.setup();
    const recallId = particleItemId('pv:tycka-om', 'recall');
    // Nothing due and nothing left to unlock, so the scheduled sitting is
    // empty and the free-practice pool serves pv:tycka-om's cloze first
    // (nearest due date), same shape as "runs a free-practice round that
    // records nothing" in PracticeParticles.test.tsx.
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

    expect(await screen.findByText(/Free practice/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'om');
    await screen.findByText('Correct!');
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    flushPersistence();
    expect(localStorage.getItem(ANSWER_LOG_STORAGE_KEY)).toBeNull();
  });

  it('(g) still advances to the completion screen when logAnswer throws', async () => {
    // Fire-and-forget proof for the try/catch handleAnswer wraps the
    // logAnswer call in (634b89d, "fix: guarantee fire-and-forget logAnswer
    // at the call site"): a diagnostic sink failure must never block the
    // practice flow it instruments.
    const user = userEvent.setup();
    vi.mocked(useAnswerLog).mockImplementation(() => ({
      logAnswer: () => {
        throw new Error('boom: simulated logAnswer failure');
      },
    }));
    seedSingleCloze();

    renderWithProviders(<PracticeParticles />, { route: '/practice-particles' });
    await screen.findByText('Fill in the missing particle');

    await user.type(screen.getByRole('textbox'), 'om');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Card' }));

    // The one card in this sitting was just answered, so a session that did
    // not get stuck inside the throwing logAnswer call lands on the
    // completion screen.
    await waitFor(() => expect(screen.getByText(/finished today's particle verbs/)).toBeVisible());
  });
});
