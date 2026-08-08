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

describe('calculateNextReview - hinted-but-correct (issue #30)', () => {
  // Acceptance criterion: "When hintsUsed > 0, srs.ts uses the
  // halved-interval branch (per #12 constants) instead of the full ease
  // bump for a correct answer."
  it('halves the interval and dings ease by 0.05 instead of the full +0.05 credit, on a correct-but-hinted answer', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5); // clean: rep1, interval1, ease2.55
    state = calculateNextReview(state, 5); // clean: rep2, interval6, ease2.60

    const hinted = calculateNextReview(state, 5, 1);

    // Hinted branch: ease - 0.05 (not the +0.05 full-credit bump).
    expect(hinted.easeFactor).toBeCloseTo(2.55, 5);
    // Interval halved and rounded: round(6 * 0.5) = 3.
    expect(hinted.intervalDays).toBe(3);
    // Repetitions are left untouched by the hinted branch (not a lapse,
    // not a fresh success rep).
    expect(hinted.repetitions).toBe(2);
    expect(hinted.lastGrade).toBe(5);
  });

  it('is indistinguishable from a clean correct answer when hintsUsed is 0 (explicit default check)', () => {
    const base = initializeSrsState('x');
    const explicit = calculateNextReview(base, 5, 0);
    const implicit = calculateNextReview(base, 5);
    expect(explicit).toEqual(implicit);
    // And it takes the full-credit path, not the hinted path.
    expect(explicit.easeFactor).toBeCloseTo(2.55, 5);
  });

  it('floors the halved interval at 1 day for a fresh item (intervalDays 0 -> hinted correct)', () => {
    const state = initializeSrsState('x'); // intervalDays: 0
    const hinted = calculateNextReview(state, 5, 1);
    // round(0 * 0.5) = 0, floored to 1.
    expect(hinted.intervalDays).toBe(1);
  });

  it('never lets ease drop below the 1.3 floor from repeated hinted-but-correct answers', () => {
    let state: SrsState = { ...initializeSrsState('x'), easeFactor: 1.32 };
    state = calculateNextReview(state, 5, 1); // 1.32 -> 1.27, floored to 1.3
    expect(state.easeFactor).toBe(1.3);
    state = calculateNextReview(state, 5, 2); // still floored
    expect(state.easeFactor).toBe(1.3);
  });

  it('a wrong answer with hintsUsed > 0 still takes the full lapse branch, not the hinted branch (hints only soften correct answers)', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5); // rep1, interval1
    state = calculateNextReview(state, 5); // rep2, interval6, ease2.60

    const lapsed = calculateNextReview(state, 0, 3); // wrong, despite 3 hints used
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.easeFactor).toBeCloseTo(2.4, 5); // 2.60 - 0.20, the lapse delta
  });

  it('any positive hintsUsed (not just 1) routes into the hinted branch identically', () => {
    let state = initializeSrsState('x');
    state = calculateNextReview(state, 5); // rep1, interval1, ease2.55
    state = calculateNextReview(state, 5); // rep2, interval6, ease2.60

    const hintedOnce = calculateNextReview(state, 5, 1);
    const hintedMany = calculateNextReview(state, 5, 4);
    expect(hintedMany).toEqual(hintedOnce);
  });

  it('a 10+ review run mixing clean, hinted, and lapsed answers matches the documented table', () => {
    // grade/hints pairs: C, C, C(hinted), C, W, C, C(hinted), C, C, C
    const steps: Array<[Grade, number]> = [
      [5, 0],
      [5, 0],
      [5, 1],
      [5, 0],
      [0, 0],
      [5, 0],
      [5, 2],
      [5, 0],
      [5, 0],
      [5, 0],
    ];
    const expected: Array<{ repetitions: number; intervalDays: number; easeFactor: number }> = [
      { repetitions: 1, intervalDays: 1, easeFactor: 2.55 },
      { repetitions: 2, intervalDays: 6, easeFactor: 2.6 },
      { repetitions: 2, intervalDays: 3, easeFactor: 2.55 }, // hinted: round(6*0.5)=3, ease-0.05
      { repetitions: 3, intervalDays: 8, easeFactor: 2.6 }, // round(3*2.60)=8
      { repetitions: 0, intervalDays: 1, easeFactor: 2.4 }, // lapse
      { repetitions: 1, intervalDays: 1, easeFactor: 2.45 },
      { repetitions: 1, intervalDays: 1, easeFactor: 2.4 }, // hinted at rep1/interval1: round(1*0.5)=1, ease-0.05 (floor keeps at 1)
      { repetitions: 2, intervalDays: 6, easeFactor: 2.45 },
      { repetitions: 3, intervalDays: 15, easeFactor: 2.5 }, // round(6*2.45)=15
      { repetitions: 4, intervalDays: 38, easeFactor: 2.55 }, // round(15*2.5)=38 (round-half-away-from-zero => 37.5 -> 38)
    ];

    let state = initializeSrsState('x');
    steps.forEach(([grade, hints], i) => {
      state = calculateNextReview(state, grade, hints);
      expect(state.easeFactor).toBeCloseTo(expected[i].easeFactor, 5);
      expect({ repetitions: state.repetitions, intervalDays: state.intervalDays }).toEqual({
        repetitions: expected[i].repetitions,
        intervalDays: expected[i].intervalDays,
      });
    });
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
