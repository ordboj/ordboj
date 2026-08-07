# Lapse handling

**Question:** When the learner gets an answer wrong, do we reveal or let them
retry, when does the item come back, and what does the miss do to its schedule?

## Decision

Reveal immediately, no retry before the reveal. Re-queue the item **within the
same sitting**, after at least three intervening items, and require one correct
answer on it before the sitting ends. Set `intervalDays = 1` and `repetitions = 0`
as today, but replace the SM-2 ease formula with two flat constants, because the
UI only ever produces two grades.

```
correct : easeFactor = min(2.80, easeFactor + 0.05)
wrong   : easeFactor = max(1.30, easeFactor - 0.20)
hinted  : easeFactor = max(1.30, easeFactor - 0.05)
          intervalDays = max(1, round(intervalDays * 0.5))
          repetitions unchanged
```

| Parameter                          | Value                               |
| ---------------------------------- | ----------------------------------- |
| lapse `intervalDays`               | 1                                   |
| lapse `repetitions`                | 0                                   |
| lapse ease delta                   | −0.20                               |
| correct ease delta                 | +0.05                               |
| ease ceiling / floor               | 2.80 / 1.30                         |
| same-sitting re-queue gap          | ≥ 3 items                           |
| re-queue counts toward `dailyGoal` | no                                  |
| max re-queues per item per day     | 2, then drop to tomorrow            |
| hinted answer                      | half interval, ease −0.05, no reset |
| retry before reveal                | never                               |

Free-practice answers ([[session-shape-and-daily-goal]]) run none of this.

## Interaction with the sitting cap

A sitting is capped at 15 items and a day's goal may be several sittings
([[session-shape-and-daily-goal]]). Pending re-queues carry across sittings within
the same day: an item lapsed at item 14 of a sitting is re-asked at the start of
the next sitting rather than being dropped, and the two-re-queue cap is per item
per **day**, not per sitting, so a learner doing four sittings cannot be asked the
same failed verb eight times. If the day ends with a re-queue still pending, it is
simply due tomorrow with the lapse already applied — nothing is lost.

## What the code does today

`src/lib/srs.ts:13-42` applies the SM-2 ease update **before** the failure branch,
so a lapse takes the full formula penalty and then resets:

```ts
easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
if (grade < 3) {
  repetitions = 0;
  intervalDays = 1;
}
```

At `grade = 0` that expression is `0.1 - 5 × (0.08 + 0.10) = -0.80`. Every miss
costs 0.8 ease. Meanwhile `PracticeCard.tsx:135` emits only two grades:

```ts
const grade: Grade = isCorrect ? 5 : 0;
```

So the six-point scale in `Grade` is fiction: the app produces 5 or 0 and nothing
else. Ease rises 0.10 per correct answer and falls 0.80 per miss. An item missed
once needs eight correct answers to recover, and from 2.5 an item that is missed
twice early lands at the 1.3 floor and stays there for the life of the collection
— Anki's documented "ease hell", reproduced here in a sharper form because the
penalty is unconditionally maximal.

The missed item never returns in the session. `Practice.tsx:37-42` advances
`currentIndex` unconditionally; the item's next appearance is tomorrow at the
earliest. The learner sees the correct form once, passively, and moves on.

Hints are free. `handleHint` (`PracticeCard.tsx:100-112`) reveals one random
letter per press with no cap on presses and no record of use, and `handleNext`
still sends grade 5 if the learner then types the answer they just uncovered. A
learner can reveal every letter of `visste` and the scheduler records a perfect
recall with an ease bump.

None of this is defensible. The MVP grades hinted recall and unaided recall
identically, punishes lapses eight times harder than it rewards successes, and
never gives the learner a second retrieval attempt on the thing they just failed.

## Why reveal rather than retry

Retry-until-correct converts retrieval into search. The learner cycles guesses
until the form appears, the scheduler records success, and nothing was retrieved.
Immediate corrective feedback after a failed retrieval attempt is the
better-supported arrangement: the failed attempt itself potentiates learning, and
the feedback that follows is what fixes the correct form (Butler & Roediger 2008,
on feedback after errorful retrieval; Kornell, Hays & Bjork 2009, on unsuccessful
retrieval attempts improving subsequent learning). The condition for that benefit
is a genuine attempt followed by the answer — which is what the current card
already does. What it lacks is the second retrieval.

## Why the same-sitting re-queue is the important half

Re-showing the correct form is exposure. Re-asking the question is retrieval, and
retrieval is what produces the testing effect (Roediger & Karpicke 2006). Anki's
relearning steps exist for this reason and are near-universally kept on. Three
intervening items is enough to clear working memory without pushing the item so
far that the correction is forgotten; it is also small enough to fit inside a
15-item sitting, where a gap of ten would mean lapsed items rarely return at all.

Re-queued items must not count toward `dailyGoal`, or a bad day silently becomes a
short day — failing more would mean studying less. Cap at two re-queues per item
per day so one intractable verb cannot trap the learner; on the third miss it goes
to tomorrow with the ease penalty already applied.

## Why the ease constants change

SM-2's graded ease formula assumes a self-rated 0–5 scale. Ordböj has a binary
grader and, given `showExamples`, `handleHint` and a letter-tile keyboard, will
not get a trustworthy self-rating out of a learner soon. Feeding a binary signal
into a formula calibrated for six levels produces the −0.80/+0.10 asymmetry above,
which is not a design choice anyone made. Flat constants at −0.20/+0.05 keep ease
meaningful (it still separates easy verbs from hard ones over a few dozen answers)
without driving the whole collection to the floor. The 2.80 ceiling prevents the
reverse failure: an item answered correctly forty times running otherwise inflates
to intervals no one wants on irregular verbs.

The runner-up was **removing ease entirely** — fixed multiplier 2.0, lapse resets
to 1 day. It is simpler and, for a 50-verb collection, probably indistinguishable
in outcome. It lost because ease is the only per-item difficulty signal the app
has, and Swedish strong verbs genuinely are harder than grupp 1 verbs; throwing
that away costs more than the complexity of two constants.

The larger runner-up, **FSRS**, lost on scope: it needs a review log the app does
not keep and parameter optimisation the app cannot run offline on one device.
Revisit only if a review log is added for other reasons.

## The hint penalty is a policy, not a bug fix

Hints are worth keeping — a learner stuck on `visste` with no path forward
abandons the card and the sitting. But an item recalled with three letters
revealed is not an item recalled. Halving the interval rather than resetting it
says: this was partial, come back sooner, but you did not fail. `PracticeCard`
must therefore report hint use to `Practice.tsx`, which means the `onAnswer`
signature changes from `(grade: Grade)` to something carrying
`{ correct: boolean; hintsUsed: number }`. That is a cross-file change:
`frontend-expert` owns the card and the call site, `srs-engine` owns the scheduler
signature it calls into.

## Migration

These constants change the meaning of stored `easeFactor` values: an item sitting
at 1.3 today may be there because of the −0.80 penalty rather than because it is
genuinely hard. Existing progress is preserved (no reset), and the forward
migration to `version: 2` should rebase eases that are pinned at the floor:
`easeFactor = max(easeFactor, 1.8)` for any item with `repetitions >= 2`, which
un-sticks items the old formula punished for a single early miss without inflating
anything the learner actually finds difficult. Cloud backup is being evaluated
separately; until it exists, one browser is the only copy and no migration may
discard a field it does not recognise.

## How we would know this was wrong

- Median `easeFactor` across the collection drifts below 1.8 within a month of
  daily use: the −0.20 penalty is still too harsh for a binary grader; go to
  −0.10.
- Items repeatedly lapse the day after a same-sitting correction: the re-queue is
  happening too soon to be a real retrieval; raise the gap to 6 items, or move the
  second attempt to the end of the sitting.
- Hint presses per sitting rise steadily: the halved interval is not deterring
  hint-as-answer-reveal and the hint needs a hard cap (e.g. at most
  `floor(length / 2)` letters).
- Sittings abandoned immediately after a lapse: the re-queue requirement reads as
  a punishment; make the second attempt optional and see whether it is still used.

## Routed to

`srs-engine` — `src/lib/srs.ts` grading constants, lapse branch, hint branch,
re-queue eligibility, ease rebase in the `version: 2` migration.
`frontend-expert` — `onAnswer` payload, hint accounting in `PracticeCard`, the
re-queue insertion in `Practice.tsx`, and feedback copy that shows the correct
form and announces the item will return.
