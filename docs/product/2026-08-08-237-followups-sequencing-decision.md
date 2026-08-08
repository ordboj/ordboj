# #237 follow-ups — sequencing ruling for tracker #255 — 2026-08-08

Owner: `product-manager`. Issue #255 (open umbrella). This note is the one
deliverable of #255. The tracker itself carries no code. It exists to pin the
order in which its seven sub-issues merge. This note ratifies that order,
re-verified against the code and the open PRs as of today. Parent decisions:
`docs/product/2026-08-08-response-latency-and-attempts-decision.md` (scope)
and `docs/learning/2026-08-08-latency-and-attempt-signals.md` (pedagogy).
Neither is reopened here; where this note and those notes touch, they win on
substance and this note wins on order.

## 0. Decision

**#255 stays open until all seven sub-issues are closed. Nothing implements
#255 directly, and no code PR may carry `Closes #255`.** The lead closes it
by hand when the last sub-issue closes.

The wave plan in the umbrella body is **re-ratified with four amendments**,
each forced by something that changed after the umbrella was written:

1. **#250 is done.** Wave 1 has three items left, not four.
2. **The version constraint moves from v3 to v4.** The umbrella reserved the
   next SRS bump ("the only v3 candidate is #252's outcome"). Issue #53 has
   since consumed v3: `STORAGE_VERSION` is 3 today. The constraint survives
   with new numbers — nothing in this tracker bumps the SRS store, and the
   only v3→v4 candidate is the outcome of #252.
3. **#251 loses its temporal gate and gains an invariant** (section 3). Its
   PR #303 may merge before #248.
4. **#253 stays deferred even though PR #304 now exists** (section 4). The
   lead converts PR #304 to draft. The PR is not a draft yet.

## 1. Status, verified against code

| Issue | State  | Evidence today                                                                                                                                                                                                                                         |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #249  | OPEN   | Bug still live. `Practice.tsx:213-215` calls `recordAnswer` for every non-free answer; `isRequeueAttempt` (line 315) is never consulted, and `recordAnswer` itself has no re-queue guard. Serialized behind PR #302, which is a draft (see section 2). |
| #250  | CLOSED | Done.                                                                                                                                                                                                                                                  |
| #254  | OPEN   | No PR.                                                                                                                                                                                                                                                 |
| #252  | OPEN   | No decision note in `docs/product/` yet.                                                                                                                                                                                                               |
| #248  | OPEN   | No PR. Its prerequisites are in flight: PR #174 (`answeredToday`, #26) and PR #201 (session shape, #111).                                                                                                                                              |
| #251  | OPEN   | PR #303 open, in remediation.                                                                                                                                                                                                                          |
| #253  | OPEN   | PR #304 open — ahead of its wave. PR #304 is not a draft yet; the lead converts it (section 4).                                                                                                                                                        |

## 2. Wave 1 — order among the three remaining items

**#249 merges before the other two Wave-1 items.** It is a live correctness
bug in lapse handling: a re-queued answer reaches `calculateNextReview` and
silently undoes the lapse. Fix shape is already ratified in the parent note —
`recordAnswer` rejects re-queue answers itself, and the caller also skips the
call; belt and braces, because the parent note's stated failure mode is a
future caller that trusts the default path.

**Serialization rule for #249:** PR #302 (#222) edits the same re-queue map
in `Practice.tsx`. The two must not be in flight at once. PR #302 is a
DRAFT today: its own body asks for a `frontend-expert` follow-up, a `qa`
fixture pass, and the human's explicit approval for its `localStorage`
shape change. Three outcomes, all covered:

- #302 becomes ready and merges: #249 branches from the merged result.
- #302 closes: #249 proceeds from main immediately.
- #302 stays draft or the human refuses the shape change: #249 does not
  wait. #249 proceeds from main, and #302 rebases onto the merged #249. A
  live grading bug never waits on a parked draft.

**#254** is an independent UI fix. It merges at any point inside Wave 1 with
no ordering constraint.

**#252** is decision-only and runs in parallel. Hard gate, restated with the
new number: **no v3→v4 SRS migration PR opens, for any reason, before the
#252 decision note is ratified.** A migration PR that appears earlier is
rejected in review, not amended. Scope of this gate: it binds PRs that
implement this tracker's sub-issues. PR #302 (#222) predates the gate and
sits outside the tracker, so the gate does not reject it. #302 is reviewed
on its own terms, under the human-approval rule for localStorage shape
changes.

## 3. Wave 2 — #248, and the amended rule for #251

**#248 is unchanged.** Capture and the `dailyGoal` consumer ship in one PR or
neither, after the daily-session store exists (the #174/#201 line of work).
The PR creates the versioned `swedish-verbs-stats` key; `staff-engineer`
reviews the shape. All numbers are already fixed in the parent note — 100
samples, 30-sample warm-up, 4–30 s clamp, ±40% goal clamp, 12 s seed, weekly
recompute — and this note does not reopen any of them.

**#251: the "after #248" ordering is void.** It rested on two legs: the
envelope covering the stats key, and the envelope covering the
daily-session and streak stores. The parent note later excluded the stats
key as disposable, which removes the first leg. The invariant below
removes the second leg, because the PR that creates each new store extends
the envelope itself. What remains is not an ordering but an invariant, and
the invariant is stronger:

> The backup envelope covers every persistent, non-disposable store that
> exists on `main` at the envelope's merge time. Every later PR that creates
> a new persistent key extends the envelope **in that same PR**, with an
> envelope version bump.

Consequences, so nobody has to derive them:

- PR #303 may merge before #248. Today its required coverage is exactly two
  stores: `swedish-verbs-srs-progress` (v3) and `swedish-verbs-settings`
  (v1 envelope).
- Excluded by rule: `swedish-verbs-stats` (disposable by construction) and
  `swedish-verbs-srs-progress-backup-pre-v3` (a one-shot migration artifact
  with no read path — backing up a backup is churn).
- When #174 lands `answeredToday` and when the streak store lands, **those
  PRs** extend the envelope. The envelope PR does not wait for them.

## 4. Wave 3 — #253 stays deferred, PR notwithstanding

PR #304 exists ahead of its wave. It does not merge now. The deferral was
risk-based, not effort-based, so a finished PR does not discharge it: write
batching changes the persistence path of irreplaceable progress, and the
hazard it removes is not present yet — the blob is ~26 KB per answer today
and becomes a problem near ~800 KB, after CSV expansion.

**Gate, stated concretely:** The lead runs `gh pr ready --undo 304`. The PR
then waits for its gate. It merges only after the CSV expansion of
`VERB_DATA` (~1537 verbs) is an accepted, scheduled item on the board. If
the branch has rotted by then, close it and redo the work — the carrying
cost of a draft is near zero, and a stale persistence-path branch is worse
than none.

## 5. Constraint spanning all waves — restated with current numbers

- Nothing in this tracker changes `calculateNextReview` semantics. Its
  output for a given `(state, grade)` is identical before and after every
  sub-issue merges.
- `STORAGE_VERSION` is 3 and stays 3 through this tracker. No sub-issue of
  this tracker bumps the SRS store. One PR outside this tracker does: PR
  #302 (#222) adds a `requeues` ledger to the SRS envelope, so it bumps the
  store to 4. Its body still says 2 -> 3, which issue #53 has already
  consumed; the #302 review corrects that number. Inside this tracker the
  only v3->v4 candidate is the outcome of #252.

## 6. Close condition

The lead closes #255 when #249, #254, #252, #248, #251 and #253 are all
closed (#250 already is). Closing order inside that set is governed by
sections 2–4. No other event closes it.

## 7. Routed to

`staff-engineer` — the #251 coverage invariant (section 3) and the #253
draft-and-gate ruling (section 4).

`srs-engine` + `frontend-expert` — #249 first, serialized behind PR #302
(section 2).

`product-manager` — #252 is the next decision note owed; section 2's gate
blocks a class of PRs until it lands.

`qa` — nothing new; the parent note's section 7 still governs #248's tests.
