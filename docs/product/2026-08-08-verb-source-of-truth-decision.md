# Verb-table source of truth (CSV vs VERB_DATA) — 2026-08-08

Ticket #21. Written by `staff-engineer`. Binding on `swedish-linguist`,
`devops` and `qa` work under epic #257. Hard-blocked follow-ups are marked;
nothing in this note may be implemented out of the order in section 5.

## 0. Decision

**`src/data/verbData.ts` is the single source of truth for verb data. The
app reads verb data from nowhere else, ever.** The CSV is demoted, not
promoted: `public/data/swedish_verbs.csv` moves to
`docs/verb-data/candidates.csv`, stops shipping in the production bundle,
and becomes a **promotion queue** — a human-reviewed backlog of candidate
verbs, never a data source any code path reads at runtime or at build time.

This rejects option (a) from the ticket ("generate `verbData.ts` from the
CSV at build time"), and takes option (b) at the level that matters — the
app and the bundle have exactly one verb table — while refusing the part of
(b) that destroys value: the file itself is not deleted, because it carries
1,537 CEFR-tagged candidates and 316 human-corrected rows from the #125
audit (PR #158). That is the raw material for all future verb growth under
epic #257, and re-deriving it would cost more than keeping a 68.5K file in
`docs/`.

Ticket #21 recommended option (a). The `swedish-linguist` audit refuted its
premise with measurements, and the recommendation does not survive them.
Section 2 has the numbers.

## 1. What is true today (verified in this worktree)

- `public/data/swedish_verbs.csv`: 1,538 lines — 1 header + 1,537 data
  rows. Copied verbatim into `dist/` by Vite because it lives under
  `public/`. Zero runtime references: no `import`, no `fetch`. It is dead
  payload in every user's download.
- `src/data/verbData.ts`: 51 rows, all A1. This is what learners see.
- The two files have different schemas, and the TS side is **richer**: it
  carries `grupp` ('1'|'2a'|'2b'|'3'|'4'), per-field `alternates`
  (sa/sade, la/lade), and load-bearing per-row review comments ("modal
  verb: no imperativ", "NEEDS HUMAN CHECK — not guessed"). The CSV has no
  column for any of these.
- Audit state of the CSV (`docs/verb-data/swedish_verbs.audit.md`): 316
  rows corrected in PR #158; 13 rows flagged "needs human check" and left
  untouched; ~940 naive-template-shaped rows presumed grupp 1 but **not
  individually verified against a reference**; `imperativ` empty in 1,531
  of 1,537 data rows. The residual error rate is unknown and concentrated
  in B2–C2 rows.
- Non-test code references to the CSV: only
  `scripts/validate-verb-forms.mjs` (charset validator, runs in CI as the
  `validate-verbs` job). Tests in `src/data/verbData.test.ts` also read the
  CSV by path to guard the #158 corrections.
- SRS ids are `String(index + 1)` from `VERB_DATA` array position
  (`src/lib/verbs.ts`). Reordering or editing the existing 51 rows
  reassigns every learner's stored progress. Issue #8 is the open fix.

## 2. Why not option (a): build-time generation from the CSV

1. **The CSV forms are not trustworthy at scale.** The audit measured a
   ~35–37% form error rate before PR #158 (146/405 family-check
   mismatches; 11/30 blind sample). #158 corrected the 316 rows it could
   positively identify, but the audit itself states the naive-template
   error class "is not closed": ~940 rows survive only because no curated
   rule flagged them, and 13 rows are known-uncertain. Generating
   `verbData.ts` from this file ships unreviewed Swedish to learners.
   Project rule #2 — wrong Swedish is worse than missing Swedish — forbids
   that outcome regardless of how convenient the pipeline is.
2. **Generation would be lossy in the wrong direction.** `grupp`,
   `alternates` and the review annotations exist only in `verbData.ts`.
   The CSV cannot express them. A generator would either drop them or need
   the CSV schema rebuilt and every row re-annotated — which is the manual
   linguistic review this option was supposed to avoid.
3. **A build step erases the review boundary.** Today a row reaches a
   learner only by a reviewed edit to `verbData.ts`. With generation, a
   CSV edit anywhere becomes a silent production data change. The gate we
   rely on ("human review before a learner sees a form") stops existing as
   a mechanism and becomes a convention.
4. **`imperativ` is empty in 1,531/1,537 rows.** Generated rows would
   render "(not available)" almost everywhere, which issue #124 exists to
   eliminate, not multiply.

Option (a) becomes reasonable only if the forms are regenerated from a
real reference (SAOL / Svenska.se / Folkets lexikon / a Wiktionary dump)
with license review by the human. That is a possible future — it is epic
#257 work with its own ticket — and if it happens, the reference dump
feeds the **promotion queue**, not the app. The decision in section 0 does
not change under that future; only the queue's quality improves.

## 3. Why not full deletion of the CSV

Deleting the file from the repo discards the only candidate backlog for
verb growth: the CEFR tagging (the only frequency/level ordering we have),
the 316 corrections that consumed a full audit cycle, and the 13-row
"needs human check" worklist. Epic #257 would start from nothing.
Deletion from **`public/`** — which is what actually reaches users — is
part of this ruling; deletion from the repo is not.

## 4. The ruling in detail

- **R1 — single source.** `src/data/verbData.ts` is the only verb data
  source. No code under `src/` may read, import or fetch any CSV verb
  data. Applies to build scripts too: no codegen writes `verbData.ts`.
- **R2 — the CSV moves.** `public/data/swedish_verbs.csv` →
  `docs/verb-data/candidates.csv` (same content, same schema; `git mv` so
  history survives). `public/data/` is then empty and is removed. Line
  numbers in `swedish_verbs.audit.md` keep their meaning; the audit doc
  gets a one-line pointer to the new path.
- **R3 — promotion is manual and batched.** Verbs move from
  `candidates.csv` into `VERB_DATA` only by a `swedish-linguist` PR, at
  most 50 rows per PR so review is real. Per the audit's own
  recommendation: A1/A2/B1 rows are eligible after per-row verification;
  the 13 flagged rows are excluded until a human confirms them; B2–C2 rows
  require a reference check (SAOL/Svenska.se) before promotion. Every
  promoted row either gets a verified `grupp` or omits it (the documented
  "needs review" meaning). `imperativ` is filled from a reference or left
  `""` with a comment per the #124 policy — never guessed. Appending to
  `VERB_DATA` is the only allowed shape of extension; the existing 51 rows
  are never reordered.
- **R4 — hard gate on #8.** No PR that extends `VERB_DATA` merges before
  issue #8 (stable ids + migration) is resolved. This is enforced by CI,
  not by memory: `scripts/validate-verb-forms.mjs` asserts the
  `verbData.ts` row count is **exactly 51** and fails otherwise, with a
  comment naming #8. The PR that resolves #8 removes the assertion in the
  same change. Until then, even a "safe" append is rejected — append-only
  discipline is exactly the kind of convention that erodes, and the cost
  of one bad merge is silent corruption of every user's progress.
- **R5 — drift check in CI.** The `validate-verbs` job (already in
  `ci.yml`, dependency-free plain Node) is extended to enforce the
  decision structurally:
  1. Fail if any `*.csv` exists under `public/` — the bundle can never
     regain a second verb source by accident.
  2. Fail if any file under `src/` (tests excluded) contains a reference
     to `swedish_verbs.csv` or `candidates.csv`.
  3. Fail on duplicate `infinitive` values inside `VERB_DATA` — every
     lookup in `src/lib/verbs.ts` is `find()` by infinitive, so a
     duplicate row silently shadows its twin. Harmless at 51 rows, a real
     hazard at 500.
  4. Keep the existing charset validation on both files at their new
     paths (`docs/verb-data/candidates.csv` stays validated: a corrupt
     queue row becomes a corrupt learner-facing row one promotion later).
  5. Keep the row-count pin from R4 until #8 closes.

## 5. Sequencing and follow-up tickets

Order is mandatory. The lead files these as sub-issues of epic #257 and
routes them; owners per the CLAUDE.md table.

1. **#8 stays the front of the line** (`srs-engine` +
   `swedish-linguist`). Nothing below unblocks table growth until it
   merges — but steps 2–3 do not grow the table and need not wait.
2. **Move + guard** (cross-owner, serialized, one PR reviewed by
   `staff-engineer`): `swedish-linguist` moves the CSV per R2;
   `swedish-linguist` extends `validate-verb-forms.mjs` per R4/R5 (the
   script is theirs); `qa` updates the CSV path in
   `src/data/verbData.test.ts`; `devops` touches `ci.yml` only if the job
   needs a path argument. Result: dead payload gone from `dist/`, drift
   check live, row count pinned.
3. **Resolve the 13 flagged rows** (`swedish-linguist` prepares, human
   confirms) — small, unblocks nothing but shrinks the uncertain set.
4. **After #8 merges:** first promotion batch per R3 (remaining A1 rows
   first, then A2), each batch its own ticket.
5. **Optional, unscheduled:** reference-source regeneration
   (SAOL/Folkets/Wiktionary licensing — needs the human's decision) to
   raise queue quality. Feeds `candidates.csv`, never `verbData.ts`
   directly.

## 6. What would reopen this decision

Only one thing: a licensed, machine-readable reference source whose forms
`swedish-linguist` certifies at a measured error rate consistent with
zero, plus a product need for a verb count (1,000+) at which hand
promotion demonstrably cannot keep up. Both together would justify
revisiting generation — with the generator reading the certified
reference, not this CSV. Short of that, the answer to "can we just import
the CSV now?" is no, and this note is the citation.
