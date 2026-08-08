export interface SrsState {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  lastGrade?: number;
}

// The UI (PracticeCard.tsx) only ever emits a binary correct/incorrect
// signal: `isCorrect ? 5 : 0`. The old 0-5 type implied a self-rated
// six-point grader that never existed in this app; narrowed here to the
// two literal values actually produced. See
// docs/learning/lapse-handling.md for the decision and rationale
// (learning-designer). A third value for hinted answers is proposed there
// but requires a frontend-owned change to the onAnswer payload and is
// tracked as a separate piece of work.
export type Grade = 0 | 5; // 0 = wrong, 5 = correct

const EASE_CEILING = 2.8;
const EASE_FLOOR = 1.3;
const EASE_DELTA_CORRECT = 0.05;
const EASE_DELTA_WRONG = -0.2;

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

  // Exact match, not >= 3: Grade is 0 | 5 today, and a future hinted
  // grade must force an explicit branch here rather than silently
  // counting as correct.
  const isCorrect = grade === 5;

  if (!isCorrect) {
    // Lapse: flat penalty, reset progress. No longer runs the SM-2 formula
    // before resetting, so the penalty is bounded and predictable.
    easeFactor = Math.max(EASE_FLOOR, easeFactor + EASE_DELTA_WRONG);
    repetitions = 0;
    intervalDays = 1;
  } else {
    // Success: small capped reward. The ceiling is what stops runaway ease
    // growth on a long correct streak (previously uncapped).
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

  // intervalDays is always >= 1 here, so the item must never come due on
  // the calendar day it was just answered. Plain now + N*24h breaks that
  // on the 25-hour fall-back day: answered at 00:30 local, now + 24h is
  // 23:30 of the *same* local day, which the end-of-day isDue boundary
  // would serve again immediately, ratcheting the interval without a real
  // day passing. Clamp to at least the start of the next local day.
  const now = Date.now();
  const dueAt = Math.max(now + intervalDays * 24 * 60 * 60 * 1000, startOfNextLocalDay(now));

  return {
    ...state,
    repetitions,
    intervalDays,
    easeFactor,
    dueAt,
    lastGrade: grade,
  };
}

function startOfNextLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  // setHours(24, ...) rolls over to 00:00.000 of the next local calendar
  // day; Date handles DST, so this is correct on 23- and 25-hour days.
  d.setHours(24, 0, 0, 0);
  return d.getTime();
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

// "Due today" is decided at a local calendar-day boundary, not by exact
// millisecond comparison against dueAt. `dueAt` is still an absolute
// timestamp (`Date.now() + intervalDays*86400000`, unchanged - see
// calculateNextReview above), so a review done at 23:50 stores a dueAt of
// 23:50 the following day. Comparing that raw timestamp against "now"
// makes an item invisible until the exact minute it was reviewed on the
// day it's due, which starves same-day practice sessions of items that
// are, for a day-granularity spaced-repetition app, genuinely due today.
//
// Decision (learning-designer, docs/learning/new-vs-review-mix.md
// "Interaction with the day boundary"): local timezone (the browser's,
// via Date), boundary at the end of the local calendar day - an item is
// due if `dueAt <= endOfLocalDay(now)`. This is the read-side fix only;
// the acceptance criteria for this change is explicit that stored dueAt
// values are not rewritten, so existing data stays valid without a
// migration.
function endOfLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// Check if item is due. `now` defaults to Date.now() but is accepted
// explicitly so callers (and tests) can evaluate due-ness against a fixed
// instant without relying on global clock mutation.
export function isDue(state: SrsState, now: number = Date.now()): boolean {
  return state.dueAt <= endOfLocalDay(now);
}
