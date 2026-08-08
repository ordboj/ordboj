import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateNextReview,
  initializeSrsState,
  isDue,
  MAX_INTERVAL_DAYS,
  type SrsState,
  type Grade,
} from '@/lib/srs';

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('initializeSrsState', () => {
  it('echoes the itemId and sets the documented defaults', () => {
    const state = initializeSrsState('1-presens');

    expect(state).toEqual<SrsState>({
      itemId: '1-presens',
      repetitions: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      dueAt: FIXED_NOW,
    });
  });

  it('uses the current clock for dueAt, not a snapshot taken elsewhere', () => {
    const first = initializeSrsState('a');
    vi.setSystemTime(FIXED_NOW + DAY_MS);
    const second = initializeSrsState('a');

    expect(first.dueAt).toBe(FIXED_NOW);
    expect(second.dueAt).toBe(FIXED_NOW + DAY_MS);
  });
});

describe('calculateNextReview - ease factor', () => {
  it.each<[Grade, number]>([
    [5, 2.55],
    [0, 2.3],
  ])('grade %i moves ease factor from 2.5 to %s', (grade, expected) => {
    const state = initializeSrsState('x');
    const next = calculateNextReview(state, grade);
    expect(next.easeFactor).toBeCloseTo(expected, 5);
  });

  it('never lets the ease factor drop below the 1.3 floor, however many failures in a row', () => {
    let state = initializeSrsState('x');
    for (let i = 0; i < 10; i++) {
      state = calculateNextReview(state, 0);
      expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
    }
    expect(state.easeFactor).toBe(1.3);
  });

  it('two consecutive wrongs land at 2.1, well above the floor', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 0); // 2.5 -> 2.3
    state = calculateNextReview(state, 0); // 2.3 -> 2.1
    expect(state.easeFactor).toBeCloseTo(2.1, 5);
  });

  it('floor is reachable after six consecutive failing grades from the default 2.5 start', () => {
    let state = initializeSrsState('x');
    const expectedEase = [2.3, 2.1, 1.9, 1.7, 1.5, 1.3];
    for (const expected of expectedEase) {
      state = calculateNextReview(state, 0);
      expect(state.easeFactor).toBeCloseTo(expected, 5);
    }
    expect(state.easeFactor).toBe(1.3);
  });
});

describe('calculateNextReview - lapse behavior (grade 0)', () => {
  it('resets repetitions to 0 and interval to 1 day even from a long streak', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5); // rep 1, interval 1
    state = calculateNextReview(state, 5); // rep 2, interval 6
    state = calculateNextReview(state, 5); // rep 3, interval round(6*ease)
    expect(state.repetitions).toBe(3);
    expect(state.intervalDays).toBeGreaterThan(1);

    const lapsed = calculateNextReview(state, 0);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
  });
});

describe('calculateNextReview - interval progression on success (grade 5)', () => {
  it('first success sets interval to 1 day and repetitions to 1', () => {
    const state = calculateNextReview(initializeSrsState('x'), 5);
    expect(state.repetitions).toBe(1);
    expect(state.intervalDays).toBe(1);
  });

  it('second consecutive success sets interval to 6 days', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5);
    state = calculateNextReview(state, 5);
    expect(state.repetitions).toBe(2);
    expect(state.intervalDays).toBe(6);
  });

  it('third+ success rounds interval * easeFactor, with ease still rising', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5); // rep1 interval1, ease 2.55
    state = calculateNextReview(state, 5); // rep2 interval6, ease 2.60
    state = calculateNextReview(state, 5); // rep3 interval round(6*2.65)=16
    expect(state.repetitions).toBe(3);
    expect(state.easeFactor).toBeCloseTo(2.65, 5);
    expect(state.intervalDays).toBe(16);

    const fourth = calculateNextReview(state, 5); // rep4 ease 2.70, interval round(16*2.70)=43
    expect(fourth.repetitions).toBe(4);
    expect(fourth.easeFactor).toBeCloseTo(2.7, 5);
    expect(fourth.intervalDays).toBe(43);
  });

  it('stamps dueAt as now + intervalDays worth of milliseconds, using the faked clock', () => {
    const state = calculateNextReview(initializeSrsState('x'), 5);
    expect(state.intervalDays).toBe(1);
    expect(state.dueAt).toBe(FIXED_NOW + 1 * DAY_MS);
  });

  it('records the grade that produced the transition', () => {
    const state = calculateNextReview(initializeSrsState('x'), 5);
    expect(state.lastGrade).toBe(5);
  });
});

describe('calculateNextReview - review-table regression (10+ reviews)', () => {
  it('an all-correct run rises to the 2.8 ease ceiling and pins there', () => {
    const expected: Array<{ repetitions: number; intervalDays: number; easeFactor: number }> = [
      { repetitions: 1, intervalDays: 1, easeFactor: 2.55 },
      { repetitions: 2, intervalDays: 6, easeFactor: 2.6 },
      { repetitions: 3, intervalDays: 16, easeFactor: 2.65 },
      { repetitions: 4, intervalDays: 43, easeFactor: 2.7 },
      { repetitions: 5, intervalDays: 118, easeFactor: 2.75 },
      { repetitions: 6, intervalDays: 330, easeFactor: 2.8 }, // just under 2.8 by fp, still shows as 2.8 at this precision
      { repetitions: 7, intervalDays: 365, easeFactor: 2.8 }, // ceiling reached; round(330*2.8)=924 clamped to MAX_INTERVAL_DAYS
      { repetitions: 8, intervalDays: 365, easeFactor: 2.8 }, // pinned at the interval ceiling
      { repetitions: 9, intervalDays: 365, easeFactor: 2.8 },
      { repetitions: 10, intervalDays: 365, easeFactor: 2.8 },
    ];

    let state = initializeSrsState('x');
    expected.forEach((row, i) => {
      state = calculateNextReview(state, 5);
      expect({ repetitions: state.repetitions, intervalDays: state.intervalDays }).toEqual({
        repetitions: row.repetitions,
        intervalDays: row.intervalDays,
      });
      expect(state.easeFactor).toBeCloseTo(row.easeFactor, 5);
      if (i >= 6) {
        expect(state.easeFactor).toBe(2.8);
      }
    });
  });

  it('a mixed correct/wrong run (C,C,C,W,C,C,W,C,C,C) shows the lapse penalty interacting with the reward', () => {
    const grades: Grade[] = [5, 5, 5, 0, 5, 5, 0, 5, 5, 5];
    const expected: Array<{ repetitions: number; intervalDays: number; easeFactor: number }> = [
      { repetitions: 1, intervalDays: 1, easeFactor: 2.55 },
      { repetitions: 2, intervalDays: 6, easeFactor: 2.6 },
      { repetitions: 3, intervalDays: 16, easeFactor: 2.65 },
      { repetitions: 0, intervalDays: 1, easeFactor: 2.45 }, // lapse: reset + -0.20
      { repetitions: 1, intervalDays: 1, easeFactor: 2.5 },
      { repetitions: 2, intervalDays: 6, easeFactor: 2.55 },
      { repetitions: 0, intervalDays: 1, easeFactor: 2.35 }, // second lapse: reset + -0.20
      { repetitions: 1, intervalDays: 1, easeFactor: 2.4 },
      { repetitions: 2, intervalDays: 6, easeFactor: 2.45 },
      { repetitions: 3, intervalDays: 15, easeFactor: 2.5 },
    ];

    let state = initializeSrsState('x');
    grades.forEach((grade, i) => {
      state = calculateNextReview(state, grade);
      const row = expected[i];
      expect({ repetitions: state.repetitions, intervalDays: state.intervalDays }).toEqual({
        repetitions: row.repetitions,
        intervalDays: row.intervalDays,
      });
      expect(state.easeFactor).toBeCloseTo(row.easeFactor, 5);
    });
  });
});

describe('calculateNextReview - MAX_INTERVAL_DAYS clamp', () => {
  it('clamps a would-be-924-day interval (330 * 2.8 ease) to the 365-day ceiling', () => {
    const state: SrsState = {
      ...initializeSrsState('x'),
      repetitions: 6,
      intervalDays: 330,
      easeFactor: 2.8,
    };
    const next = calculateNextReview(state, 5);
    expect(next.intervalDays).toBe(365);
    expect(next.intervalDays).toBe(MAX_INTERVAL_DAYS);
  });
});

describe('isDue', () => {
  it('is due exactly at the boundary (dueAt === now)', () => {
    const state: SrsState = { ...initializeSrsState('x'), dueAt: FIXED_NOW };
    expect(isDue(state)).toBe(true);
  });

  it('is due when dueAt is one millisecond in the past', () => {
    const state: SrsState = { ...initializeSrsState('x'), dueAt: FIXED_NOW - 1 };
    expect(isDue(state)).toBe(true);
  });

  it('is due when dueAt is one millisecond in the future but still the same local calendar day', () => {
    // Per docs/learning/new-vs-review-mix.md ("Interaction with the day
    // boundary"): due-ness is decided at the end of the local calendar
    // day, not by exact-millisecond comparison. dueAt one ms after `now`
    // is still on today's local date, so the item is due today.
    const state: SrsState = { ...initializeSrsState('x'), dueAt: FIXED_NOW + 1 };
    expect(isDue(state)).toBe(true);
  });

  it('reacts to the clock advancing past dueAt', () => {
    const state: SrsState = { ...initializeSrsState('x'), dueAt: FIXED_NOW + DAY_MS };
    expect(isDue(state)).toBe(false);
    vi.setSystemTime(FIXED_NOW + DAY_MS);
    expect(isDue(state)).toBe(true);
  });
});

// These pin process.env.TZ to Europe/Stockholm so the calendar-day
// boundary assertions are deterministic regardless of the host/CI
// machine's default timezone (isDue's day boundary is computed from the
// local Date, so the test needs a known local timezone to reason about
// "same local day" and DST transitions).
describe('isDue - month and DST boundaries (Europe/Stockholm)', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'Europe/Stockholm';
  });

  afterEach(() => {
    // Assigning undefined would store the literal string "undefined" as
    // the timezone; delete the key instead.
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('is not due when dueAt falls on the next local calendar day, even a few hours away', () => {
    const now = new Date(2026, 0, 15, 20, 0, 0, 0).getTime(); // Jan 15, 2026 20:00 local
    const dueAtSameDay = new Date(2026, 0, 15, 23, 59, 59, 999).getTime();
    const dueAtNextDay = new Date(2026, 0, 16, 0, 0, 0, 0).getTime();

    expect(isDue({ ...initializeSrsState('x'), dueAt: dueAtSameDay }, now)).toBe(true);
    expect(isDue({ ...initializeSrsState('x'), dueAt: dueAtNextDay }, now)).toBe(false);
  });

  it('treats a month boundary the same as any other day boundary (Jan 31 -> Feb 1, 2026)', () => {
    const now = new Date(2026, 0, 31, 22, 0, 0, 0).getTime(); // Jan 31, 2026 22:00 local
    const dueAtEndOfJan = new Date(2026, 0, 31, 23, 59, 59, 999).getTime();
    const dueAtStartOfFeb = new Date(2026, 1, 1, 0, 0, 0, 0).getTime();

    expect(isDue({ ...initializeSrsState('x'), dueAt: dueAtEndOfJan }, now)).toBe(true);
    expect(isDue({ ...initializeSrsState('x'), dueAt: dueAtStartOfFeb }, now)).toBe(false);

    // Clock rolls into February: the Feb 1 item becomes due once its own
    // calendar day starts.
    expect(isDue({ ...initializeSrsState('x'), dueAt: dueAtStartOfFeb }, dueAtStartOfFeb)).toBe(
      true,
    );
  });

  it('a same-local-day item stays due across the spring DST transition (2026-03-29, 23-hour day)', () => {
    // Sweden springs forward at 02:00 -> 03:00 local on 2026-03-29, so
    // this calendar day is only 23 hours long. The day-boundary check
    // must still treat 23:00 as "today" and 00:00 the next day as
    // "tomorrow" despite the missing hour.
    const beforeJump = new Date(2026, 2, 29, 1, 0, 0, 0).getTime(); // 01:00 CET, before the jump
    const afterJumpSameDay = new Date(2026, 2, 29, 23, 0, 0, 0).getTime(); // 23:00 CEST, same date
    const nextDay = new Date(2026, 2, 30, 0, 0, 0, 0).getTime(); // 00:00, next calendar day

    expect(isDue({ ...initializeSrsState('x'), dueAt: afterJumpSameDay }, beforeJump)).toBe(true);
    expect(isDue({ ...initializeSrsState('x'), dueAt: nextDay }, beforeJump)).toBe(false);
  });

  it('a same-local-day item stays due across the autumn DST transition (2026-10-25, 25-hour day)', () => {
    // Sweden falls back at 03:00 -> 02:00 local on 2026-10-25 (02:00-02:59
    // occurs twice), so this calendar day is 25 hours long.
    const beforeFold = new Date(2026, 9, 25, 1, 0, 0, 0).getTime(); // 01:00, before the repeated hour
    const afterFoldSameDay = new Date(2026, 9, 25, 23, 0, 0, 0).getTime(); // 23:00, same date
    const nextDay = new Date(2026, 9, 26, 0, 0, 0, 0).getTime(); // 00:00, next calendar day

    expect(isDue({ ...initializeSrsState('x'), dueAt: afterFoldSameDay }, beforeFold)).toBe(true);
    expect(isDue({ ...initializeSrsState('x'), dueAt: nextDay }, beforeFold)).toBe(false);
  });

  it('a 1-day interval scheduled early on the 25-hour fall-back day is not due again that same local day', () => {
    // The fall-back day is 25 hours long, so at 00:30 local, now + 24h is
    // only 23:30 of the same local calendar day. If dueAt stored that raw
    // sum, the end-of-day isDue boundary would serve the item again the
    // same day it was answered and its interval would ratchet (1 -> 6 ->
    // 6*EF) without any real day passing. calculateNextReview clamps
    // dueAt to at least the start of the next local day.
    const answerTime = new Date(2026, 9, 25, 0, 30, 0, 0).getTime(); // 00:30, before the fold
    vi.setSystemTime(answerTime);

    const next = calculateNextReview(initializeSrsState('x'), 5);
    expect(next.intervalDays).toBe(1);

    const laterSameDay = new Date(2026, 9, 25, 23, 0, 0, 0).getTime();
    expect(isDue(next, laterSameDay)).toBe(false);

    const startOfNextDay = new Date(2026, 9, 26, 0, 0, 0, 0).getTime();
    expect(isDue(next, startOfNextDay)).toBe(true);
  });
});
