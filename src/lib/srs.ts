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
// timestamp (`Date.now() + intervalDays*86400000`, clamped to the next
// local midnight - see calculateNextReview above), so a review done at
// 23:50 stores a dueAt of 23:50 the following day. Comparing that raw
// timestamp against "now" makes an item invisible until the exact minute
// it was reviewed on the day it's due, which starves same-day practice
// sessions of items that are, for a day-granularity spaced-repetition
// app, genuinely due today.
//
// Decision (learning-designer, docs/learning/new-vs-review-mix.md
// "Interaction with the day boundary"): local timezone (the browser's,
// via Date), boundary at the end of the local calendar day - an item is
// due if `dueAt <= endOfLocalDay(now)`. Existing stored dueAt values are
// not rewritten (per the acceptance criteria), so existing data stays
// valid without a migration; only newly written dueAt values get the
// midnight clamp.
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

// In-session relearning queue policy (decision: docs/learning/lapse-handling.md,
// "Decision" and "Interaction with the sitting cap"). A lapsed item re-enters
// the current sitting rather than waiting until its normal `dueAt` (tomorrow
// at the earliest); these two constants are the whole of that policy's
// numbers. Queue insertion and per-item-per-day counting live in the sitting
// itself (Practice.tsx, frontend-expert) and in useSrsProgress.ts; this
// module owns only the pure threshold check so the policy has one source of
// truth instead of drifting between files.

// Minimum number of other items answered before a lapsed item may reappear
// in the same sitting. Enough to clear working memory; small enough that the
// correction still lands inside a 15-item sitting.
export const REQUEUE_GAP_ITEMS = 3;

// Cap on how many times a single item may be re-queued in one day, across
// sittings. On the (cap+1)th lapse the item is left at its normal `dueAt`
// (set by calculateNextReview, already tomorrow) instead of re-entering the
// sitting again, so one intractable verb cannot trap the learner.
export const MAX_REQUEUES_PER_DAY = 2;

// Pure eligibility check: does a lapsed item qualify to be re-inserted into
// the current sitting right now? `itemsSinceLapse` is the number of other
// items answered since this item's most recent lapse this sitting;
// `requeuesToday` is how many times this item has already been re-queued
// today, across sittings. Callers own tracking those two numbers (they are
// session/day bookkeeping, not part of the persisted SrsState); this
// function only encodes the threshold.
export function isEligibleForRequeue(itemsSinceLapse: number, requeuesToday: number): boolean {
  return itemsSinceLapse >= REQUEUE_GAP_ITEMS && requeuesToday < MAX_REQUEUES_PER_DAY;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Mastery stage: a coarse "how well known" bucket, shown as a badge on the
// Progress page and in VerbDetailsModal. `stage` is a repetitions count (or
// the floor of an average of several - see averageMasteryStage below).
//
// This was duplicated, byte-for-byte identical, in both UI files (#108) -
// pedagogy logic living in pages, with real drift risk since the two
// copies had no shared source. The thresholds themselves are unchanged
// from what those two files already agreed on: 0 = untouched item ("New"),
// 1-2 reps = still consolidating ("Learning"), 3-4 reps = spaced but not
// yet long-interval ("Reviewing"), 5+ reps = "Mastered". Changing these
// numbers is a learning-designer decision, not an engineering one; no such
// change is made here.
export type MasteryStageLabel = 'New' | 'Learning' | 'Reviewing' | 'Mastered';

export interface MasteryStageBadge {
  label: MasteryStageLabel;
  variant: 'default' | 'secondary' | 'outline';
  color: string;
}

// Stage floor at which the badge reads "Mastered". Exposed so a caller
// doing its own bucketing (e.g. an aggregate "X / Y mastered" count) reads
// this constant instead of re-encoding the number 5.
export const MASTERED_STAGE_THRESHOLD = 5;

const NEW_BADGE: MasteryStageBadge = {
  label: 'New',
  variant: 'default',
  color: 'bg-stage-new text-stage-new-foreground border-transparent',
};
const LEARNING_BADGE: MasteryStageBadge = {
  label: 'Learning',
  variant: 'secondary',
  color: 'bg-stage-learning text-stage-learning-foreground border-transparent',
};
const REVIEWING_BADGE: MasteryStageBadge = {
  label: 'Reviewing',
  variant: 'outline',
  color: 'bg-stage-reviewing text-stage-reviewing-foreground border-transparent',
};
const MASTERED_BADGE: MasteryStageBadge = {
  label: 'Mastered',
  variant: 'default',
  color: 'bg-stage-mastered text-stage-mastered-foreground border-transparent',
};

// `stage` is expected to be a non-negative integer repetitions count.
// Negative or non-finite input (should never happen from real state, but
// this only ever drives a label) is treated as 0 rather than thrown.
export function getMasteryStageBadge(stage: number): MasteryStageBadge {
  const safeStage = isFiniteNumber(stage) && stage > 0 ? stage : 0;
  if (safeStage === 0) return NEW_BADGE;
  if (safeStage <= 2) return LEARNING_BADGE;
  if (safeStage < MASTERED_STAGE_THRESHOLD) return REVIEWING_BADGE;
  return MASTERED_BADGE;
}

// Reduces a set of possibly-untracked SRS states to one integer stage, by
// averaging `repetitions` and flooring. Built for a verb whose several
// conjugation forms (presens/preteritum/supinum/imperativ) are each their
// own SRS item: callers pass in the state for each form (or `undefined`
// for a form never studied yet).
//
// A form with no stored state is excluded from both the sum and the count,
// so an unstarted form doesn't drag the average toward 0 for a verb that
// is otherwise well known. If none of the forms have been started
// (count === 0), the result is 0 ("New") rather than dividing by zero.
export function averageMasteryStage(
  states: ReadonlyArray<{ repetitions: number } | undefined>,
): number {
  let totalReps = 0;
  let count = 0;
  for (const state of states) {
    if (state) {
      totalReps += state.repetitions;
      count += 1;
    }
  }
  return count > 0 ? Math.floor(totalReps / count) : 0;
}

// Structural validator for one stored/imported item. Used by the import
// path, which is the only place untrusted data enters the store: the file
// comes off the user's disk and can be any JSON at all. Deliberately
// permissive about *values* (any positive finite easeFactor, any finite
// lastGrade) so that genuine older backups written by earlier versions of
// the scheduler are not rejected, and strict about *shape* so that a
// settings export or an unrelated JSON file cannot pass as progress.
export function isSrsState(value: unknown): value is SrsState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (typeof state.itemId !== 'string' || state.itemId.length === 0) return false;
  if (!isFiniteNumber(state.repetitions) || !Number.isInteger(state.repetitions)) return false;
  if (state.repetitions < 0) return false;
  if (!isFiniteNumber(state.intervalDays) || state.intervalDays < 0) return false;
  if (!isFiniteNumber(state.easeFactor) || state.easeFactor <= 0) return false;
  if (!isFiniteNumber(state.dueAt)) return false;
  if (state.lastGrade !== undefined && !isFiniteNumber(state.lastGrade)) return false;
  return true;
}
