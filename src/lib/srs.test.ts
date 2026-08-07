import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateNextReview, initializeSrsState, isDue, type SrsState, type Grade } from "@/lib/srs";

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("initializeSrsState", () => {
  it("echoes the itemId and sets the documented defaults", () => {
    const state = initializeSrsState("1-presens");

    expect(state).toEqual<SrsState>({
      itemId: "1-presens",
      repetitions: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      dueAt: FIXED_NOW,
    });
  });

  it("uses the current clock for dueAt, not a snapshot taken elsewhere", () => {
    const first = initializeSrsState("a");
    vi.setSystemTime(FIXED_NOW + DAY_MS);
    const second = initializeSrsState("a");

    expect(first.dueAt).toBe(FIXED_NOW);
    expect(second.dueAt).toBe(FIXED_NOW + DAY_MS);
  });
});

describe("calculateNextReview - ease factor", () => {
  it.each<[Grade, number]>([
    [5, 2.55],
    [0, 2.3],
  ])("grade %i moves ease factor from 2.5 to %s", (grade, expected) => {
    const state = initializeSrsState("x");
    const next = calculateNextReview(state, grade);
    expect(next.easeFactor).toBeCloseTo(expected, 5);
  });

  it("never lets the ease factor drop below the 1.3 floor, however many failures in a row", () => {
    let state = initializeSrsState("x");
    for (let i = 0; i < 10; i++) {
      state = calculateNextReview(state, 0);
      expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
    }
    expect(state.easeFactor).toBe(1.3);
  });

  it("two consecutive wrongs land at 2.1, well above the floor", () => {
    let state = initializeSrsState("x");
    state = calculateNextReview(state, 0); // 2.5 -> 2.3
    state = calculateNextReview(state, 0); // 2.3 -> 2.1
    expect(state.easeFactor).toBeCloseTo(2.1, 5);
  });

  it("floor is reachable after six consecutive failing grades from the default 2.5 start", () => {
    let state = initializeSrsState("x");
    const expectedEase = [2.3, 2.1, 1.9, 1.7, 1.5, 1.3];
    for (const expected of expectedEase) {
      state = calculateNextReview(state, 0);
      expect(state.easeFactor).toBeCloseTo(expected, 5);
    }
    expect(state.easeFactor).toBe(1.3);
  });
});

describe("calculateNextReview - lapse behavior (grade 0)", () => {
  it("resets repetitions to 0 and interval to 1 day even from a long streak", () => {
    let state = initializeSrsState("x");
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

describe("calculateNextReview - interval progression on success (grade 5)", () => {
  it("first success sets interval to 1 day and repetitions to 1", () => {
    const state = calculateNextReview(initializeSrsState("x"), 5);
    expect(state.repetitions).toBe(1);
    expect(state.intervalDays).toBe(1);
  });

  it("second consecutive success sets interval to 6 days", () => {
    let state = initializeSrsState("x");
    state = calculateNextReview(state, 5);
    state = calculateNextReview(state, 5);
    expect(state.repetitions).toBe(2);
    expect(state.intervalDays).toBe(6);
  });

  it("third+ success rounds interval * easeFactor, with ease still rising", () => {
    let state = initializeSrsState("x");
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

  it("stamps dueAt as now + intervalDays worth of milliseconds, using the faked clock", () => {
    const state = calculateNextReview(initializeSrsState("x"), 5);
    expect(state.intervalDays).toBe(1);
    expect(state.dueAt).toBe(FIXED_NOW + 1 * DAY_MS);
  });

  it("records the grade that produced the transition", () => {
    const state = calculateNextReview(initializeSrsState("x"), 5);
    expect(state.lastGrade).toBe(5);
  });
});

describe("calculateNextReview - review-table regression (10+ reviews)", () => {
  it("an all-correct run rises to the 2.8 ease ceiling and pins there", () => {
    const expected: Array<{ repetitions: number; intervalDays: number; easeFactor: number }> = [
      { repetitions: 1, intervalDays: 1, easeFactor: 2.55 },
      { repetitions: 2, intervalDays: 6, easeFactor: 2.6 },
      { repetitions: 3, intervalDays: 16, easeFactor: 2.65 },
      { repetitions: 4, intervalDays: 43, easeFactor: 2.7 },
      { repetitions: 5, intervalDays: 118, easeFactor: 2.75 },
      { repetitions: 6, intervalDays: 330, easeFactor: 2.8 }, // just under 2.8 by fp, still shows as 2.8 at this precision
      { repetitions: 7, intervalDays: 924, easeFactor: 2.8 }, // ceiling reached exactly
      { repetitions: 8, intervalDays: 2587, easeFactor: 2.8 },
      { repetitions: 9, intervalDays: 7244, easeFactor: 2.8 },
      { repetitions: 10, intervalDays: 20283, easeFactor: 2.8 },
    ];

    let state = initializeSrsState("x");
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

  it("a mixed correct/wrong run (C,C,C,W,C,C,W,C,C,C) shows the lapse penalty interacting with the reward", () => {
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

    let state = initializeSrsState("x");
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

describe("isDue", () => {
  it("is due exactly at the boundary (dueAt === now)", () => {
    const state: SrsState = { ...initializeSrsState("x"), dueAt: FIXED_NOW };
    expect(isDue(state)).toBe(true);
  });

  it("is due when dueAt is one millisecond in the past", () => {
    const state: SrsState = { ...initializeSrsState("x"), dueAt: FIXED_NOW - 1 };
    expect(isDue(state)).toBe(true);
  });

  it("is not due when dueAt is one millisecond in the future", () => {
    const state: SrsState = { ...initializeSrsState("x"), dueAt: FIXED_NOW + 1 };
    expect(isDue(state)).toBe(false);
  });

  it("reacts to the clock advancing past dueAt", () => {
    const state: SrsState = { ...initializeSrsState("x"), dueAt: FIXED_NOW + DAY_MS };
    expect(isDue(state)).toBe(false);
    vi.setSystemTime(FIXED_NOW + DAY_MS);
    expect(isDue(state)).toBe(true);
  });
});
