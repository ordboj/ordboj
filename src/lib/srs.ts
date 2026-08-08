export interface SrsState {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  lastGrade?: number;
}

// The UI (PracticeCard.tsx) emits one of three outcomes for an answer:
// wrong, correct-with-a-hint-used, or correct unaided. The old 0-5 type
// implied a self-rated six-point grader that never existed in this app;
// narrowed here to the literal values actually produced. See
// docs/learning/lapse-handling.md for the decision and rationale
// (learning-designer): a hint-assisted correct answer is partial credit,
// not a full pass and not a lapse. Wiring PracticeCard to emit 3 when a
// hint was used is a frontend-owned change to the onAnswer payload and is
// tracked as a separate piece of work (#133); this file is ready to
// receive it.
export type Grade = 0 | 3 | 5; // 0 = wrong, 3 = hinted correct, 5 = correct unaided

const EASE_CEILING = 2.8;
const EASE_FLOOR = 1.3;
const EASE_DELTA_CORRECT = 0.05;
const EASE_DELTA_WRONG = -0.2;
// Hinted correct: smaller ease penalty than a lapse (it wasn't a failed
// retrieval) but still a penalty (it wasn't a clean recall either).
const EASE_DELTA_HINTED = -0.05;
// Hinted correct halves the next interval rather than resetting it or
// growing it: "this was partial, come back sooner, but you did not fail."
const HINTED_INTERVAL_MULTIPLIER = 0.5;

// Hard ceiling on any single interval. Even at the 2.8 ease ceiling an
// item's schedule cannot leave the app's one-year horizon.
export const MAX_INTERVAL_DAYS = 365;

// SM-2-derived scheduler, but with flat ease deltas instead of the
// textbook graded-ease formula. The textbook formula assumes a self-rated
// 0-5 input; fed a binary correct/wrong signal it produced a -0.80/+0.10
// asymmetry (every miss cost 0.8 ease, every hit gained 0.1), which drove
// ease to the floor after two early misses ("ease hell") while also
// letting a long correct streak inflate ease and therefore intervals
// without bound. Flat -0.20/+0.05 deltas, floored at 1.3 and now also
// ceilinged at 2.8, keep ease as a meaningful per-item difficulty signal
// without either failure mode.
export function calculateNextReview(state: SrsState, grade: Grade): SrsState {
  let { repetitions, intervalDays, easeFactor } = state;

  // Exact match on each literal, not a >=/< threshold: Grade is 0 | 3 | 5
  // and each value has its own branch below rather than being folded into
  // a binary correct/wrong split.
  if (grade === 0) {
    // Lapse: flat penalty, reset progress. No longer runs the SM-2 formula
    // before resetting, so the penalty is bounded and predictable.
    easeFactor = Math.max(EASE_FLOOR, easeFactor + EASE_DELTA_WRONG);
    repetitions = 0;
    intervalDays = 1;
  } else if (grade === 3) {
    // Hinted correct: partial credit, not a lapse and not a full pass.
    // Repetitions do not advance (this was not a clean unaided recall, so
    // it should not count toward graduating the item to a longer
    // interval), but the item is not reset either. Ease takes a small
    // penalty and the existing interval is halved so the item comes back
    // sooner than it otherwise would have.
    easeFactor = Math.max(EASE_FLOOR, easeFactor + EASE_DELTA_HINTED);
    intervalDays = Math.max(1, Math.round(intervalDays * HINTED_INTERVAL_MULTIPLIER));
  } else {
    // grade === 5: full success, small capped reward. The ceiling is what
    // stops runaway ease growth on a long correct streak (previously
    // uncapped).
    easeFactor = Math.min(EASE_CEILING, easeFactor + EASE_DELTA_CORRECT);
    repetitions += 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.round(intervalDays * easeFactor));
    }
  }

  return {
    ...state,
    repetitions,
    intervalDays,
    easeFactor,
    dueAt: Date.now() + intervalDays * 24 * 60 * 60 * 1000,
    lastGrade: grade,
  };
}

// Initialize new SRS item
export function initializeSrsState(itemId: string): SrsState {
  return {
    itemId,
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueAt: Date.now(),
  };
}

// Check if item is due
export function isDue(state: SrsState): boolean {
  return state.dueAt <= Date.now();
}
