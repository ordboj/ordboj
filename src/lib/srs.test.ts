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
    [5, 2.6],
    [4, 2.5],
    [3, 2.36],
    [2, 2.18],
    [1, 1.96],
    [0, 1.7],
  ])("grade %i moves ease factor from 2.5 to %s", (grade, expected) => {
    const state = initializeSrsState("x");
    const next = calculateNextReview(state, grade);
    expect(next.easeFactor).toBeCloseTo(expected, 5);
  });

  it("never lets the ease factor drop below the 1.3 floor, however many failures in a row", () => {
    let state = initializeSrsState("x");
    for (let i = 0; i < 10; i++) {
      state = calculateNextReview(state, 0 as Grade);
      expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
    }
    expect(state.easeFactor).toBe(1.3);
  });

  it("floor is reachable within two consecutive failing grades from the default 2.5 start", () => {
    let state = initializeSrsState("x");
    state = calculateNextReview(state, 0 as Grade); // 2.5 -> 1.7
    state = calculateNextReview(state, 0 as Grade); // 1.7 -> 0.9, floored to 1.3
    expect(state.easeFactor).toBe(1.3);
  });
});

describe("calculateNextReview - lapse behavior (grade < 3)", () => {
  it("resets repetitions to 0 and interval to 1 day even from a long streak", () => {
    let state = initializeSrsState("x");
    state = calculateNextReview(state, 4 as Grade); // rep 1, interval 1
    state = calculateNextReview(state, 4 as Grade); // rep 2, interval 6
    state = calculateNextReview(state, 4 as Grade); // rep 3, interval round(6*ease)
    expect(state.repetitions).toBe(3);
    expect(state.intervalDays).toBeGreaterThan(1);

    const lapsed = calculateNextReview(state, 2 as Grade);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
  });

  it("treats grade 0, 1 and 2 identically as lapses", () => {
    const base = calculateNextReview(initializeSrsState("x"), 4 as Grade);
    for (const grade of [0, 1, 2] as Grade[]) {
      const result = calculateNextReview(base, grade);
      expect(result.repetitions).toBe(0);
      expect(result.intervalDays).toBe(1);
    }
  });
});

describe("calculateNextReview - interval progression on success (grade >= 3)", () => {
  it("first success sets interval to 1 day and repetitions to 1", () => {
    const state = calculateNextReview(initializeSrsState("x"), 3 as Grade);
    expect(state.repetitions).toBe(1);
    expect(state.intervalDays).toBe(1);
  });

  it("second consecutive success sets interval to 6 days", () => {
    let state = initializeSrsState("x");
    state = calculateNextReview(state, 3 as Grade);
    state = calculateNextReview(state, 3 as Grade);
    expect(state.repetitions).toBe(2);
    expect(state.intervalDays).toBe(6);
  });

  it("third+ success rounds interval * easeFactor", () => {
    let state = initializeSrsState("x");
    state = calculateNextReview(state, 4 as Grade); // rep1 interval1, ease stays 2.5
    state = calculateNextReview(state, 4 as Grade); // rep2 interval6, ease stays 2.5
    state = calculateNextReview(state, 4 as Grade); // rep3 interval round(6*2.5)=15
    expect(state.repetitions).toBe(3);
    expect(state.easeFactor).toBeCloseTo(2.5, 5);
    expect(state.intervalDays).toBe(Math.round(6 * 2.5));

    const fourth = calculateNextReview(state, 4 as Grade);
    expect(fourth.repetitions).toBe(4);
    expect(fourth.intervalDays).toBe(Math.round(state.intervalDays * state.easeFactor));
  });

  it("stamps dueAt as now + intervalDays worth of milliseconds, using the faked clock", () => {
    const state = calculateNextReview(initializeSrsState("x"), 3 as Grade);
    expect(state.intervalDays).toBe(1);
    expect(state.dueAt).toBe(FIXED_NOW + 1 * DAY_MS);
  });

  it("records the grade that produced the transition", () => {
    const state = calculateNextReview(initializeSrsState("x"), 5 as Grade);
    expect(state.lastGrade).toBe(5);
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
