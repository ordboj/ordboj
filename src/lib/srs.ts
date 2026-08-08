export interface SrsState {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  lastGrade?: number;
}

// Three literal grades, matching docs/learning/lapse-handling.md: a genuine
// lapse, a hinted (partial-credit) correct answer, and an unaided correct
// answer. The old 0-5 type implied a self-rated six-point grader that never
// existed in this app; narrowed to 0 | 5 in #12 (see git history), then
// widened back to include 3 here (#133) once the scheduler grew a real
// hinted branch. `PracticeCard.tsx` still only emits 0 | 5 as of this
// change — wiring hint usage through `onAnswer` into grade 3 is a
// frontend-owned change (see "Routed to" in lapse-handling.md) tracked
// separately. Feeding this scheduler a 3 today is safe and tested; nothing
// downstream assumes only two values.
export type Grade = 0 | 3 | 5; // 0 = wrong, 3 = hinted correct, 5 = unaided correct

const EASE_CEILING = 2.8;
const EASE_FLOOR = 1.3;
const EASE_DELTA_CORRECT = 0.05;
const EASE_DELTA_WRONG = -0.2;
const EASE_DELTA_HINT = 0.05; // subtracted, not added: see hinted branch below
const HINT_INTERVAL_MULTIPLIER = 0.5;

// Same-session relearning queue parameters (docs/learning/lapse-handling.md,
// "Interaction with the sitting cap"). Exported for the queue owner
// (frontend-expert, Practice.tsx) to insert a lapsed item back into the
// session after this many intervening items, capped at this many
// re-queues per item per day before it falls through to dueAt tomorrow.
// Not enforced here: this module has no session or day concept, only the
// per-answer scheduling math.
export const RELEARNING_MIN_GAP = 3;
export const RELEARNING_MAX_PER_DAY = 2;

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

  // Exact matches on all three branches, never a >= comparison: Grade is
  // exactly 0 | 3 | 5, and a new grade value must force a deliberate branch
  // here rather than silently falling into "correct".
  if (grade === 0) {
    // Lapse: flat penalty, reset progress. No longer runs the SM-2 formula
    // before resetting, so the penalty is bounded and predictable.
    easeFactor = Math.max(EASE_FLOOR, easeFactor + EASE_DELTA_WRONG);
    repetitions = 0;
    intervalDays = 1;
  } else if (grade === 3) {
    // Hinted correct: partial credit, not a lapse and not full recall.
    // Ease nudges down slightly (same magnitude as the correct-answer
    // reward, opposite sign) and the interval halves so the item comes
    // back sooner without losing its place in the schedule. repetitions
    // is deliberately left unchanged: this neither graduates the item to
    // the next SM-2 step (that requires unaided recall) nor resets its
    // streak (the learner did retrieve it, with help).
    easeFactor = Math.max(EASE_FLOOR, easeFactor - EASE_DELTA_HINT);
    intervalDays = Math.min(
      MAX_INTERVAL_DAYS,
      Math.max(1, Math.round(intervalDays * HINT_INTERVAL_MULTIPLIER)),
    );
  } else {
    // grade === 5: unaided success. Small capped reward. The ceiling is
    // what stops runaway ease growth on a long correct streak (previously
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

// Whether a just-graded answer should be re-queued for a second attempt
// within the same session (docs/learning/lapse-handling.md, "Lapse
// handling"). Only a genuine lapse qualifies: a hinted correct answer (3)
// already received a successful retrieval, partial credit and a shortened
// interval, so it does not need a same-session retry on top of that.
export function needsRelearningRequeue(grade: Grade): boolean {
  return grade === 0;
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
