# Alternate accepted answers (la/lade, sa/sade) — 2026-08-08

Ticket #123, AC1. Owner: `product-manager`. Binding on PR #198.

## 0. Decision

**Accept alternates, graded as fully correct.** A verb form may have more than
one accepted spelling; typing any of them is right, worth the same as any
other, with no "correct, but the book form is X" downgrade. The policy that
makes this implementable without inventing anything is in section 3: an
ordered accepted-answer list per form with a designated primary, one
normalization rule, auto-submit suppressed while the typed value is a strict
prefix of another accepted answer, hint underscores following the primary, and
distractors excluded from the whole accepted set.

**Runner-up: keep single-answer grading and fix the data instead** — pick one
form per verb and teach only that. It lost because the app would still be
telling the learner something false. `säga` really does have `sa` and `sade`
in SAOL; marking `sade` wrong teaches a fiction, and the project's second
standing rule is that wrong Swedish is worse than missing Swedish. The data is
not the defect here. `src/data/verbData.ts:69-73` already says so in a comment:
"a product gap, not a data error." This decision closes that gap.

## 1. What the code actually does today

- `src/components/PracticeCard.tsx:87` — grading is a single exact comparison:
  `answer.toLowerCase().trim() === correctAnswer.toLowerCase().trim()`.
- `src/components/PracticeCard.tsx:100-108` — an effect auto-submits the moment
  the typed value matches, on every keystroke.
- `src/components/PracticeCard.tsx:124-142` — `getPatternWithHints` renders one
  underscore per character of `correctAnswer`.
- `src/components/PracticeCard.tsx:64-84` — multiple-choice distractors are
  drawn from a hardcoded eight-verb pool and deduped only with
  `opts.includes(conjugatedForm)`.
- `src/lib/srs.ts:44` — grading is binary. `isCorrect = grade === 5`; there is
  no partial credit to award.
- The shipped data stores the **short** forms as primary:
  `verbData.ts:44` `säga → preteritum "sa"`, `verbData.ts:73` `lägga →
preteritum "la"`.

That last point matters and inverts the wrinkle as it was reported to me. The
primary is the _prefix_, and the alternate is the longer word — so today a
learner who knows `lade` can never enter it: the auto-submit at line 100 fires
on `la` two keystrokes in. The prefix rule in section 3 is written to be
direction-agnostic so it survives the linguist reordering any pair.

## 2. Why full credit, and where the pedagogy line is

Whether an alternate deserves _less_ credit than the canonical form is a
grading-scale question, and grading scale belongs to `learning-designer`, not
to me. I am not deciding it, because the current model does not offer the
choice: `srs.ts` takes 5 or 0 and nothing in between. Under a binary model,
"correct" is the only honest label for a correct answer.

If `learning-designer` later wants to distinguish canonical from variant
answers in scheduling, that is a separate decision on the grade scale and it
supersedes this paragraph only. Nothing else in section 3 depends on it.

## 3. The policy

**P1 — Accepted set.** Each (verb, form) pair has an ordered list of accepted
answers. Index 0 is the **primary**: the form the app displays, hints and
pronounces. Any further entries are alternates. `swedish-linguist` owns which
forms are on the list, their order, and the data shape in
`src/data/verbData.ts` and `src/lib/verbs.ts`. Two constraints on that shape:
`ConjugatedVerb[form]` keeps returning the primary as a plain string so every
existing display path is unchanged, and alternates are reached through a
separate accessor (e.g. `getAcceptedAnswers(infinitive, form): string[]`,
returning the primary first and always at least one entry). `PracticeCard`
must never hardcode an alternate.

**P2 — Comparison.** An answer is correct if and only if its normalized value
equals the normalized value of any entry in the accepted set. Normalization is
exactly what line 87 does today and nothing more: `.toLowerCase().trim()`. No
diacritic folding, no internal whitespace collapsing, no edit distance. `ä` is
not `a`, and `läde` is wrong.

**P3 — Grade.** Full credit, `grade = 5`, identical to today. The feedback
banner does not distinguish which accepted form was typed.

**P4 — Auto-submit: the prefix rule.** Suppress auto-submit whenever the
normalized typed value is a **strict prefix of some accepted answer other than
the one it matches**. In that state the learner submits deliberately, with
Enter or the Check Answer button, and is graded by P2. Worked through for
`lägga` preteritum, accepted set `["la", "lade"]`:

- Typing `l` — no match, nothing happens (unchanged).
- Typing `la` — matches an accepted answer, but is a strict prefix of `lade`,
  so **no auto-submit**. The input keeps `la`, no feedback panel appears.
- Typing `lade` — matches, and is a prefix of nothing else, so auto-submits
  and grades correct.
- A learner who meant `la` presses Check Answer and is graded correct.

Rejected alternatives, for the record: removing auto-submit entirely changes
behavior on every card in the deck to fix two of them; debouncing makes
correctness depend on typing speed and cannot be tested deterministically.

**P5 — Hint and blank rendering follow the primary, unchanged.** Underscore
count is the primary's length; `handleHint` keeps indexing into the primary.
Do not vary the blank width by alternate. The known consequence, accepted
knowingly: `lägga` preteritum shows two underscores while `lade` is also
accepted, so a learner typing `lade` overruns the visible blanks. That is
tolerable because the primary is always accepted, so the hint never steers
anyone into a wrong answer — and the alternative, sizing blanks to the longest
form, would leak the existence of a longer word on every such card and would
make the hint reveal indices ambiguous.

**P6 — The feedback panel discloses the alternates.** When a card's accepted
set has more than one entry, the feedback panel shows the primary exactly as
it does now (`PracticeCard.tsx:317`) plus one additional line naming the other
accepted forms. Show it on both correct and incorrect outcomes. This is the
actual pedagogical payoff of the ticket: the learner leaves knowing `la` and
`lade` are a pair, rather than believing one of them is an error. The wording
of that line is `swedish-linguist`'s to approve — `frontend-expert` renders
whatever string the accessor or label helper returns and does not compose
Swedish itself.

**P7 — Multiple choice: exclude the whole accepted set.** In
`generateOptions`, the rejection test changes from "is this candidate already
in `opts`" to "is this candidate already in `opts`, **or** does its normalized
value equal any accepted answer for this card." That is what prevents two
correct buttons. Do not fix this at click time: clicking is still
`handleSubmit(option)` and P2 would correctly grade an alternate as right —
the fix is never offering it. `frontend-expert` should also bound the
`while (opts.length < 4)` loop at line 69, which can already spin forever when
the eight-verb pool cannot yield four distinct forms and gets marginally more
likely under the new test; report it to the lead as its own defect rather than
growing this PR.

**P8 — Letter tiles stay derived from the primary.** `shuffledLetters`
(line 53) keeps using the primary's unique letters. Do not union letters
across alternates: it would add letters the primary does not need and
advertise that a longer form exists. A learner who wants to type an alternate
uses the keyboard; the tile path always spells a fully accepted answer.

**P9 — No storage change.** Alternates live in shipped verb data, not in
progress. SRS keys, `dueAt`, stored grades and both `localStorage` stores are
untouched. No version field, no migration, no human data approval required for
this ticket. (Noted explicitly because content changes usually do trigger the
migration rule — this one does not, because it adds no per-learner state.)

## 4. Review conditions for PR #198

PR #198 merges only if it satisfies P1 through P8. If it changes only the
equality check at line 87, it is incomplete and ships three new defects: the
`la`/`lade` pair stays untypeable (P4), and the MC and disclosure gaps stay
open (P6, P7). Check it against P4, P5 and P7 specifically before approving —
those are the three places where an implementer would otherwise have to invent
policy.

## 5. Acceptance criteria

QA can take these verbatim. They assume `säga` preteritum accepts
`["sa", "sade"]` and `lägga` preteritum accepts `["la", "lade"]`, subject to
`swedish-linguist` confirming both pairs.

1. `säga` preteritum, typing mode: entering `sa` and pressing Check Answer
   grades correct.
2. `säga` preteritum: entering `sade` auto-submits and grades correct.
3. `lägga` preteritum: after typing `la`, no feedback panel is rendered and
   the input still reads `la`.
4. `lägga` preteritum: continuing from `la` to `lade` auto-submits and grades
   correct.
5. Regression: a single-answer card (`tala` preteritum, `talade`) still
   auto-submits the instant the exact answer is typed.
6. `LADE ` — uppercase with a trailing space — grades correct.
7. `läde` grades incorrect.
8. Multiple-choice on a card with alternates never renders two options whose
   normalized values are both in that card's accepted set.
9. The blank for `lägga` preteritum renders exactly two underscore positions,
   and the hint button is disabled after two reveals.
10. The feedback panel for `lägga` preteritum names `lade` as also accepted;
    the feedback panel for `tala` preteritum shows no such line.
11. Only `5` and `0` are ever passed to `onAnswer`; no new grade value appears.

## 6. Out of scope

- **Typo tolerance, edit distance, fuzzy matching.** Different feature,
  different risk, and it would need `learning-designer` to rule on whether a
  near-miss should be scheduled as a success. Not this ticket.
- **Alternates for the full CSV.** Only verbs the linguist has verified get an
  accepted set. Broad content growth stays sequenced behind the verb-id
  migration, which this ticket does not touch and must not front-run.
- **Letting the learner choose which form is primary.** A settings field for
  one learner's spelling preference is not worth a stored, unversioned
  setting.
- **Labelling alternates as regional, formal or dated in the UI**, beyond the
  single disclosure line in P6.

## 7. Cost

| Change                                                             | File                                       | Owner               |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------- |
| Accepted-set data shape and accessor, which pairs, Swedish wording | `src/data/verbData.ts`, `src/lib/verbs.ts` | `swedish-linguist`  |
| P2, P4, P5, P6, P7, P8 in the card                                 | `src/components/PracticeCard.tsx`          | `frontend-expert`   |
| Section 5 criteria as tests                                        | test files                                 | `qa`                |
| Grade differentiation, only if ever wanted                         | —                                          | `learning-designer` |

What could break: any existing test or e2e flow that types a full answer and
expects feedback without pressing a button will now hang on a prefix card, and
the MC option generator's unbounded loop gets a slightly narrower candidate
pool. Both are covered by criteria 3, 5 and 8.
