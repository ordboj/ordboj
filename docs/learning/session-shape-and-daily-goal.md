# Session shape and daily goal

**Question:** How long is one sitting, what ends it, what is the default daily
goal, and what happens when the learner wants to keep going after the queue is
empty?

## Decision

The learner picks **minutes per day**, not a card count. Onboarding asks once, and
Settings keeps the control. The app derives the card goal at five items per minute
— roughly 12 seconds per typed conjugation including feedback:

```
dailyGoal = minutesPerDay * 5
```

| Preset                    | `minutesPerDay` | `dailyGoal` |
| ------------------------- | --------------- | ----------- |
| Just a minute or two      | 2               | 10          |
| A short session           | 5               | 25          |
| **Ten minutes (default)** | **10**          | **50**      |
| Serious                   | 20              | 100         |

`dailyGoal` is also directly editable in Settings (range 5–120) for anyone who
would rather think in cards; editing it detaches it from the preset.

A **day** ends when `answeredToday >= dailyGoal` or the queue empties. A **sitting**
is capped at **15 items**, after which the card is replaced by
`Keep going (N left today)` / `Done for now`. Ten minutes of study is a legitimate
choice; ten minutes of study with no exit is a wall. The sitting cap costs one tap
to dismiss and gives the learner a clean stopping point roughly every three
minutes. Progress persists, so stopping mid-day costs nothing.

Not a timer. A countdown pushes the learner toward fast recognition and away from
effortful retrieval, and effortful retrieval is what produces retention. A timer
also makes the hint button and the reveal-and-move-on flow feel expensive, which
is backwards.

After the goal is met or the queue is empty, **Keep practising** opens _free
practice_: items drawn from the nearest future due dates, same card UI, which
**records nothing** — no `recordAnswer`, no `dueAt` change, no ease change, no
daily count. Studying ahead of schedule is the classic way learners destroy their
own spacing, and the fix is to let them do it without letting it touch the
schedule. Anki solves the same problem with filtered decks set to "no
rescheduling".

One exception writes state: items that come **genuinely due later the same day**
(interval-1 items scheduled for the evening) are offered as an "Extra reviews (N)"
round that does record and does count. The distinction an engineer implements is
exactly `dueAt <= now`.

| Parameter                               | Value                                                |
| --------------------------------------- | ---------------------------------------------------- |
| `minutesPerDay` default                 | 10                                                   |
| `minutesPerDay` presets                 | 2 / 5 / 10 / 20                                      |
| `itemsPerMinute`                        | 5 (constant)                                         |
| `dailyGoal`                             | `minutesPerDay * 5`, overridable, range 5–120        |
| sitting cap                             | 15 items, then continue/stop prompt                  |
| day end condition                       | `answeredToday >= dailyGoal \|\| queue.length === 0` |
| free-practice batch size                | 5 items, repeatable                                  |
| free practice writes SRS state          | no                                                   |
| lapse re-shows count toward `dailyGoal` | no (see [[lapse-handling]])                          |
| day boundary                            | local midnight                                       |

`answeredToday` is a new persisted value: `{ date: 'YYYY-MM-DD', count: number }`
in `localStorage`, reset when the local date string changes. It feeds
[[streak-mechanics]] and the capacity gate in [[new-vs-review-mix]].

## What the code does today

There is no session concept. `Practice.tsx:33-42`:

```ts
if (currentIndex < dueItems.length - 1) {
  setCurrentIndex(currentIndex + 1);
} else {
  setPracticeComplete(true);
}
```

The session is the entire due list — about 175 items on a fresh install. The
completion screen claims "You've completed all due cards for today"
(`Practice.tsx:63-65`), which is only true because the queue was never bounded.
There is no way to stop and resume with credit, no daily count, and no
after-the-queue path: the only button is **Back to Home**.

`dailyGoal: 20` in `useSettings.ts:19` is dead. Grep across `src/**` finds it in
`useSettings.ts` and in tests, nowhere else. It was never a decision; it was a
scaffold field.

## Why minutes rather than a card count

Card counts are opaque before you have done any cards. A learner cannot tell
whether 20 is a lot; they can tell whether ten minutes is a lot. Asking in the
unit the learner already budgets in gets a truthful answer, and the truthful
answer is what makes the goal survivable — the first missed goal is what teaches
the learner the app is optional.

Five items per minute is a planning constant, not a measurement of this learner.
It should be replaced by their observed median seconds-per-item once
`answeredToday` logging exists: `dailyGoal = round(minutesPerDay * 60 /
medianSecondsPerItem)`, recomputed weekly, clamped to ±40% of the preset value so
a few slow days cannot collapse the goal to nothing.

The runner-up was **a fixed 12-card default with no time question at all** — one
number, no onboarding step, and the property that one sitting equals one day. It
lost because it silently decides how much of the learner's day the app is worth,
and the human's answer was that this is the learner's call. The sitting cap keeps
the useful half of that design: 15 items is still a phone-queue-sized unit, it is
just no longer the whole day for someone who wants more.

## The resume problem

Because the goal is per-day and not per-sitting, closing the app mid-queue is
free: `answeredToday` persists, and reopening resumes with the remaining goal.
`currentIndex` is component state and is lost, which is fine — the queue is
rebuilt from `dueAt`, and answered items are no longer due.

## How we would know this was wrong

- Median items per day settles far below the chosen `dailyGoal` for a week: the
  preset was aspirational. Offer a one-tap "adjust to what you actually do" rather
  than letting the goal stand and be missed.
- The learner dismisses the sitting cap every single time: 15 is too small for
  them, raise to 25 or make the cap a preference.
- **Keep practising** used in more than half of sessions: the goal is
  under-serving them; raise `newPerDayMax` rather than `dailyGoal`, since the
  appetite is for new material, not more repetition.
- Sessions abandoned mid-queue on days when the backlog shows "+N waiting": the
  backlog copy is producing dread rather than reassurance; hide the secondary
  count entirely.

## Routed to

`frontend-expert` — onboarding minutes question, Settings control, sitting cap and
continue/stop prompt, completion screen, free-practice and extra-reviews paths.
`srs-engine` — `answeredToday` persistence, `dailyGoal` derivation, and the
`dueAt <= now` split between free practice and extra reviews.
