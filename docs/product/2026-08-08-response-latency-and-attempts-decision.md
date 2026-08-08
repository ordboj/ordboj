# Response latency and attempt count — scope decision — 2026-08-08

Owner: `product-manager`. Issue #237 (closed). Decision and phasing, not a
build authorisation.

**Amended 2026-08-08** after adversarial review, and re-verified against the
code as it stands today. The core survived: attempt count closed, latency
capture-only as a throughput metric, and the unfalsifiability argument in
section 4. Four things changed, all recorded inline: the store is a separate
`swedish-verbs-stats` key rather than the daily-session store (section 5); the
buffer and warm-up are 100 and 30 rather than my 50 and 20 (section 7);
Settings may show one derived figure as the goal's explanation (7.1); and the
"shuffled letter tiles" argument in section 3 is deleted because the tiles no
longer exist. Line references throughout were stale by 80-110 lines and have
been re-verified. `learning-designer`'s companion note is
`docs/learning/2026-08-08-latency-and-attempt-signals.md`; it governs pedagogy,
this note governs scope and sequencing.

## 0. Decision

**Split the question, because the two signals are not the same proposal.**

- **Attempt count: do nothing. Permanently, not "later."** The app cannot
  count tries because it does not allow tries — one attempt per presentation,
  by ratified design. The signal it proxies for already has a spec:
  `hintsUsed`, defined in `docs/learning/lapse-handling.md` and already routed
  to two owners. Build that instead of inventing a third effort signal.
- **Response latency: capture-only, as a throughput metric, not a difficulty
  metric, and not in the SRS store.** Whole-card wall time, a bounded
  100-sample rolling window in a new disposable `swedish-verbs-stats` key,
  consumed by `dailyGoal` calibration and nothing else.
- **Latency into scheduling: rejected for the foreseeable future**, and the
  reason is not caution. We cannot ever validate it (section 4). It would ship
  as an unfalsifiable guess dressed as adaptivity.

Neither piece is scheduled before the queue and session work. Latency capture
ships **in the same PR as its consumer or not at all** — issue #248.

**Runner-up: do nothing on both.** It loses narrowly, and only on the latency
half. The `5 items per minute` constant in `session-shape-and-daily-goal.md`
is a guess that sets the daily goal, and the daily goal is the largest
retention lever the app has — a learner who quits because the goal is twice
their real capacity retains nothing. Measuring the learner's actual pace is
cheap (under 1 KB, constant) and needs no inference. If the queue work slips,
this slips with it and nothing is lost.

## 1. What the app does today

Verified against `PracticeCard.tsx` and `useSrsProgress.ts` as of this
amendment. Both files have changed substantially since the first draft.

**1.1 There is no second attempt to count.** `handleSubmit`
(`PracticeCard.tsx:171-186`) sets `showFeedback`, and the entire input area is
gated behind `{!showFeedback && (` (line 324). Once the learner checks an
answer, the input, the special-character row and the hint button are gone; the
only control left is **Next Card**, which calls `onAnswer(isCorrect ? 5 : 0)`
(lines 261-265). One presentation, one attempt, always.

This is not an oversight. `docs/learning/lapse-handling.md` decides it
explicitly — `retry before reveal | never` — with a stated rationale:
"Retry-until-correct converts retrieval into search." Recording attempt count
therefore requires first reversing a ratified pedagogy decision to create
attempts worth counting. `learning-designer` has since restated it as a red
line (P1) in their companion note.

**1.2 Nothing times anything, and nothing handles interruption.** A grep of
`src/**` (tests excluded) for `performance.now`, `Date.now`,
`visibilitychange` and `document.hidden` finds `Date.now()` only in `srs.ts`
(due dates), `VerbDetailsModal.tsx` (overdue check) and two export filenames.
No timing capture, and — load-bearing for section 3 — **no page-visibility
handling anywhere in the app.**

**1.3 The SRS store is versioned and now defends itself.**
`useSrsProgress.ts:20` carries `STORAGE_VERSION = 2` with a forward migration
from the legacy bare map (`parseStoredProgress`, lines 59-74), an all-or-
nothing import validator (`parseImportedProgress`, lines 91-145), and an
`isReadOnly` guard (lines 189-205, enforced at line 219) that refuses to
persist over a store written by a newer build. That last one matters here: it
is the precedent for treating stored progress as something a downgrade must
not silently rewrite, and it is the reason section 5 keeps the new buffer out
of that store entirely.

**1.4 Export still covers the SRS map only.** `exportData`
(`useSrsProgress.ts:270-272`) serialises `{ version, items }` and nothing
else. Approved for widening as issue #251 — see section 9.

## 2. Why attempt count is rejected rather than deferred

Three signals would then exist for the same underlying question — how much
help did this answer need — and only one of them is designed:

| Signal                        | Status                                                                                                  | What it distinguishes                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `hintsUsed`                   | Specified in `lapse-handling.md`, routed, not built                                                     | Unaided recall vs. recall with letters revealed |
| Same-sitting re-queue outcome | Specified in `lapse-handling.md`; the card already carries `willRequeueIfWrong` (`PracticeCard.tsx:48`) | Failed cold vs. corrected within the sitting    |
| Attempt count                 | Proposed in #237                                                                                        | Nothing the other two do not already cover      |

`lapse-handling.md` is blunt about what the missing hint signal costs today:
"A learner can reveal every letter of `visste` and the scheduler records a
perfect recall with an ease bump." `handleHint` (`PracticeCard.tsx:216-228`)
is still uncapped and still unrecorded, so that defect is live on every hinted
card. Attempt count, by contrast, would produce no data at all until the retry
mechanic it depends on is built, and that mechanic is the one the pedagogy doc
rejects.

**The rule that must survive this merge is not "do not count attempts."** It
is: **a re-queued answer never reaches `calculateNextReview`.**
`learning-designer` is right that "rejected" answers #237 as asked and then
stops, leaving an engineer implementing the re-queue to call `recordAnswer` on
the second answer because that is what every other answer does — silently
undoing the lapse via a retrieval at three-card delay. Tracked as issue #249,
and `recordAnswer` should reject re-queue answers itself rather than trusting
the caller.

## 3. Why latency is a throughput metric and not a difficulty metric

As a difficulty signal, latency in this app measures the wrong thing:

- **Answer length dominates.** Targets range from `gå` to `förstått`, so raw
  duration is partly a measurement of string length.
- **The two modes are incomparable.** Multiple choice
  (`PracticeCard.tsx:381-394`) is a single tap against four options; typing is
  not. `practiceMode` is a settings toggle the learner can flip at any time,
  so one item's history can mix both distributions.
- **The cue itself shrinks as an item matures.** At
  `repetitions >= MATURE_REPETITIONS_THRESHOLD` the card drops the sibling
  paradigm forms and shows only the infinitive and the blank
  (`PracticeCard.tsx:30`, `230-236`), so there is less to read on exactly the
  items the learner knows best.
- **Hints stop the clock from meaning anything.** `handleHint` (lines 216-228)
  is uncapped and adds arbitrary deliberation to the same measurement.

_(Deleted in this amendment: the original draft argued that the shuffled
letter-tile keyboard made timing a measurement of visual search. Those tiles
are gone. `PracticeCard.tsx:32-35` now defines a fixed `å ä ö` row, rendered
unchanged on every card at lines 343-353 and never derived from the answer,
per red lines P4/P11. The learner types on their own phone keyboard. The
argument no longer holds and is withdrawn rather than quietly reworded.)_

Every one of the remaining confounds disappears the moment the question
changes from "how hard was this item" to "how many cards fit in the learner's
ten minutes." Mode choice, answer length, cue length and hint deliberation are
not noise in a throughput measurement — they _are_ the throughput. Same
numbers, different estimand. This is what makes the narrow version defensible
and the broad version not.

`session-shape-and-daily-goal.md:99-103` already asked for this quantity and
already specified its use:

> Five items per minute is a planning constant, not a measurement of this
> learner. It should be replaced by their observed median seconds-per-item
> once `answeredToday` logging exists: `dailyGoal = round(minutesPerDay * 60 /
medianSecondsPerItem)`, recomputed weekly, clamped to ±40% of the preset
> value.

So the consumer is committed in an approved decision note, not hypothetical.

**The interruption problem is the one hard engineering constraint.** The unit
of use is two minutes on a phone. With no `visibilitychange` handling (1.2), a
learner who answers the door mid-card contributes a forty-minute sample to a
median that then halves their daily goal. Discarding on tab-hide is not
polish; without it the metric is worse than the constant it replaces.

**3.1 Ratified capture window.** The window is **card render to `onAnswer`** —
it includes reading the feedback and tapping **Next Card**. Both notes agree
on this: `learning-designer` carried the same window into their parameter
table (line 30) by erratum, having initially specified render → first
submission. The rationale is recorded here because the choice changed during
review, and the losing option is the one an implementer would otherwise
assume. Two reasons, the second of which is theirs: feedback reading is real
time leaving the learner's day, so excluding it inflates estimated throughput
and hands the learner a goal they cannot hit — which is their own "actual
minutes leaving the learner's day" argument applied consistently. And a
render-to-`onAnswer` window is immune to whether auto-submit exists, whereas a
first-submission window changes meaning when P13 removes it. Auto-submit is
still live today, rewritten around an accepted-answer set with prefix
suppression (`PracticeCard.tsx:195-214`).

## 4. The measurement problem, answered honestly

We have one learner, no backend, no control group, no analytics. We cannot A/B
test. That is not a temporary gap — a scheduling change's effect on retention
is a small effect needing many subjects and a held-out measure to detect. With
n=1 and no control, any observed change is confounded by motivation, life,
verb difficulty and the weather.

The conclusion is stronger than "defer until we have data": **no amount of
locally collected data will ever justify an adaptive scheduling change here.**
If latency ever enters the scheduler it will be because `learning-designer`
defends a rule from the literature, as they did for the flat ease constants —
not because our capture proved anything.

This is also the honest answer to "capture first, decide the algorithm later,"
which is how #237 framed it. Capture-first is legitimate only when you can
name the decision the data will settle:

| Decision                                            | Can our data settle it?                                               |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| Is `dailyGoal` sized to this learner's real pace?   | **Yes.** Descriptive; n=1 is the whole population, no control needed. |
| Is the 5-items-per-minute constant roughly right?   | **Yes.** Same reason.                                                 |
| Does latency-weighted scheduling improve retention? | **No.** Not now, not after a year of capture.                         |

Capture is authorised for the first two and nothing else. A critic reading
"capture-only" as a polite forever-deferral on the third row is right, and
that is the intended reading.

The draft flagged one claim for routing — that latency is not an FSRS input.
`learning-designer` confirmed and widened it: Anki's scheduler ignores answer
time, FSRS consumes intervals and grades only, Duolingo's half-life regression
(13M traces) uses no latency term, and Mnemosyne records `thinking_time` and
then declines to consult it. The one working counterexample, Math Garden, has
a cohort to calibrate against and we do not. So the "everyone uses latency"
intuition is wrong on the merits.

## 5. Cost, and the risk that is not the one we were asked about

#237 asked about corrupting progress via a bad migration. The real hazard is a
different one, and it exists today.

**Every answer rewrites the entire progress blob.**
`useSrsProgress.ts:218-231` is a `useEffect` on `srsStates` that serialises
the whole items map to `localStorage` on every change — that is, on every card.

| Scenario                       | Items | Blob rewritten per answer |
| ------------------------------ | ----- | ------------------------- |
| Today (~50 verbs × 4 forms)    | ~200  | ~26 KB                    |
| After CSV coverage (~1537 × 4) | ~6148 | ~800 KB                   |

A synchronous 800 KB write per card on a mid-range phone is a latent
performance problem independent of this feature — issue #253.

Now add an unbounded per-answer log. A `{ t, ms }` record is ~30 bytes; at 50
answers a day that is ~550 KB a year, appended to a blob rewritten on every
answer. Two years in, each card write moves ~2 MB against a typical 5 MB
origin quota. And the failure mode is silent — `useSrsProgress.ts:225-229`
catches the quota error and only `console.error`s it, so the app keeps
running, keeps showing progress, and stops persisting. **That** is how
irreplaceable progress gets destroyed here, not via a migration. Issue #250.

**5.1 Where the buffer lives — amended.** The draft put it in the
daily-session store alongside `answeredToday`. That placement lost, to my own
section 9 argument used against me: `answeredToday` and the streak are
_progress_, and the entire safety case for the timing buffer is that it is
**disposable**. Mixing a droppable cache into a store that must survive
defeats both. Ratified placement is a **new, separately versioned
`swedish-verbs-stats` key**, `{ version: 1, ... }`, holding the ring buffer
and nothing that would hurt to lose. Consequences:

- **The SRS store is untouched.** No `version: 3`, no migration, no risk to
  existing `SrsState` records. `src/lib/srs.ts` does not change at all.
- Corruption, quota eviction or a manual clear costs the learner a slightly
  better goal estimate and nothing else.
- Absent or malformed timing data degrades to the 12-second seed, never to an
  error.

**Files that change** (none owned by `product-manager`):

| Owner                        | Change                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `srs-engine`                 | New versioned `swedish-verbs-stats` store; median derivation, clamps, weekly recompute                                                 |
| `frontend-expert`            | Card-render → `onAnswer` timing in `PracticeCard.tsx`, sample handoff in `Practice.tsx`, discard-on-hidden, the single Settings figure |
| `staff-engineer`             | Reviews the new store's shape; owns #250, #251, #253                                                                                   |
| `qa`                         | Section 7, plus the pure-function testability requirement below                                                                        |
| `devops`, `swedish-linguist` | Nothing                                                                                                                                |

## 6. Phasing

**Phase 0 — now.** Nothing from this note is built. The effort signal the
scheduler actually lacks is `hintsUsed`; that work goes first, alongside the
re-queue no-grade rule (#249).

**Phase 1 — issue #248, with the queue and session work, not before.** The
ring buffer and the `medianSecondsPerItem` consumer ship in one PR. Capture
alone never ships: a capture-only PR with no consumer is schema cost for a
promise, and it is precisely what section 4 warns against.

**Phase 2 — not scheduled, gated on a written ruling.** Any use of timing in
`calculateNextReview` requires a `learning-designer` decision note arguing from
the literature. Our own captured data is not evidence for it.

**Interaction with the partikelverb mode.** No conflict.
`2026-08-08-particle-verbs-research.md` sequences that mode third, behind the
queue work and the id migration, so it lands after Phase 1 either way. Its two
item formats — a one-or-two-character cloze answer, and a full-phrase recall —
have throughput profiles nothing like a conjugation card, and it draws on its
own daily budget. If both ship, the buffer must be **per mode**, or fast cloze
items will inflate the conjugation goal. A one-line consequence for that spec,
not a reason to reorder anything.

## 7. Acceptance criteria

Written for `qa` to use verbatim. Amended items marked.

1. **(amended)** No per-card timing figure is rendered anywhere — not during a
   card, not on the feedback screen, not on Progress. No speed trend, per-item
   or aggregate, in any form. **One exception:** Settings may display the
   single derived seconds-per-item figure, once, as the explanation of the
   goal ("your goal of 50 items is based on about 12 seconds per item"),
   static and never framed as something to improve. Grep evidence in the test
   plan. (Red line #8 bans per-card timers "in any form";
   `learning-designer` ruled that retrospective per-card times fall inside it,
   because the behaviour change comes from the learner knowing speed is
   watched, not from the direction the clock runs. Aggregate elapsed time for
   a completed sitting is separately permitted off-card by their ruling, but
   is not part of this feature.)
2. A sample is the elapsed time from card render — after conjugation data
   resolves — to the `onAnswer` call, and therefore includes reading the
   feedback and tapping **Next Card**. All outcomes and both practice modes
   contribute. (See 3.1.)
3. If `document.hidden` became true at any point between card render and
   `onAnswer`, the sample is **discarded**, not clamped.
4. Samples below 500 ms or above 60 000 ms are discarded, not clamped. A
   clamped outlier is a fabricated value in the median.
5. Free-practice answers contribute no samples, consistent with
   `session-shape-and-daily-goal.md` — free practice records nothing.
6. **(amended: 50 → 100)** The buffer holds at most 100 samples, oldest
   evicted first. A test writes 10 000 answers and asserts the serialised
   `swedish-verbs-stats` payload stays under 1 KB and stops growing after the
   100th sample.
7. **(amended)** The buffer lives in a new `swedish-verbs-stats` key carrying
   its own `version: 1`. A test asserts the `swedish-verbs-srs-progress`
   payload is byte-identical with and without this feature, and that
   `STORAGE_VERSION` in `useSrsProgress.ts` is still 2.
8. **Regression guard:** `calculateNextReview` produces identical output for
   the same `(state, grade)` regardless of any timing data in storage. Its
   signature does not change.
9. **(amended: 20 → 30 samples, plus ratified clamps)** With ≥ 30 samples,
   `dailyGoal = round(minutesPerDay * 60 / medianSecondsPerItem)`, where the
   median is of the buffer (not the mean), the per-item figure is clamped to
   4-30 s before use, and the resulting goal is clamped to ±40% of the preset.
   With < 30 samples, or a missing or corrupt store, the seed is 12 s — which
   reproduces today's `minutesPerDay * 5` exactly — with no error and no toast.
10. A goal the learner has manually edited is never overwritten by the derived
    value (`session-shape-and-daily-goal.md`: editing detaches it from the
    preset).
11. **(new)** The derived goal is recomputed **weekly**, not per answer and not
    per session, per `session-shape-and-daily-goal.md`. A test asserts the goal
    is stable across a week of varied samples and moves only at the recompute
    boundary.
12. **(new)** The discard policy is implemented as a pure function over
    `(startedAt, submittedAt, wasHiddenDuringCard)` that the component calls,
    so it is testable without a browser. `src/test/STRATEGY.md:34` records that
    jsdom has no real focus/blur timing, so the rule cannot be tested through
    actual visibility events.
13. Loading a store written by the previous build succeeds and yields the
    seed-based goal. A `swedish-verbs-stats` key written by a newer build is
    ignored or discarded rather than rewritten — it is disposable, so unlike
    the SRS store it needs no read-only session.
14. No network request of any kind is added. Grep evidence.

## 8. Explicitly out of scope

- **Attempt count, and any retry-before-reveal mechanic** (section 2).
- **Latency as an input to ease, interval, grade, item ordering or lapse
  handling** (section 4).
- **Any per-answer log with unbounded growth** (section 5), including a full
  review history.
- **Any speed figure beyond the single Settings explanation in 7.1** — no
  per-card times, no trends, no "you're getting faster."
- **Per-item latency baselines** ("this item is slower than usual for you").
  Needs per-item history, which is the unbounded log above.

## 9. Spun off, and the human's ruling

Three defects and one scope question found while scoping this, none belonging
in #248's PR:

- **#250 — silent persistence failure.** `useSrsProgress.ts:225-229` swallows
  quota errors to the console; the learner is never told progress stopped
  saving. `staff-engineer`.
- **#253 — whole-blob rewrite per answer.** Section 5's table. `staff-engineer`.
- **#251 — whole-app export envelope. Approved by the human, 2026-08-08.** The
  draft asked whether the timing buffer belongs in the backup file and
  recommended widening the export instead, because `exportData`
  (`useSrsProgress.ts:270-272`) covers the SRS map only and the same gap
  silently drops `answeredToday` and the streak — which the learner would
  notice. Approved as recommended. The timing buffer itself is _excluded_ from
  the envelope: it is disposable by construction, and a restored backup simply
  falls back to the 12-second seed for 30 cards.
- **#252 — `lastReviewedAt` scoping.** Assigned to `product-manager`,
  decision-only, awaiting dispatch. From `learning-designer`'s runner-up: the
  scheduler stores `dueAt` but no record of when a review actually happened,
  so it cannot tell an on-time review from one twelve days late — both arrive
  as `grade: 5` against a stored `intervalDays` that describes the plan rather
  than what occurred. Realized interval is what FSRS actually consumes, and
  the app throws it away. Their claim is that this is a strictly better use of
  one `version: 3` migration than anything in this note, and on its face I
  agree; it is scoped separately because it touches the SRS store that this
  note deliberately leaves alone.

## 10. Routed to

`learning-designer` — companion note
`docs/learning/2026-08-08-latency-and-attempt-signals.md`; governs pedagogy
wherever the two notes touch. The two are consistent as of this amendment,
including the capture window (3.1).

`srs-engine` — the `swedish-verbs-stats` store, ring buffer, median derivation
and clamps; the re-queue no-grade rule (#249). `src/lib/srs.ts` is explicitly
not touched by this note.

`frontend-expert` — card-render-to-`onAnswer` timing, discard-on-hidden, the
single Settings figure, and the guarantee that nothing else is displayed.

`staff-engineer` — store shape review; #250, #251, #253.

`qa` — section 7, and the pure-function requirement in 7.12.
