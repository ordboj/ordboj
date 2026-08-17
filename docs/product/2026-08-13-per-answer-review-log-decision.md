# Per-answer review log for the discrimination card — decision — 2026-08-13

Owner: `product-manager`. Ticket #390. This decision closes Ticket C of
`docs/product/2026-08-12-discrimination-card-readiness-spec.md`. It is a
storage decision, so it does not authorise implementation. The human must
approve the schema first. See section 9.

## 0. Decision

**Write the log to its own versioned localStorage key,
`swedish-verbs-answer-log`, holding `{ version: 1, entries: [...] }`. Cap it
at 500 entries and evict the oldest first. Log particle cloze answers only,
both typed and choice. A separate hook appends the entries. The log never
shares a write with the progress store, and a failed log write never touches
progress. "Reset all progress" deletes the log.**

The record is `{ t, i, m, k, f }` for a typed answer, plus `{ l, p }` for a
choice answer. Every field is read by a falsifier in
`docs/learning/2026-08-12-sentence-completion-distractors.md`. Section 2
justifies each field and names the fields I rejected.

The learner problem behind this: the learner cannot tell a card that teaches
from a card whose lure is secretly correct Swedish. The log is how the team
tells the difference on their behalf, on one phone, with no backend.

Runner-up: **a field inside the version-3 progress envelope.** It lost on
three counts, in section 1. Second runner-up: **fixed-size counters per frame
and per lure instead of an event log.** It lost because the falsifier
thresholds are trailing windows and they are explicitly provisional
("principled in direction and arbitrary in size", per the distractor note).
Counters cannot be re-windowed and cannot be re-read against a corrected
threshold. A bounded event log can.

## 1. Store: a separate key, not the progress envelope

The two stores hold different classes of data, and the difference is the
whole argument.

**Durability class.** `CLAUDE.md` rule 1 says stored progress is
irreplaceable. This log is derived telemetry about a card the learner has
already been graded on. If it disappears, the team loses the ability to
detect a data defect for a few weeks. Nothing the learner earned is lost.
`docs/learning/2026-08-08-latency-and-attempt-signals.md` set the precedent
when it put the latency ring buffer in its own key and recorded "store is
progress? no — safe to drop on quota pressure or corruption". This log is the
same class.

**Write cost.** The progress writer serialises the whole store on every
flush. That is exactly what PR #304 and issue #253 bounded: the per-answer
cost must not grow with the size of the store. A growing entry array inside
`{ version, items }` makes every progress flush carry the log as well, so a
50 KB log is re-serialised and re-written on every answer window for the rest
of the learner's life. A separate key keeps the progress payload the size it
is today.

**Migration and backup blast radius.** A new field in the envelope is a v3 to
v4 bump. `parseImportedProgress` in `src/hooks/useSrsProgress.ts` is
all-or-nothing: one malformed item rejects the whole file. Putting telemetry
inside that payload means a corrupted log can reject a valid progress backup,
which is the one restore path the app has. It also means `exportData` starts
shipping a per-answer history of the learner's practice inside a file they
share to move devices. A separate key keeps `STORAGE_VERSION` at 3, changes
no validator, and keeps the backup file exactly what it is now.

**The honest cost of separating.** The two stores can drift. The log can say
seven answers on a frame whose `repetitions` says three, after an import or a
partial write. That is acceptable because **nothing reads the log to schedule
anything**. It is diagnostic input for a human, never an input to
`calculateNextReview`. Section 6 handles the two drift sources that matter
(reset and import) by clearing the log.

## 2. Record shape

One entry per graded answer on a particle cloze item.

```
{
  t: number,        // epoch ms, when the answer was graded
  i: string,        // item id, e.g. "pv:komma-ihag:cloze"
  m: 'typed' | 'choice',
  k: boolean,       // correct
  f: number,        // example index within the entry (the frame)
  l?: string[],     // choice only: the lure particles presented
  p?: string | null // choice only: the lure tapped, or null when correct
}
```

Field by field, with the falsifier that reads it:

- `t` — every falsifier is a trailing window. Array order alone gives the
  order but not the span. A frame at 50% accuracy over answers from March
  and a frame at 50% over yesterday's sitting need different responses, and
  only the timestamp separates them. It is also how the team knows a defect
  predates a fix.
- `i` — read by all of them. It carries the verb slug and the kind
  (`parseParticleItemId`, `src/lib/itemIds.ts`), so the "same verb's typed
  cloze is above 80%" comparison needs no second field.
- `m` — the pooled-choice-accuracy falsifier, and every falsifier that
  compares choice against typed on the same item.
- `k` — all of them.
- `f` — the per-frame falsifier ("one frame below ~50% after 5 answers"). The
  frame is `repetitions % entry.examples.length` (`selectExample`,
  `src/lib/particleVerbs.ts:145`), so it is derivable in principle. It is
  stored anyway, because deriving it needs the `repetitions` value as it was
  at answer time, which the store has since overwritten. Replaying it would
  make the tripwire depend on the same code the tripwire exists to check.
- `l` and `p` — the per-lure falsifier: "one distractor is chosen on more
  than ~60% of the occasions it appears". `l` is the denominator
  (appearances), `p` is the numerator (choices). Without both, that falsifier
  cannot run at all, which is the point the ticket raised. `p` is `null` on a
  correct choice, so `k` and `p` are consistent by construction for choice
  entries. The redundancy is deliberate: `k` then means the same thing in
  both modalities and a reader never branches on `m` to learn whether the
  answer was right.

Rejected fields, each with the reason:

- **Response latency or any duration.** Ruled out by
  `docs/learning/2026-08-08-latency-and-attempt-signals.md`, and no falsifier
  reads it. Respected here without reopening.
- **Position of the correct option.** The rotation falsifier ("accuracy is
  higher when the correct option sits where it sat last time") looks like it
  needs this. It does not need learner data: the rotation is a pure function
  of stored state, so the question "does the position vary across consecutive
  renders" is a unit test on the option builder. The distractor note already
  asks `qa` for that test. A unit test answers it in milliseconds and before
  release; the log would answer it after weeks of practice. Routed to `qa`
  instead of into the schema.
- **`repetitions`, `intervalDays`, `easeFactor` snapshots.** The
  "choice-graded items lapse on their next typed review" falsifier reads a
  sequence of entries for one item id, which the log already gives.
- **`hintsUsed`.** No falsifier here reads it, and the choice card has no
  hint.
- **A session id.** No falsifier is per-sitting.
- **The rendered sentence, or the target particle.** Both are derivable from
  `i` and `f` against `PARTICLE_VERB_DATA`, which ships with the build.
- **Conjugation answers and particle recall answers.** No falsifier in either
  learning note reads them. Excluding them keeps the entry budget for the
  data the tripwires actually consume. `i` already carries the kind, so
  including recall later is an append with no shape change.

## 3. Retention cap and eviction

**Cap: 500 entries. Eviction: drop from the front when the length exceeds the
cap (first in, first out).**

Sized from the windows, not from taste. The variant fires on one review in
three, so choice entries are about a third of all entries.

- Pooled falsifier: 30 choice answers. That is about 90 entries.
- Per-frame falsifier: 5 choice answers per frame. At the 14 certified frames
  of PR #398 that is 70 choice answers, so about 210 entries — and frames are
  visited unevenly, so a factor of two of headroom is realistic.
- Per-lure falsifier: a 60% share is not meaningful below roughly 10
  appearances of that lure. Two lures per render over 14 frames puts this in
  the same 200 to 250 entry range.

500 covers the largest of the three with headroom and still bounds the size.

**Bytes.** A choice entry with the longest current slug
(`pv:hora-av-sig:cloze`, 20 characters) serialises to about 110 to 120 bytes.
A typed entry is about 75. Worst case, every entry a choice entry, is
500 × 120 ≈ 60 KB plus the envelope. The realistic mix of two typed to one
choice is about 43 KB. Against a 5 MB origin quota that is near 1%, and the
hard bound is what makes the "progress wins" rule in section 5 easy to keep.

**Time span.** At roughly 10 particle cloze answers a day, 500 entries is
about 50 days of history. Every window above is trailing, so 50 days is
ample.

**When to revisit.** The corpus is 14 certified frames now and stays under
100 in the medium term. At about 30 certified frames the per-frame window
needs more than 500 entries to cover every frame. That is the trigger to
raise the cap to 1000 (about 120 KB) or to add per-frame counters beside the
log. It is a follow-up, not v1 scope.

## 4. Versioning

The envelope is `{ version: 1, entries: [] }`. The rules from day one:

- A payload with no `version`, an unparseable payload, or a payload whose
  `entries` is not an array is discarded and replaced with an empty v1 log.
  This is allowed here and is not allowed for progress, for the reason in
  section 1: the log is disposable by construction.
- A payload with a version **newer** than this build is left on disk untouched
  and is not read. The build logs nothing for that session. A downgrade must
  not delete a newer build's diagnostics, and it must not guess at their
  meaning. This mirrors the forward-compatibility guard in `useSrsProgress`,
  with "do not write" instead of a read-only session, because a disposable
  store has no session state to protect.
- New fields are added as optional fields at the same version. A reader must
  tolerate an entry that lacks them.
- A change to the meaning of an existing field bumps the version, and the
  forward migration for a bump is "discard and restart at the new version"
  unless the bump ships a real migration. Discarding is stated as the default
  path here so that a future engineer does not have to invent a policy for a
  store the project has already ruled losable.

## 5. Write path

**A new hook, `useAnswerLog` (`src/hooks/useAnswerLog.ts`), with its pure
logic in `src/lib/answerLog.ts`. Not inside `recordAnswer`.**

Two reasons. First, `recordAnswer(itemId, grade, modality)` does not have
`f`, `l` or `p`, and it should not: those are properties of what was
rendered, not of what was scheduled. Widening the scheduler's entry point to
carry telemetry puts diagnostic data on the one API that must stay narrow.
Second, `useSrsProgress` owns the coalesced writer for the irreplaceable
store. Adding a second key's lifecycle to that hook enlarges the surface of
the one hook the project can least afford to destabilise.

The cost of splitting is that the two calls can drift: an answer recorded and
not logged. That is the correct direction for the failure to run. A missing
log entry costs a diagnostic. A broken `recordAnswer` costs progress.

Mechanics:

- The hook holds the entries in memory and owns its **own**
  `createCoalescedJsonWriter('swedish-verbs-answer-log')` instance, at the
  same 500 ms window. Two writers, two keys, no shared state. `dispose`,
  `pagehide` and `visibilitychange` behaviour comes free from
  `src/lib/storage.ts`.
- `writeSerialized` already swallows a failed write and returns `false`, so a
  quota error cannot throw into a React lifecycle that also drives progress.
- **Quota policy, and it is the load-bearing rule: progress wins, the log
  drops.** On a failed write the hook halves the in-memory buffer (oldest
  half discarded) and retries at the next append. On a second consecutive
  failure it disables logging for the rest of the session and removes the
  key, freeing whatever the log was holding. The log must never be the reason
  a schedule fails to persist.
- Appending is O(1) plus one array shift at the cap. Serialising 500 short
  entries at flush time is not comparable to serialising the progress store,
  and it is bounded by the cap forever.

Call sites are one line each, in `frontend-expert`'s file:
`src/pages/PracticeParticles.tsx:90` already calls
`recordAnswer(card.itemId, grade, 'typed')`. The typed cloze call lands with
this work. The choice call is part of the card ticket, not this one.

## 6. Reset, import and backup

- **Reset all progress deletes the log.** `resetProgress` removes
  `swedish-verbs-answer-log` and clears the in-memory buffer, exactly as it
  already removes the pre-v3 backup key. PR #311 settled the principle: reset
  means reset, and a per-answer history of what the learner practised is
  precisely the leftover that principle is about.
- **A successful import clears the log.** After a restored backup, the log
  describes answers the restored schedule does not contain. A falsifier
  reading a log that disagrees with the store is worse than a falsifier with
  no data, because it produces a confident wrong diagnosis. Clearing is
  cheap; the store is disposable.
- **`exportData` does not include the log,** for the reason in section 1: the
  backup file is the restore path for irreplaceable data and gains nothing
  from telemetry.
- **`downloadProgressBackup` in `src/components/AppErrorBoundary.tsx` does
  not gain the key.** That path is the crash-time rescue of irreplaceable
  data. No change to that file, which `staff-engineer` owns.

## 7. Acceptance criteria

A QA engineer can turn these into tests as written.

1. Appending an entry to a log at the cap of 500 leaves the length at 500,
   drops the oldest entry, and keeps the newest.
2. A choice entry round-trips `l` and `p` through a write and a read, and a
   correct choice stores `p` as `null` and `k` as `true`.
3. A typed entry stores no `l` and no `p`, and a reader tolerates their
   absence.
4. Reading a payload with `version: 2` (newer than the build) leaves the
   stored bytes byte-identical after a session that appends 10 answers.
5. Reading an unparseable payload, or one whose `entries` is not an array,
   yields an empty log, writes a `version: 1` envelope, and throws nothing.
6. A `setItem` that throws (quota simulated) does not throw out of the append
   call, and the progress store still persists its own value in the same
   window.
7. Two consecutive failed writes disable logging for the session and remove
   the key.
8. `resetProgress()` removes `swedish-verbs-answer-log` from localStorage.
9. A successful `importData()` leaves `swedish-verbs-answer-log` absent.
10. `exportData()` output contains no entry from the log, and
    `STORAGE_VERSION` is still 3.
11. `pooledChoiceAccuracy`, `perFrameAccuracy` and `perLureShare` over a
    fixture log return the values the three falsifier thresholds are stated
    in. These are pure functions over an entry array and need no browser.
12. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass,
    output pasted.

## 8. Out of scope, with reasons

- **A UI that shows the falsifier readings.** v1 ships the three pure
  analysis functions and no screen. Reading them is a devtools call against
  `localStorage` on the deployed app, done by the team, not by the learner.
  A diagnostics screen is a 30-minute desktop activity and the app's unit of
  use is two minutes on a phone. Explicit follow-up if hand-reading proves
  too slow.
- **Automatic action on a falsifier firing.** No threshold pulls a frame from
  rotation by itself. Every response in the distractor note is a human
  decision, and two of the three end in a linguist re-certifying Swedish.
- **Logging conjugation answers.** Section 2. No falsifier reads them, and
  the conjugation deck is 228 items today and thousands after the CSV lands,
  which would swamp the cap.
- **Logging particle recall answers.** Section 2. Append later without a
  shape change if a falsifier ever needs them.
- **Any cohort or cross-learner comparison.** No backend, by constraint 3.
  One learner's log is the only population there is, and every threshold in
  the distractor note is written to be read that way.
- **Latency in any form.** Settled elsewhere; see section 2.
- **Export or sync of the log.** It is disposable; a transport for disposable
  data is not worth a file format.

## 9. Approval and ticket split

**Implementation waits for the human's approval of the schema in sections 2
to 4.** `CLAUDE.md` requires the human's approval for a data-shape change to
localStorage. This adds a new key rather than changing an existing one, and
`STORAGE_VERSION` stays 3, so the risk to existing progress is as low as a
storage change gets. The approval is still required, and the specific things
to approve are: the new key, the seven-field record, the 500-entry cap and
the "reset and import both clear it" rule.

Sequencing against the card: per the signed #319 ruling the log lands
**before** the discrimination card variant ships. It does not block the card
from working; it blocks the card from shipping unmonitored.

Tickets, in order:

- **L1 — `srs-engine`.** `src/lib/answerLog.ts` (record type, append with
  cap and eviction, parse with the version guard, serialise, the three
  analysis functions) and `src/hooks/useAnswerLog.ts` (buffer, own coalesced
  writer, quota policy). Also the two-line change in
  `src/hooks/useSrsProgress.ts` so `resetProgress` and a successful
  `importData` remove the key. Both files are `srs-engine`'s.
- **L2 — `qa`.** Criteria 1 to 11 above, plus the position-varies unit test
  that section 2 moved out of the schema. New test files only; no production
  file is touched.
- **L3 — `frontend-expert`, small.** One `logAnswer` call beside the existing
  `recordAnswer` at `src/pages/PracticeParticles.tsx:90`, for typed cloze
  answers. The choice-answer call belongs to the card ticket and is written
  there, not here.

L1 and L2 can run together on separate files. L3 lands after L1.

## 10. Cost

Files added: `src/lib/answerLog.ts`, `src/hooks/useAnswerLog.ts`, and the
matching test files. Files changed: `src/hooks/useSrsProgress.ts` (reset and
import clear the key), `src/pages/PracticeParticles.tsx` (one call).

Data that migrates: none. No existing key changes shape and
`STORAGE_VERSION` stays 3.

What could break: a quota-exhausted browser where a new writer competes with
the progress writer. The hard cap, the shrink-on-failure rule and the
session-disable rule in section 5 exist for that, and criterion 6 tests it.
The second risk is drift between the log and the store after an import, which
section 6 removes by clearing the log. The third is scope creep into a
diagnostics UI, which section 8 closes.

## Approval

- Decision approved: yes — approved by the human in the lead session
- Date: 2026-08-13
- Notes: approved as proposed, no modifications. Implementation may proceed
  on the L1/L2/L3 ticket split in section 7.
