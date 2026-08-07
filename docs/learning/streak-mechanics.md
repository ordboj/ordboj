# Streak mechanics

**Question:** Does Ordböj have streaks, and if so how do they forgive a missed
day?

## Decision

Three modes, chosen by the learner in Settings, defaulting to **weekly**:

| `adherenceMode`    | Behaviour                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`             | No streak, no dots, no counter. Home screen shows only what is due.                                                                                                 |
| `weekly` (default) | Target 5 days out of 7, local Monday–Sunday. Streak counts consecutive weeks that hit the target. Display: seven dots, filled for met days, plus "N weeks running". |
| `daily`            | Consecutive days meeting `dailyGoal`. One grace day per rolling 14 days is consumed automatically before the streak breaks.                                         |

| Parameter                     | Value                        | Range                       |
| ----------------------------- | ---------------------------- | --------------------------- |
| `adherenceMode` default       | `weekly`                     | `none` / `weekly` / `daily` |
| `weeklyTarget`                | 5 days                       | 3–7                         |
| week boundary                 | local Monday 00:00           | fixed                       |
| daily-mode grace days         | 1 per rolling 14 days        | 0–2                         |
| a day "counts" when           | `answeredToday >= dailyGoal` | —                           |
| purchasable/repairable streak | never                        | —                           |

A day counts on the goal the learner set, so someone on the 2-minute preset earns
the same dot as someone on 20 minutes. The unit is showing up, not volume.

No freeze items, no streak repair, no "restore your streak" prompt. Those exist to
monetise loss aversion, and there is nothing to monetise here — the forgiveness is
free and automatic in both modes that have it.

## What the code does today

Nothing. No streak, no adherence tracking, no per-day counter. `dailyGoal` in
`useSettings.ts:19` is the only field in the neighbourhood and no production file
reads it. The prerequisite for all three modes is the `answeredToday` record
defined in [[session-shape-and-daily-goal]] plus a persisted set of met-day dates.

Storage: `{ metDays: string[] }` of `YYYY-MM-DD`, pruned to the last 400 entries.
Both modes are computed from that array; switching modes never loses history,
because the history is dates rather than a derived counter.

## Why weekly is the default

Streaks demonstrably raise daily return rates — that is why every consumer
learning app ships them. They also produce the abandonment that follows the first
break, which is why Duolingo has spent years layering forgiveness on top: streak
freezes, streak repair, weekend amulets. The pattern in that product history is
the finding: the mechanic works, and the unmodified daily version is harsh enough
that its own strongest proponent kept softening it.

A weekly target moves the forgiveness into the structure rather than bolting it
on. Missing a Tuesday is free by construction, so there is no moment where the
learner faces a broken thing and has to decide whether restarting is worth it. The
cost is a weaker daily pull: 5-of-7 does not create the "I must open this before
midnight" reflex, and for some learners that reflex is the entire reason the habit
survives. That is precisely why `daily` remains available — the tradeoff between
motivation and guilt is not one anyone can resolve on the learner's behalf, and
the two modes name the two sides of it honestly.

`none` exists because a solo learner with no audience may find any adherence
display to be pure guilt with no upside. It costs one branch to support.

The runner-up for the default was `daily` with a grace day, which is what most
learners expect on sight and therefore needs no explanation. It lost because the
expectation is exactly the problem: the learner who expects a daily streak also
expects the punishment, and defaults should not hand out punishments the learner
did not ask for.

## What must not happen

- No notification, badge, or red dot tied to a streak at risk. Once the app can
  make the learner feel bad while it is closed, the mechanic has stopped serving
  learning.
- No streak display on the practice screen. It belongs on Home, before the
  decision to study, not during it.
- Switching to `none` must hide the history, not delete it. Switching back
  restores the real numbers.

## How we would know this was wrong

- The learner switches to `none` within two weeks: the default is generating guilt
  rather than pull, and `none` should become the default.
- The learner switches to `daily`: fine, and expected for a subset — but if it
  happens and then usage stops after the first break, the grace-day allowance is
  too thin, raise it to 2 per 14 days.
- Weeks land consistently at exactly 5 met days and no more: the target has become
  a ceiling rather than a floor. Show the dots without the target, or raise it to
  6 and see whether behaviour follows.
- Study happens in bursts of 7 days followed by nothing: adherence mechanics are
  not the lever here at all, and the answer is a lower `minutesPerDay` preset
  ([[session-shape-and-daily-goal]]) rather than a different streak.

## Routed to

`srs-engine` — `metDays` persistence, met-day evaluation against `dailyGoal`,
grace-day accounting.
`frontend-expert` — Settings control for `adherenceMode` and `weeklyTarget`, the
seven-dot Home display, and the deliberate absence of any streak UI inside
Practice.
