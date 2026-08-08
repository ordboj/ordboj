# baseInfinitive: drop MUST-resolve, keep format assertions — 2026-08-08

Ticket #317. Owner: `product-manager`. Binding on the partikelverb spec
(`docs/superpowers/specs/2026-08-08-partikelverb-design.md`, Data model and
F6) and on the qa-owned dataset-integrity test
(`src/data/particleVerbData.test.ts`).

## 0. Decision

**`baseInfinitive` stays a required field. VERB_DATA membership stops being a
validity constraint on it.** A particle-verb entry is valid when its
`baseInfinitive` passes three format assertions (section 2). Whether that
string also appears in the 56-row `VERB_DATA` table is a coverage fact, not a
data defect. The F6 membership assertions are deleted and replaced by the
format assertions. Issue #315 already removed the base-verb introduction
gate from the particle queue on main, so a base absent from `VERB_DATA` has
no runtime effect at all: the entry is introduced normally, on its own SRS
schedule (section 3).

**Runner-up: keep MUST-resolve and force every new base into `VERB_DATA`
before its particle verb can merge.** It lost because it inverts the
dependency. The linguist's judgment about a particle verb is not wrong
because the conjugation table is small. `VERB_DATA` holds ~56 of ~1537 CSV
verbs; membership is an accident of which rows were hand-ported. Coupling
`verified: true` to that accident forced #262 to exist as a blocking ticket,
and would force one for every future base outside the table.

## 1. What the code does today

- `src/data/particleVerbData.test.ts:44` — "resolves every verified entry
  base verb in VERB_DATA": fails if any `verified: true` entry has a base
  outside `VERB_DATA`.
- `src/data/particleVerbData.test.ts:52` — the contrapositive: an entry with
  an unresolvable base must be `verified: false`.
- `src/data/particleVerbData.test.ts:294` — embedded-forms drift check: an
  absent base is reported as drift, so it also fails on absence.
- `src/lib/particleQueue.ts:120` (`isBaseRecentlyUsed`, called at line 216) —
  the 7-day interference rule joins particle entries **to each other** on the
  `baseInfinitive` string. It never touches `VERB_DATA`. This is why the
  field stays required.
- Since #318 (PR #324), the feedback reference line renders from `forms`
  embedded on the entry, never from a `VERB_DATA` join. The render path has
  no membership dependency left.

## 2. The format assertions (qa implements, F6)

Delete the two membership tests (`particleVerbData.test.ts:44` and `:52`).
Add one test with these three assertions over every entry in
`PARTICLE_VERB_DATA`, verified or not:

1. **Non-empty.** `entry.baseInfinitive.trim().length > 0`, and the string
   equals its own trim (no padding).
2. **First token of lemma.** Assert that `entry.lemma.split(' ')[0]` equals
   `entry.baseInfinitive`. This holds for every current entry, including the
   reflexives (`höra av {refl}`, `ge {refl} av` — the placeholder is never
   the first token). It pins the field to the lemma it claims to describe, so
   a typo cannot silently detach them.
3. **One base, one string.** Group entries by
   `baseInfinitive.normalize('NFC').toLowerCase()`. Within a group, every raw
   `baseInfinitive` is the identical string. This is what the 7-day
   interference rule needs: `bygga upp` and `bygga ut` must compare equal on
   the exact string, so an NFC/NFD or casing variant would silently disable
   the rule. Also assert `baseInfinitive === baseInfinitive.normalize('NFC')`
   for every entry, so the canonical spelling is NFC.

Other tests in the file:

- **Keep unchanged:** the `unverifiedReason` test (`:61`), the verified-gate
  accessor test (`:68`), and the #262 pin test (`:91`). The pin test asserts
  that the six #262 bases resolve; that is a pinned historical acceptance
  criterion of #262, still true, and `VERB_DATA` is append-only — leave it.
- **Modify:** the drift check (`:294`). When the base is absent from
  `VERB_DATA`, `continue` — skip the entry instead of reporting drift. The
  embedded `forms` are the authoritative, linguist-verified strings (#318);
  the `VERB_DATA` comparison is an opportunistic cross-check that only
  applies where a base row exists.

Acceptance: the suite passes on a dataset that contains a `verified: true`
entry whose base is absent from `VERB_DATA`.

The comment at `src/data/particleVerbData.ts:65` ("MUST resolve in VERB_DATA
for any entry that ships: the introduction gate joins on it...") is now
stale — the introduction gate it describes no longer exists (#315).
`swedish-linguist` owns that file; the lead routes the comment fix to them
once this decision lands.

## 3. Runtime meaning of an absent base (unchanged code, defined semantics)

Issue #315 removed the base-verb introduction gate from the particle queue.
An entry whose base is absent from `VERB_DATA` is introduced normally, on
its own SRS schedule, exactly like any other entry. It renders correctly:
since #318 the feedback reference line comes from the entry's own embedded
`forms`, not from a `VERB_DATA` join, so there is no dependency left for an
absent base to break. `docs/learning/particle-verb-practice.md` line 54
records this: "introduction prerequisite | none — removed by issue #315".

To keep the field meaningful going forward:

- **Authoring rule for `swedish-linguist`:** when a new entry uses a base
  outside `VERB_DATA`, append the base verb to `VERB_DATA` in the same PR
  (the linguist owns both files; append-only keeps the order pin green, and
  post-#53 ids are infinitive-keyed, so appending is safe). If the base
  cannot be verified yet, ship the entry anyway and report the missing base
  to the lead, who files a base-append ticket — the #262 pattern.

## 4. The five re-evaluations (AC4) — already done

The ticket asks swedish-linguist to re-evaluate stänga, sätta, stiga, hälsa,
bygga (held at `verified: false` only for the missing base). #262 (PR #265)
already did this, plus ställa: the six base verbs were appended to
`VERB_DATA`, and all six entries now carry `verified: true`, resolvable
bases, second frames, and embedded forms
(`src/data/particleVerbData.ts:1025-1141`). No linguist action remains on
this ticket. The pin test at `particleVerbData.test.ts:91` keeps that state
enforced by name.

## 5. What this decision does not change

- `baseInfinitive` remains required on every entry.
- The verified gate is untouched: `verified: false` entries never render, and
  every one still states its reason.
- The 7-day same-base rule is untouched.
- `VERB_DATA` stays append-only under the order-pin test; this decision adds
  no pressure to edit it.
- No storage shape changes. No migration. No human approval needed beyond
  this note.
