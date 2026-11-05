# Choice-interval growth at low ease

Split out of ORD-12. ORD-12 is not the driver. ORD-12 closes because the grade `Hard` is gone. This note decides only the choice-interval rule.

## Decision

A correct choice answer keeps the cap of 1.6 and does not change ease. When the rounded product does not grow an interval of at least 1 day, add 1 day. Then clamp at 365 days. A wrong choice stays a full lapse. This note does not change `docs/learning/lapse-handling.md`.

## Question

When `round(interval × min(ease, 1.6))` stays at 1 day, what interval does a correct choice answer get?

## What the app does today

`Grade` is only 0 or 5. There is no `Hard` grade.

```16:24:src/lib/srs.ts
// The UI (PracticeCard.tsx) only ever emits a binary correct/incorrect
// signal: `isCorrect ? 5 : 0`. The old 0-5 type implied a self-rated
// six-point grader that never existed in this app; narrowed here to the
// two literal values actually produced. See
// docs/learning/lapse-handling.md for the decision and rationale
// (learning-designer). A third value for hinted answers is proposed there
// but requires a frontend-owned change to the onAnswer payload and is
// tracked as a separate piece of work.
export type Grade = 0 | 5; // 0 = wrong, 5 = correct
```

A correct choice answer uses this formula. `CHOICE_EASE_CAP` is 1.6 (`src/lib/srs.ts`, lines 56–61).

```94:103:src/lib/srs.ts
  } else if (modality === 'choice') {
    // Correct choice (recognition): no ease reward, and the interval grows
    // at the item's ease capped at CHOICE_EASE_CAP. The max(1, ...) floor
    // covers the first-ever review, where intervalDays is still 0 and the
    // product would otherwise pin the item at a zero interval.
    repetitions += 1;
    intervalDays = Math.min(
      MAX_INTERVAL_DAYS,
      Math.max(1, Math.round(intervalDays * Math.min(easeFactor, CHOICE_EASE_CAP))),
    );
```

`Math.round` in JavaScript rounds 1.5 up to 2, and rounds 1.45 down to 1. At ease 1.3 or 1.45, an interval of 1 day stays 1 day after a correct choice. Ease does not rise on a choice answer, so the stall repeats.

The particle deck is the caller that passes `choice`.

```109:109:src/pages/PracticeParticles.tsx
      recordAnswer(card.itemId, grade, choice ? 'choice' : 'typed');
```

The conjugation deck does not pass a modality. The default is `typed`.

```215:215:src/pages/Practice.tsx
      recordAnswer(answeredItem.itemId, grade);
```

A correct typed answer does not use this formula. The first success sets 1 day. The second success sets 6 days.

Later successes use `round(interval × ease)` with no 1.6 cap (`src/lib/srs.ts`, lines 104–115). A lapse still sets `intervalDays` to 1, `repetitions` to 0, and ease down by 0.20. The floor is 1.3. The ceiling is 2.8.

`docs/learning/2026-08-08-discrimination-exercise.md` already sets the 1.6 cap, the unchanged ease, and the full lapse on a wrong choice. This note adds the 1-day step. Where the two notes differ, this note wins.

The older file is not edited here. Its falsifier still stands. If the 1.6 cap schedules too many reviews, raise the cap toward 1.8. Do not use that signal to remove the 1-day step.

`docs/learning/lapse-handling.md` is unchanged. Its Decision section still matches the live lapse. Its section "What the code does today" still quotes the old `grade < 3` formula. That quotation is not the live code. The live type is `Grade = 0 | 5`.

## Options and the cost to the learner

**When the rounded product does not grow, add 1 day.** A correct answer leaves the daily pile. Ease 2.5 keeps the shipped ladder. A hard item still grows slowly after that one step.

**Round every product up.** The SM-2 article by Wozniak says to round a fraction up to the next integer (https://www.super-memory.com/english/ol/sm2.htm, step 3). That also fixes the stall. It also changes intervals that already grow. Ease 1.45 and interval 3 days go from 4 days to 5 days. Ease 2.5 and interval 2 days go from 3 days to 4 days. Full round-up changes the pinned ladder in `src/lib/srs.test.ts`.

**Leave the formula.** A correct choice at ease 1.3 and interval 1 day never spaces. The item is due every day. Wozniak set the ease floor at 1.3 because lower values repeated items too often. A correct answer that stays at 1 day recreates that pile.

## Rule

When `modality` is `choice` and `grade` is 5, apply this rule. Do not change the typed branch. Do not change the lapse branch.

1. Let `factor` be the smaller of `easeFactor` and 1.6.
2. Let `next` be `Math.round(intervalDays × factor)`.
3. If `intervalDays` is at least 1 and `next` is not greater than `intervalDays`, set `next` to `intervalDays + 1`.
4. If `intervalDays` is 0, set `next` to the greater of 1 and `next`.
5. Set `intervalDays` to the smaller of 365 and `next`.
6. Add 1 to `repetitions`. Leave `easeFactor` unchanged.

Worked values. The column "Now" is the live formula. The column "Next" is this rule. Ease 2.5 uses factor 1.6, because `min(2.5, 1.6)` is 1.6.

| Ease | Interval now | Now | Next |
| ---- | ------------ | --- | ---- |
| 1.3  | 1            | 1   | 2    |
| 1.3  | 3            | 4   | 4    |
| 1.3  | 10           | 13  | 13   |
| 1.45 | 1            | 1   | 2    |
| 1.45 | 3            | 4   | 4    |
| 1.45 | 10           | 15  | 15   |
| 2.5  | 1            | 2   | 2    |
| 2.5  | 3            | 5   | 5    |
| 2.5  | 10           | 16  | 16   |

The products behind the column "Now" are these values, before `Math.round`:

- 1 × 1.3 = 1.3, and the round is 1
- 3 × 1.3 = 3.9, and the round is 4
- 10 × 1.3 = 13, and the round is 13
- 1 × 1.45 = 1.45, and the round is 1
- 3 × 1.45 = 4.35, and the round is 4
- 10 × 1.45 = 14.5, and the round is 15
- 1 × 1.6 = 1.6, and the round is 2
- 3 × 1.6 = 4.8, and the round is 5
- 10 × 1.6 = 16, and the round is 16

A first choice on a new item has interval 0. Both formulas return 1 day. Ease stays at the start value 2.5 unless a lapse already changed it.

After the forced step, ease 1.3 grows on the old formula. Interval 1 becomes 2. Interval 2 becomes `round(2.6)`, which is 3. Interval 3 becomes 4. Interval 4 becomes `round(5.2)`, which is 5.

The all-correct choice ladder at ease 2.5 stays the pinned list. It starts 1, 2, 3, 5, 8. The test is `an all-choice-correct run` in `src/lib/srs.test.ts`.

## Runner-up

Full round-up lost. It is what the SM-2 page describes, and it fixes the stall. It also rewrites intervals that already move, including the pinned ease 2.5 ladder. The 1-day step touches only the cells that stay put.

The unchanged formula lost because a correct answer then has no spacing effect. The learner who just recalled the item sees it again the next day.

## How we know this rule is wrong

The app keeps no per-answer log. Check a hand sample of choice items whose ease is 1.3.

Those items lapse again on the review after the new 2-day gap, on more than 50 of 100 such reviews. The forced step is too long for a hard item. Then keep interval 1 for that one success, and add the day on the next correct choice. Do not remove the step from items whose ease is above 1.5.

Items at ease 2.5 come back too often. That signal belongs to the 1.6 cap. Raise the cap toward 1.8, as the discrimination note already says. Do not change the 1-day step for that signal.

The evidence for the size of the step is thin. Wozniak specifies round-up for the whole product, not a 1-day patch. This note keeps `Math.round` so the shipped ladder stays put. The patch is a local fix, not a new spacing study.

## Stored-shape impact

No change. The stored fields stay `intervalDays`, `easeFactor`, `repetitions`, `dueAt`, and `lastGrade`. `STORAGE_VERSION` stays 3. Do not add a field for this rule.

## Hand-off

`srs-engine` owns `src/lib/srs.ts`. Implement the five steps above on the choice branch only.

`qa` owns the tests. Keep `round(10 × 1.3) = 13`. Keep the ease 2.5 ladder that starts 1, 2, 3, 5, 8. Add a test for ease 1.3, interval 1, correct choice. The next interval is 2. Ease stays 1.3.

`frontend-expert` does not change the formula. See the defect below. It is not part of this rule.

## Defect in another owner's file

`src/pages/Practice.tsx` line 215 records every conjugation answer as `typed`, including a multiple-choice answer. P15 in `docs/learning/2026-08-08-ux-pedagogy-red-lines.md` says multiple choice must not take the same schedule as typed recall. This note does not fix that call. The lead routes it.
