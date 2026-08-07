# Session shape and daily goal

**Question:** How long is one sitting, what ends it, what is the default daily
goal, and what happens when the learner wants to keep going after the queue is
empty?

## Decision

One number, `dailyGoal`, default **12 items**, range 5–50, adjustable in steps of

1. A session ends when the learner has answered `dailyGoal` items **today** or the
   queue empties, whichever comes first. Not a timer. Twelve typed conjugations at
   roughly 8–12 seconds each is 100–150 seconds — one bus stop, one kettle.

Doing exactly one session hits the goal. That is deliberate: the goal and the
session are the same unit, so the learner never has to reason about "how much of
my goal is left". A bad day costs one session, not a negotiation.

After the queue is empty or the goal is met, the learner gets a **Keep practising**
button that opens _free practice_: items drawn from the nearest future due dates,
in the same card UI, which **records nothing** — no `recordAnswer`, no `dueAt`
change, no ease change, no daily count. Studying ahead of schedule is the classic
way learners destroy their own spacing, and the fix is to let them do it without
letting it touch the schedule. Anki solves the same problem with filtered decks
set to "no rescheduling".

One exception writes state: if items come **genuinely due later the same day**
(interval-1 items scheduled for the evening), offering them is correct. Those go
into an "Extra reviews (N)" round that does record answers and does count. The
distinction an engineer implements is exactly `dueAt <= now`.

| Parameter                                   | Value                                                |
| ------------------------------------------- | ---------------------------------------------------- |
| `dailyGoal` default                         | 12                                                   |
| `dailyGoal` range                           | 5–50                                                 |
| session end condition                       | `answeredToday >= dailyGoal \|\| queue.length === 0` |
| free-practice batch size                    | 5 items, repeatable                                  |
| free practice writes SRS state              | no                                                   |
| lapse re-shows count toward `answeredToday` | no (see [[lapse-handling]])                          |
| day boundary                                | local midnight                                       |

`answeredToday` is a new persisted value: `{ date: 'YYYY-MM-DD', count: number }`
in `localStorage`, reset when the local date string changes. It is also the input
to [[streak-mechanics]] and to the capacity gate in [[new-vs-review-mix]].

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

## Why 12 and not 20

The default should be a number the learner clears on their worst realistic day,
because the first missed goal is what teaches them the app is optional. Twenty
typed items is three to four minutes of sustained attention plus the failure
handling; twelve is under two. If the learner routinely wants more, they will
raise it — a raised goal is a commitment they chose, which is a different
psychological object from a default they inherited and failed.

The runner-up was a **timer** (two minutes, end wherever you are). It lost on
desirable difficulty: a countdown pushes the learner toward fast recognition and
away from effortful retrieval, and effortful retrieval is the thing that produces
retention. A timer also makes the hint button and the reveal-and-move-on flow feel
expensive, which is exactly backwards.

The second runner-up was **end on empty queue only** — the current behaviour with
a cap upstream. It is nearly identical in practice once
[[new-vs-review-mix]] caps the queue at 30, but it gives the learner no stable
number to plan around, and on a heavy backlog day it produces a 30-item sitting
with no exit that counts as success.

## The resume problem

Because the goal is per-day and not per-session, closing the app mid-queue is
free: `answeredToday` persists, and reopening resumes with the remaining goal.
`currentIndex` is component state and is lost, which is fine — the queue is
rebuilt from `dueAt`, and answered items are no longer due.

## How we would know this was wrong

- The learner raises `dailyGoal` above 25 within two weeks: 12 is too small, ship
  a default of 20 and revisit.
- The learner hits **Keep practising** in more than half of sessions: the goal is
  under-serving them and free practice is absorbing demand that should be real
  reviews — raise `newPerDayMax` rather than `dailyGoal`.
- Median items answered per session settles well below 12 (say 7): the sitting is
  too long, drop to 8.
- Sessions abandoned mid-queue on days when the backlog display shows "+N
  waiting": the backlog copy is producing dread rather than reassurance; hide the
  secondary count entirely.

## Routed to

`frontend-expert` — session end, completion screen, free-practice mode, the
`Keep practising` and `Extra reviews` paths, goal control in Settings.
`srs-engine` — `answeredToday` persistence and the `dueAt <= now` split between
free practice and extra reviews.
