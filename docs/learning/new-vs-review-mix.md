# New-versus-review mix

**Question:** How many new items does Ordböj introduce per day, how many reviews
does it show, and what happens when the review backlog exceeds the day's budget?

## Decision

New items are gated by remaining review capacity, not by a fixed rate. Each day
the app computes `reviewBudget = 30` due items; whatever is left over after the
day's genuinely-due reviews buys new items at three reviews per new item, capped
at six:

```
reviewsDueToday   = count(items where lastGrade !== undefined && dueAt <= endOfLocalDay)
newAllowedToday   = clamp(0, 6, floor((30 - min(reviewsDueToday, 30)) / 3))
```

An item that has never been answered is **not due**. It has no `dueAt` that
matters; it enters the queue only through `newAllowedToday`. The session queue is
reviews first (sorted `dueAt` ascending, most overdue first), then new items
(sorted by verb order, which is CEFR-ascending), truncated at the daily goal.

Concrete parameters:

| Parameter           | Default | Range  | Stored in |
| ------------------- | ------- | ------ | --------- |
| `reviewBudget`      | 30      | 10–120 | settings  |
| `newPerDayMax`      | 6       | 0–20   | settings  |
| `reviewsPerNewItem` | 3       | fixed  | constant  |
| backlog display cap | 30      | fixed  | UI        |

When more than 30 reviews are due, show the 30 most overdue and display
`30 due today` with a muted secondary line `+N waiting`. Never surface the raw
backlog number as the primary figure. New items are suppressed entirely
(`newAllowedToday = 0`) until the backlog clears — the queue drains itself
without the learner having to understand why.

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

**Fixed new-per-day (Anki's model).** `newPerDay = 3`, `maxReviews = 30`, both
constant. Cost to the learner: correct at steady state, wrong at the start. For
the first three weeks the review load is far below 30, so the learner does three
new items and a nearly empty queue, and concludes the app has nothing for them.
Then at week eight the load crosses 30 and the backlog grows silently.

**Fixed daily total, split by ratio.** 20 items/day, 70% review / 30% new. Cost:
when fewer than 14 reviews are due the ratio invents work; when more than 14 are
due it starves reviews to protect a new-item quota, which is backwards — a review
due today is worth more than a first exposure.

**Capacity-gated new items (chosen).** Cost: the introduction rate is not
predictable to the learner, and it slows down exactly when the learner is
struggling — which feels like punishment if unexplained. Mitigate with one line of
copy: "New verbs unlock as your reviews clear." The rate is self-correcting
without any server-side tuning, which is the binding constraint here.

## Why 30 and 6

The steady-state review load of an SRS is roughly ten reviews per item over the
first year, so `reviews/day ≈ 10 × new/day` is the standard planning heuristic and
matches Anki community measurements (7–12× depending on lapse rate). A 30-review
budget therefore supports about three new items per day sustained, which is what
the formula converges to once the collection matures. The cap of six exists for
the early weeks, when the review load is genuinely small and a hard limit of three
would make the app feel empty. Six new items is at most two verbs' worth of forms
— see [[form-introduction-order]], which introduces one form per verb at a time.

At three new items per day, the 50-verb table takes roughly two months to
introduce fully. That is the honest cost of a 12-item daily goal
([[session-shape-and-daily-goal]]). Raising `newPerDayMax` raises it back, at the
price of a review queue the learner will eventually stop clearing.

## Interaction with the day boundary

`dueAt` is `Date.now() + interval` (`src/lib/srs.ts:39`), so an item answered at
21:00 on Monday with a one-day interval comes due at 21:00 Tuesday — after the
learner's Tuesday session. This decision assumes due-ness is evaluated against the
**end of the local day**: an item is due today if `dueAt <= endOfLocalDay()`. That
change belongs to `srs-engine` and is a prerequisite for the counts above to mean
anything.

## How we would know this was wrong

- Sessions where the learner answers fewer than half the queued items, repeatedly.
  The cap is still too high.
- `newAllowedToday` sits at 0 for more than five consecutive days on a learner who
  is studying daily. The budget/ratio pair is mistuned; lower `reviewsPerNewItem`
  to 2 before raising `reviewBudget`.
- The learner manually raises `newPerDayMax` in settings within the first week.
  The default is too conservative for a motivated user and should start at 10.
- Backlog grows monotonically across a fortnight of daily use. The 10:1 heuristic
  is wrong for this material (plausible — four forms of one verb are more
  confusable than four unrelated words) and `reviewsPerNewItem` must rise to 4.

All four are measurable from `localStorage` alone, with a per-day answered-count
log. No backend needed.

## Routed to

`srs-engine` — queue construction, new/review separation, day-boundary due-ness.
`frontend-expert` — capped backlog display, "new verbs unlock" copy.
