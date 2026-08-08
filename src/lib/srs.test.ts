import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateNextReview,
  initializeSrsState,
  isDue,
  needsRelearningRequeue,
  MAX_INTERVAL_DAYS,
  RELEARNING_MIN_GAP,
  RELEARNING_MAX_PER_DAY,
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

describe('calculateNextReview - hinted correct behavior (grade 3)', () => {
  it('is not a lapse: repetitions are left unchanged, unlike grade 0', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5); // rep 1
    state = calculateNextReview(state, 5); // rep 2
    const before = state.repetitions;
    const hinted = calculateNextReview(state, 3);
    expect(hinted.repetitions).toBe(before);
  });

  it('nudges ease down by the same 0.05 magnitude as a correct answer nudges it up, opposite sign', () => {
    const state = initializeSrsState('x'); // easeFactor 2.5
    const hinted = calculateNextReview(state, 3);
    expect(hinted.easeFactor).toBeCloseTo(2.45, 5);
  });

  it('halves the interval (rounded, floored at 1 day) instead of applying the grade-5 growth formula', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5); // rep 1, interval 1
    state = calculateNextReview(state, 5); // rep 2, interval 6
    const hinted = calculateNextReview(state, 3);
    expect(hinted.intervalDays).toBe(3); // round(6 * 0.5)
  });

  it('floors a halved interval of less than 1 day at 1 day, never 0', () => {
    const state = initializeSrsState('x'); // intervalDays 0
    const hinted = calculateNextReview(state, 3);
    expect(hinted.intervalDays).toBe(1); // round(0 * 0.5) = 0, floored to 1
  });

  it('never lets ease drop below the 1.3 floor on a long run of hinted answers', () => {
    // Delta is -0.05/step; (2.5 - 1.3) / 0.05 = 24 steps to reach the floor.
    // Run well past that to prove it pins rather than overshoots.
    let state = initializeSrsState('x');
    for (let i = 0; i < 40; i++) {
      state = calculateNextReview(state, 3);
      expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
    }
    expect(state.easeFactor).toBe(1.3);
  });

  it('records grade 3 as lastGrade and stamps dueAt using the halved interval', () => {
    const state = calculateNextReview(initializeSrsState('x'), 3);
    expect(state.lastGrade).toBe(3);
    expect(state.dueAt).toBe(FIXED_NOW + state.intervalDays * DAY_MS);
  });

  it('does not fall into the grade-5 growth branch: a hinted answer after two successes does not jump to 6+ days', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5); // rep 1, interval 1
    const hinted = calculateNextReview(state, 3);
    // If grade 3 were mis-routed into the >=3 success branch, repetitions
    // would become 2 and intervalDays would jump to 6. It must not.
    expect(hinted.repetitions).toBe(1);
    expect(hinted.intervalDays).not.toBe(6);
    expect(hinted.intervalDays).toBe(1); // round(1 * 0.5) = 1 (floored)
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

  it('is not due when dueAt is one millisecond in the future', () => {
    const state: SrsState = { ...initializeSrsState('x'), dueAt: FIXED_NOW + 1 };
    expect(isDue(state)).toBe(false);
  });

  it('reacts to the clock advancing past dueAt', () => {
    const state: SrsState = { ...initializeSrsState('x'), dueAt: FIXED_NOW + DAY_MS };
    expect(isDue(state)).toBe(false);
    vi.setSystemTime(FIXED_NOW + DAY_MS);
    expect(isDue(state)).toBe(true);
  });
});

describe('needsRelearningRequeue', () => {
  it('is true only for a genuine lapse (grade 0)', () => {
    expect(needsRelearningRequeue(0)).toBe(true);
  });

  it('is false for a hinted correct answer (grade 3): it already got a successful retrieval', () => {
    expect(needsRelearningRequeue(3)).toBe(false);
  });

  it('is false for an unaided correct answer (grade 5)', () => {
    expect(needsRelearningRequeue(5)).toBe(false);
  });
});

describe('relearning queue constants - pin the current contract', () => {
  // Practice.tsx (frontend-expert) reads these to place a lapsed item back
  // into the session queue. Pinned here so a change to either value is a
  // deliberate, reviewed edit, not a silent drift that Practice.test.tsx
  // would then fail to explain.
  it('RELEARNING_MIN_GAP is 3 items', () => {
    expect(RELEARNING_MIN_GAP).toBe(3);
  });

  it('RELEARNING_MAX_PER_DAY is 2 requeues', () => {
    expect(RELEARNING_MAX_PER_DAY).toBe(2);
  });
});
