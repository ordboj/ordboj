# Response latency and attempt count as scheduling signals

**Question:** Should Ordböj record how long an answer took and how many attempts
it took, and should either signal move the SRS interval, ease or grade?

## Decision

**Attempt count: adopt, in one narrow form — first-attempt correctness is the
grade, and nothing later can raise it.** No graded scale ("right on the second
try" is not a partial credit tier). The same-sitting re-queue that
[[lapse-handling]] introduces is practice, not assessment: it applies no grade, no
ease change and no interval change. Cost to implement: zero new stored fields.

**Response latency: reject for scheduling. Adopt for one non-scheduling use —
estimating the learner's seconds-per-item so `dailyGoal` stops being a guess.**
Latency never enters `src/lib/srs.ts`, never touches `easeFactor`, `intervalDays`
or `Grade`, and is never shown to the learner as a per-card figure. It lives in a
separate, disposable stats store and feeds the `medianSecondsPerItem` calculation
that [[session-shape-and-daily-goal]] already promised.

| Parameter                                  | Value                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- |
| grade source                               | first submission of the card in that appearance                       |
| attempts persisted                         | no — component state only                                             |
| re-queued answer → grade / ease / interval | none / none / none                                                    |
| second lapse of the same item, same day    | no second ease penalty                                                |
| retry before reveal                        | never (red line, [[2026-08-08-ux-pedagogy-red-lines]] P1)             |
| multiple choice                            | first option tapped commits; no re-tap                                |
| latency → any SRS field                    | never                                                                 |
| latency capture window                     | card render → `onAnswer` (the **Next Card** press), feedback included |
| sample discarded if                        | > 60 000 ms, < 500 ms, or the document was hidden during the window   |
| samples retained                           | last 100, ring buffer                                                 |
| statistic                                  | median of the buffer, not the mean                                    |
| minimum samples before use                 | 30                                                                    |
| per-item seconds clamped to                | 4 s – 30 s before deriving `dailyGoal`                                |
| seed value before 30 samples               | 12 s (equals today's `minutesPerDay * 5` constant)                    |
| store                                      | new key `swedish-verbs-stats`, `{ version: 1, ... }`                  |
| store is progress?                         | no — safe to drop on quota pressure or corruption                     |
| per-card time shown to the learner         | never, including retrospectively                                      |
| aggregate session time shown               | permitted, past tense, off the card (ruling below)                    |

The capture window and the 500 ms floor are amendments ratified over my original
spec; see "Amendments" below for why they are improvements rather than
concessions.

## What the code does today

Verified against the tree at 2026-08-08 after the P4/P11/P14/P21 work landed. An
earlier draft of this note described a letter-tile keyboard that no longer exists;
the argument below does not depend on it.

**There is no attempt loop and no clock.** `handleSubmit`
(`PracticeCard.tsx:171-186`) grades once and sets `showFeedback`, and the entire
input block is gated on `{!showFeedback && (` (`PracticeCard.tsx:324`), so the
learner physically cannot answer a second time. "Attempts before the correct
answer" is always 1. The signal does not exist; the question is whether to create
it. Nothing anywhere records a timestamp.

**Auto-submit still exists and still grades without a submission event**
(`PracticeCard.tsx:195-214`, P13 open). It no longer compares against a single
string: it normalises the typed value, looks it up in the card's accepted-answer
set, and suppresses the auto-submit while the typed value is a strict prefix of
another accepted answer, so a learner typing toward `lade` is not cut off at
`la`. That is a real improvement in answer handling and it is irrelevant to this
decision — the card can still grade itself on a keystroke. Under the ratified
capture window the clock stops at **Next Card**, not at submission, so this note
no longer depends on P13 shipping.

**The scaffolding that would have poisoned a latency measurement is gone.**
`SWEDISH_SPECIAL_CHARS = ['å', 'ä', 'ö']` (`PracticeCard.tsx:35`) is a fixed
three-key row rendered on every card regardless of the answer
(`PracticeCard.tsx:343-362`), replacing the shuffled tile row that was built from
the unique letters of the correct answer. P11's mobile-entry problem is solved and
P4's disclosure is closed. `caret-transparent` is still on the input
(`PracticeCard.tsx:335`), so P12 remains open, but that is cosmetic here.

**The scheduler has nowhere to put either signal.** `SrsState` (`srs.ts:1-8`)
holds `itemId`, `repetitions`, `intervalDays`, `easeFactor`, `dueAt`, `lastGrade`
— no timestamp of the review, no history. `calculateNextReview(state, grade)`
(`srs.ts:38`) and `recordAnswer(itemId, grade)` (`useSrsProgress.ts:260`) both take
a bare `Grade`, and the store is still `STORAGE_VERSION = 2`
(`useSrsProgress.ts:20`). Any third signal changes two signatures across two
owners and needs a `version: 3` migration.

**The re-queue is built, and it currently grades.** `Practice.tsx` implements the
whole [[lapse-handling]] mechanic — `requeueMap`, `MAX_REQUEUES_PER_DAY`,
`isEligibleForRequeue`, the local-day reset. But `handleAnswer` calls
`recordAnswer(answeredItem.itemId, grade)` for every non-free answer
(`Practice.tsx:205-212`), with no re-queue exemption, so a learner who fails
`visste`, reads the correct form, and types it back three cards later has the
lapse overwritten: `repetitions` climbs off 0, `intervalDays` leaves 1, and ease
gains +0.05. This is precisely the failure I predicted when I argued against
framing attempt count as simply "rejected", and it is now issue #249. The fix is
small because the distinction already exists: `isRequeueAttempt`
(`Practice.tsx:312`) is computed and already used to keep re-queues out of the
progress count (`Practice.tsx:316`). It needs to gate the `recordAnswer` call the
same way `sessionKind === 'free'` does.

## Why first-attempt correctness, and why the re-queue earns nothing

The re-queue brings a failed item back after at least three intervening items. If
that second answer graded the item — as it does today — the lapse is undone by a
retrieval at three-card delay, supported by information still in working memory
and by the reveal the learner just read. The schedule is a prediction about recall
after days. The spacing effect is the oldest and most replicated result in this
literature precisely because massed and spaced retrieval are not interchangeable,
and crediting the massed one inflates every interval that follows it.

This is also the standard arrangement wherever student models consume tutoring
data: knowledge-tracing pipelines score the first response to a step and treat
help requests as errors, rather than crediting eventual success after hints and
retries. Ordböj already applies the same logic to hints — [[lapse-handling]]
prices a hinted answer at half interval and −0.05 ease — and attempts belong in
the same category. Both are evidence that the retrieval was not clean.

The corresponding cost is real and worth stating: the learner who fails, gets
corrected, and succeeds twice in the same sitting sees no schedule improvement for
the effort. That is the intended message. The re-queue exists because re-asking a
question is retrieval practice and re-showing an answer is not (Roediger &
Karpicke 2006); it does not exist to let the learner buy the interval back.

If retry-before-reveal is ever built despite being a red line, the rule is
`attempts > 1 → grade 0`, written in the scheduler rather than left to the caller.

## Note on framing: "adopt-narrow" and "reject" are the same build

`product-manager`'s parallel memo
(`docs/product/2026-08-08-response-latency-and-attempts-decision.md`) rules attempt
count **rejected** on the grounds that there is no mechanic to count and building
one would reverse the ratified "retry before reveal: never" line. That reasoning is
correct and the resulting build is identical to mine: no counter, no partial-credit
tier, `hintsUsed` carries the effort signal.

The framings differ in what they leave written down, and `Practice.tsx:205-212`
is the demonstration that the difference is load-bearing. "Rejected" answers the
question as asked and stops; it does not say what happens to the second answer the
re-queue generates, so the code grades it, which is the outcome both memos oppose.
The sentence that has to survive the merge is **the re-queued answer never reaches
`calculateNextReview`**. I also do not want "rejected" to license the inverse
later: if someone proposes crediting the re-queue success as a grade 3 or a
half-interval recovery, "we rejected attempt count" is not the argument that stops
it. The spacing argument above is.

## Why latency stays out of the scheduler

**The theory that supports latency is real, and it is not enough.** ACT-R's memory
model maps declarative activation directly onto retrieval latency, which is why
Pavlik and Anderson's optimal-practice work could treat recall speed as an
observable index of memory strength and report gains in both accuracy and latency
(Pavlik & Anderson, _J. Exp. Psychol. Applied_ 14, 2008). Anyone claiming response
time carries no information about memory is wrong.

**But "faster means stronger means schedule it further out" is not reliably
monotonic, and it inverts in exactly the case that matters here.** Benjamin, Bjork
and Schwartz found retrieval fluency predicting later recall _negatively_ under
conditions where fast retrieval reflects recency and priming rather than durable
storage: participants who answered quickly confidently predicted they would
remember, and remembered less ("The mismeasure of memory", _JEP: General_ 127,
1998). Pyc and Rawson's retrieval effort hypothesis points the same way from the
other side — successful retrievals that are _harder_ produce more learning than
easy ones (_J. Memory and Language_ 60, 2009). Under Ordböj's own lapse policy the
item the learner just failed returns three cards later and will be answered fast
because the answer was on screen a moment ago. A latency bonus would hand its
largest reward to the weakest memory in the collection.

**The noise floor in this app is high even after the P4/P11 cleanup.** Answers are
typed Swedish inflections ranging from `gå` to `förstått`, so duration is partly a
measurement of string length; multiple choice is a single tap and not comparable
to typing at all; hints add unbounded deliberation; and sittings are two-to-ten
minutes on a phone where interruption is normal, so the upper tail is a learner
who looked away rather than a hard verb. Memrise's Speed Review — one of the few
shipped features that times answers — gives 6 seconds by default and 7–8 for
longer phrases, which is an admission in product form that raw latency is not
comparable across items.

**Nobody who could use it does.** Anki's scheduler ignores answer time; FSRS uses
interval lengths and grades only, and its authors' stated position is that
duration does not reliably indicate whether the material is known. Duolingo's
half-life regression, fit on 13 million learning traces, uses `sqrt(1 + right)`,
`sqrt(1 + wrong)`, a bias term and lexeme tags — no latency (Settles & Meeder, ACL
2016; confirmed in their published `experiment.py`). Mnemosyne records
`thinking_time` on every repetition in its log schema and its SM-2-derived
scheduler still does not consult it. SuperMemo does encode hesitation — grade 4 is
literally "correct response after a hesitation" — but through self-report, not a
measured clock, and Ordböj has no self-rating input and, given hints and
`showExamples`, would not get a trustworthy one soon.

The one serious counterexample is Math Garden, whose Elo-based scoring rule
combines accuracy and response time and works (Klinkenberg, Straatemeier & van der
Maas, 2011). It is a different problem: single-digit arithmetic with an explicit
visible time budget, and ability and item-difficulty parameters calibrated
continuously against a large population. Ordböj has one learner, one device, no
backend and no cohort. There is nothing to calibrate a latency threshold against,
which makes any number we picked a guess presented to the learner as a measurement.

## The use latency does have

[[session-shape-and-daily-goal]] derives `dailyGoal = minutesPerDay * 5` and says
plainly that five items per minute "is a planning constant, not a measurement of
this learner", to be replaced by observed median seconds-per-item once logging
exists. This note is that logging, specified: a 100-sample ring buffer, median not
mean because the right tail is walked-away-from cards rather than hard verbs,
samples over 60 s discarded (Anki's deck options cap recorded answer time the same
way, default 60 s), a 30-sample warm-up, and the derived per-item figure clamped to
4–30 s before it feeds the goal — on top of the ±40% clamp
[[session-shape-and-daily-goal]] already applies.

The validity objection that sinks latency as a difficulty signal does not apply
here, and it is worth being explicit about why rather than looking like the
confounds were forgotten. Long answers, one-tap multiple choice, hint deliberation
and feedback reading are all noise if the question is "how strong is this memory" —
but they are the actual minutes leaving the learner's day, so if the question is
"how many items fit in ten minutes" they are part of the quantity being measured,
not error in it. Same numbers, different estimand.

It goes in a new `swedish-verbs-stats` key rather than the SRS store, for one
reason that matters given this project's first constraint: it is not progress. If
the buffer is corrupted, dropped for quota, or reset, the learner loses a slightly
better goal estimate and nothing else. Nothing in `swedish-verbs-srs-progress`
changes and no `version: 3` migration is needed.

## Amendments ratified over the original spec

**Capture window is card render → `onAnswer`, not render → first submission.** This
is a correction, not a compromise. [[session-shape-and-daily-goal]] defines its
planning constant as "roughly 12 seconds per typed conjugation **including
feedback**", so a window ending at submission would have measured something
narrower than the quantity the goal is derived from and produced a systematically
low median — a `dailyGoal` inflated beyond what the learner's minutes actually buy,
which is the specific failure that note exists to prevent. Ending at the **Next
Card** press also drops this note's dependency on P13: it no longer matters whether
the card was committed by button, Enter or auto-submit, because the window closes
on an event that exists in all three paths (`handleNext`,
`PracticeCard.tsx:261-265`).

**A 500 ms floor joins the 60 s ceiling in the discard set.** This is
`product-manager`'s engineering guard and it is a guard, not a judgment about
learners: with the window ending at Next Card, a genuine sub-500 ms sample would
require submitting and dismissing feedback inside half a second, which indicates a
double-fired event rather than a fast learner. It protects the low tail the way
60 s protects the high one.

One consequence to carry into implementation: the longer window spans the feedback
screen, so more samples will straddle an interruption. The discard tripwire below
is calibrated for that.

## Ruling: where a timing figure may appear

`product-manager` asked for this call explicitly, against red line #8 ("adding a
per-card countdown timer in any form"):

**No per-card time is ever shown, before, during or after the card.** The red line
is usually read as prohibiting a countdown, but the mechanism it protects — the
learner trading effortful retrieval for fast recognition — is driven by the learner
knowing that speed is watched, not by which way the clock runs. A retrospective
"1.4 s" in the feedback panel buys the same behaviour change one card later, while
looking harmless. Treat retrospective per-card times as inside red line #8.

**No speed trend, per-item or aggregate.** "Your average time is improving" is a
per-card timer amortised over a week: it tells the learner faster is better, which
is the belief [[2026-08-08-ux-pedagogy-red-lines]] and the retrieval-effort
literature both say is wrong.

**Aggregate elapsed time for a completed sitting or day is permitted, off the
card** — "10 minutes today" on Home or Progress. Same class of information as
`minutesPerDay`, which the learner chose themselves; it reports budget consumed,
not performance, and contains no per-item comparison to chase.

**Settings may show the derived per-item figure once, only as the explanation of
the goal** — "your goal of 50 items is based on about 12 seconds per item". A
derived number that silently changes the goal is worse for a solo learner with no
analytics than one they can see the basis for. Static explanatory figure, not a
scoreboard, and not framed as something to improve.

This is also why latency stays out of the scheduler on presentation grounds alone,
independent of validity: disclosed, it gives the card a stopwatch; undisclosed, the
schedule reacts to something the learner cannot see or reason about.

## Runner-up, and the better place to spend a migration

The runner-up on latency was **record it into a review log now, decide later**. It
lost because a single learner's log cannot be fit to a multi-parameter model
however long it runs, and because the card was mid-redesign — a concern the P4/P11
churn since this note was first written has now demonstrated rather than predicted.

If the goal is a better scheduler, the field to add is still not latency. The
local-day ambiguity flagged in `CLAUDE.md` has since been fixed — `dueAt` is now
`Math.max(now + intervalDays * 86400000, startOfNextLocalDay(now))` (`srs.ts:73`)
with `isDue` comparing against `endOfLocalDay` (`srs.ts:131`) — but `SrsState`
still records no `lastReviewedAt`, so the app cannot tell an on-time review from
one twelve days late; both arrive as `grade: 5` on an item whose stored
`intervalDays` describes the plan rather than what happened. Realized interval is
exactly what FSRS consumes and Ordböj discards it. Adding `lastReviewedAt`, and
keeping the scheduled interval alongside the realized one, is a strictly better use
of one `version: 3` migration than anything in this note. That is a recommendation
to `product-manager` and `srs-engine`, not a decision here.

## Confidence and evidence quality

- **First-attempt grading: high confidence.** The spacing effect is as solid as
  results in this field get, and the argument does not turn on effect sizes — a
  retrieval at three-card delay is simply not an observation about recall at six
  days. Cheap to reverse.
- **Latency out of the scheduler: high confidence for this app, and the general
  claim is narrower than it sounds.** Response time does carry memory signal; the
  claim is that its signal-to-noise on variable-length typed Swedish answered on a
  phone, with no calibration population, does not beat the accuracy signal already
  in hand, and that the sign of the effect is unreliable. The industry convergence
  (Anki, FSRS, Duolingo, Mnemosyne) is strong corroboration but is partly inertia,
  and Math Garden proves the opposite design can work somewhere. Evidence quality:
  good for the fluency-misleads finding, circumstantial for the industry argument.
- **Latency for goal estimation: moderate confidence, low risk.** Nothing about
  memory is inferred — a stopwatch used as a stopwatch. Fully reversible; the store
  is disposable by construction.
- **The presentation ruling: moderate confidence, and the weakest section here.**
  That a retrospective per-card time changes behaviour the way a countdown does is
  a mechanism argument, not a measured result, and I have no study separating the
  two. I would give this up before any other position in this note.

## How we would know this was wrong

- The measured median seconds-per-item settles far from 12 s — under 6 s or over
  20 s. The `minutesPerDay * 5` constant is then wrong for this learner and the
  clamp bounds need revisiting before the derived goal is trusted.
- More than 25% of samples land in the discard bucket. (Raised from 20% because the
  ratified window now spans the feedback screen and will straddle more
  interruptions.) At that rate, sittings are being interrupted routinely, the
  two-minute unit [[session-shape-and-daily-goal]] assumes is not what happens, and
  the sitting cap of 15 is the parameter to change rather than anything here.
- Items answered correctly on every review still lapse at long intervals while the
  learner reports answering them instantly. That is the one pattern arguing a
  fluency bonus is being left on the table — but the first fix is the 2.80 ease
  ceiling (`srs.ts:20`), not latency.
- Learners repeatedly fail an item, clear it on the same-sitting re-queue, and fail
  it again the next day. The re-queue is not producing durable learning; the
  question is the gap size or a second spaced attempt, not whether it should have
  scored.
- A backend, export-based analysis, or multi-learner dataset appears. Every
  calibration argument above changes and this note should be reopened.

## Routed to

`srs-engine` / `frontend-expert` (issue #249) — gate the `recordAnswer` call at
`Practice.tsx:205-212` on `isRequeueAttempt` (`Practice.tsx:312`), the way it is
already gated on `sessionKind === 'free'`. A re-queued answer must not reach
`calculateNextReview` at all. `src/lib/srs.ts` itself needs no change from this
note, which is the point.
`frontend-expert` (issue #248) — timestamp at card render and at `onAnswer`,
maintain the ring buffer in `swedish-verbs-stats`, discard on the three conditions
above, and surface timing only as the ruling permits.
`qa` — `src/test/STRATEGY.md:34` already records that the jsdom environment has no
real focus/blur timing, so the discard-on-hidden rule cannot be tested through
actual visibility events. It needs a pure function over
`(startedAt, answeredAt, wasHiddenDuringWindow)` that the component calls, so the
policy is testable without a browser.
`product-manager` — the `lastReviewedAt` proposal above, as a separate scope
question.
