# New-versus-review mix

**Question:** How many new items does Ordböj introduce per day, how many reviews
does it show, and what happens when the review backlog exceeds the day's budget?

## Decision

New items are gated by remaining review capacity, not by a fixed rate. The
learner's chosen daily budget (`dailyGoal`, derived from a minutes-per-day
setting — see [[session-shape-and-daily-goal]]) is the whole day's budget. Reviews
are served first; whatever budget is left over buys new items at three reviews per
new item:

```
reviewsDueToday = count(items where lastGrade !== undefined && dueAt <= endOfLocalDay)
newPerDayMax    = round(dailyGoal * 0.3)
newAllowedToday = clamp(0, newPerDayMax,
                        floor((dailyGoal - min(reviewsDueToday, dailyGoal)) / 3))
```

An item that has never been answered is **not due**. Its `dueAt` is irrelevant; it
enters the queue only through `newAllowedToday`. The session queue is reviews
first (sorted `dueAt` ascending, most overdue first), then new items (sorted by
verb order, which is CEFR-ascending), truncated at `dailyGoal`.

Every number scales off the one knob the learner sets:

| Minutes/day (onboarding) | `dailyGoal` | `newPerDayMax` | New items on day one |
| ------------------------ | ----------- | -------------- | -------------------- |
| 2                        | 10          | 3              | 3                    |
| 5                        | 25          | 8              | 8                    |
| **10 (default)**         | **50**      | **15**         | **15**               |
| 20                       | 100         | 30             | 30                   |

| Parameter           | Value                    | Range             | Stored in |
| ------------------- | ------------------------ | ----------------- | --------- |
| `dailyGoal`         | 50 (from 10 min/day)     | 5–120             | settings  |
| `newPerDayMax`      | `round(dailyGoal * 0.3)` | overridable, 0–40 | settings  |
| `reviewsPerNewItem` | 3                        | fixed             | constant  |
| review queue cap    | `dailyGoal`              | —                 | derived   |
| backlog display cap | `dailyGoal`              | —                 | derived   |

When more due reviews exist than `dailyGoal`, show the `dailyGoal` most overdue
and display `50 due today` with a muted secondary line `+N waiting`. Never surface
the raw backlog as the primary figure. New items are suppressed entirely
(`newAllowedToday = 0`) until the backlog clears — the queue drains itself without
the learner having to understand why.

`newPerDayMax` derives from `dailyGoal` but remains independently settable, so a
learner who wants to front-load coverage can raise it and accept the review debt
knowingly.

## No deadline mode

Considered and rejected on the human's instruction: no exam-countdown mode that
works backwards from a test date and prioritises coverage over retention.
Capacity-gated introduction is the only mode. A learner with a deadline raises
`newPerDayMax` manually, which is the same lever with the tradeoff visible.

## What the code does today

`initializeSrsState` (`src/lib/srs.ts:45-53`) sets `dueAt: Date.now()` for every
item, and `useSrsProgress` creates one state per verb per form on first load
(`src/hooks/useSrsProgress.ts:33-45`):

```ts
const forms: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];
for (const verb of verbs) {
  for (const form of forms) {
    const itemId = `${verb.id}-${form}`;
    if (!newStates[itemId]) newStates[itemId] = initializeSrsState(itemId);
  }
}
```

`getDueItems` then returns every item where `isDue(state)` is true, shuffled, with
no cap. With 50 verbs in `VERB_DATA` and roughly 3.5 usable forms each, **the
first session of a new install is a queue of about 175 cards.** `Practice.tsx:99`
renders that as `1 / 175`, and the progress bar advances by 0.6% per answer. There
is no distinction anywhere in the codebase between a new item and a review; there
is no daily cap; `dailyGoal` exists in `useSettings.ts:19` and is read by no
production file.

This is not defensible. It is the single largest pedagogical defect in the MVP:
the app's first screen is the abandonment screen.

## Options considered

**Fixed new-per-day (Anki's model).** Constant `newPerDay` and `maxReviews`. Cost
to the learner: correct at steady state, wrong at the start. For the first weeks
the review load is far below the cap, so the learner does a handful of new items
and faces a nearly empty queue, and concludes the app has nothing for them. Later
the load crosses the cap and the backlog grows silently.

**Fixed daily total, split by ratio.** 70% review / 30% new regardless of what is
due. Cost: when few reviews are due the ratio invents work; when many are due it
starves reviews to protect a new-item quota, which is backwards — a review due
today is worth more than a first exposure.

**Capacity-gated new items (chosen).** Cost: the introduction rate is not
predictable to the learner, and it slows down exactly when the learner is
struggling, which feels like punishment if unexplained. Mitigate with one line of
copy: "New verbs unlock as your reviews clear." The rate is self-correcting
without any server-side tuning, which is the binding constraint here.

## Why the budget is the goal, and why 30%

The steady-state review load of an SRS is roughly ten reviews per item over the
first year, so `reviews/day ≈ 10 × new/day` is the standard planning heuristic and
matches Anki community measurements (7–12× depending on lapse rate). Setting the
review budget equal to `dailyGoal` and charging three reviews per new item makes
the formula converge to `dailyGoal / 10` new items per day once the collection
matures — about five per day at the default. `newPerDayMax` at 30% of the goal
binds only in the early weeks, when the review load is genuinely small and the
steady-state rate alone would make the app feel empty.

At the 10-minute default the 50-verb table is introduced in under two weeks; at
the 2-minute preset it takes about two months. That is the honest cost of a short
budget, and it is now the learner's choice rather than ours.

## Interaction with the day boundary

`dueAt` is `Date.now() + interval` (`src/lib/srs.ts:39`), so an item answered at
21:00 on Monday with a one-day interval comes due at 21:00 Tuesday — after the
learner's Tuesday session. This decision assumes due-ness is evaluated against the
**end of the local day**: an item is due today if `dueAt <= endOfLocalDay()`. That
change belongs to `srs-engine` and is a prerequisite for the counts above to mean
anything.

## How we would know this was wrong

- Sessions where the learner answers fewer than half the queued items, repeatedly.
  The chosen minutes-per-day is above what they actually do; prompt a re-pick
  rather than silently lowering it.
- `newAllowedToday` sits at 0 for more than five consecutive days on a learner who
  is studying daily. The ratio is mistuned; lower `reviewsPerNewItem` to 2 before
  raising the goal.
- The learner raises `newPerDayMax` above the derived value in the first week. The
  30% default is too conservative for a motivated user.
- Backlog grows monotonically across a fortnight of daily use. The 10:1 heuristic
  is wrong for this material (plausible — four forms of one verb are more
  confusable than four unrelated words) and `reviewsPerNewItem` must rise to 4.

All four are measurable from `localStorage` alone, with a per-day answered-count
log. No backend needed.

## Routed to

`srs-engine` — queue construction, new/review separation, derived parameters,
day-boundary due-ness.
`frontend-expert` — capped backlog display, "new verbs unlock" copy.
