# Phrase-bound base verbs, and how many particle entries one base may carry

**Questions (ORD-72 follow-ups):** (1) The new `bry` row conjugates a verb
that modern Swedish uses almost only as _bry sig (om)_. Should the app ask a
learner to conjugate bare `bry` on the standard four-form card, and what data
marking does the answer imply? (2) `particleVerbData.ts` now carries 5 entries
on `plocka` and 18 on `ta`. Does a per-base entry ceiling need to exist, and
if so what happens to entries beyond it?

## Decision 1 — keep the paradigm, kill the bare imperativ, gate the rest on a frame cue

**Add `phraseBound?: 'reflexive' | 'particle'` to `VerbData` and set
`phraseBound: 'reflexive'` on `bry`.** A `phraseBound` verb generates **no
imperativ item, ever** — its `imperativ` is stored `""`, legal for the same
reason `noNaturalImperativ` makes a modal's empty imperativ legal rather than
a data bug (`verbData.ts:39-45`). Its **presens, preteritum and supinum items
stay in the conjugation deck**, because the app teaches non-present forms
nowhere else, but they are **held out of the pool until the card renders the
frame** alongside the bare answer. Stored forms and the accepted-answer set
stay bare — no literal `sig` — because a stored `bryr sig` teaches _\*jag bryr
sig_. The runner-up, excluding `bry` from standalone conjugation queues
outright, lost on coverage: it is the option that deletes _brydde_ from the
app entirely.

| Parameter                              | Value                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| new field                              | `phraseBound?: 'reflexive' \| 'particle'` on `VerbData`                                              |
| rows marked today                      | `bry` (reflexive); `slappna`, `piffa`, `tråka` (particle) — 4 rows                                   |
| rows deliberately **not** marked       | `vika`, `bädda` (ordinary bare uses, per the linguist's own ORD-72 comment, `verbData.ts:1092-1098`) |
| `te sig`                               | out of scope — different storage convention, see below                                               |
| imperativ items suppressed             | 4 (one per marked row)                                                                               |
| conjugation items held pending the cue | 12 (3 forms × 4 rows)                                                                                |
| conjugation items removed permanently  | 0                                                                                                    |
| localStorage migration                 | **none** — no stored field carries a per-verb flag; suppressed ids simply stop being served          |
| storage version bump                   | **none** — `STORAGE_VERSION` stays 3                                                                 |
| gate to release the 12 held items      | `PracticeCard` renders a frame cue for `phraseBound` verbs                                           |

### What the app does today

`bry` ships as an ordinary row:

```ts
{ cefr: "A2", infinitive: "bry", imperativ: "bry", presens: "bryr", preteritum: "brydde", supinum: "brytt", grupp: "3", note: "bry is used almost only reflexively, as bry sig (om något). Recognition only: the reflexive pronoun is not part of the stored forms." }
```

`createConjugationProvider.listAvailableItems` (`srsProviders.ts:65-94`) emits
one item per verb per entry in `SCHEDULED_FORMS`
(`presens, preteritum, supinum, imperativ`), skipping only forms that resolve
to `'(not available)'`. `bry` therefore contributes **four items**, including
an imperativ card that renders `Command form of "bry"`
(`verbs.ts:193-201`) and accepts `bry`.

**The note renders nowhere.** `VerbData.note` is declared at `verbData.ts:52`
with a contract ("may be shown after an answer is graded, never during
retrieval"), and no production code reads it. Grepping `src/**` outside tests
finds no consumer; the only note-shaped field any component path reaches is
`alternatesNote`, via `getAlternatesDisclosure` (`verbs.ts:126-129`). So the
prose that says "recognition only, the pronoun is not part of the stored
forms" is a comment to us, not a message to the learner. Any decision that
leans on the note reaching a learner is leaning on something that does not
exist.

### Why not just drill it

The forms are correct Swedish and the card asserts nothing false, so this is
not the "wrong Swedish is worse than missing Swedish" red line. It is a
usefulness question with one exception, and the exception is sharp:

**The imperativ is the one card that produces bad Swedish.** What is attested
is _bry dig inte om det_ — that is `bry dig`, not `bry`. Bare `Bry!` is not an
utterance. A card whose whole prompt is "command form of _bry_" and whose
answer is `bry` trains a production the learner cannot use. Modals already
have the machinery for exactly this shape of fact: a form the verb does not
have in usable Swedish is stored empty and flagged, so the item is never
generated. Reuse it.

**The other three forms are worth keeping, and this is the load-bearing
argument.** _bry sig om_ is A2 in the linguist's band
(`particleVerbData.ts` ORD-72 block; `verbData.ts:1122-1130`), so the learner
needs _jag bryr mig_ and _jag brydde mig inte_ early. The phrase is
deliberately **not** a particle-verb entry — its `om` is a preposition, not a
particle (`particleVerbData.ts:33-34`, `4456-4457`) — so particle mode will
never teach it. And even for the three particle-bound siblings that _do_ have
entries (`slappna av`, `piffa upp`, `tråka ut`), every particle frame is
presens, enforced by the dataset test (`particleVerbData.test.ts:201`;
`particle-verb-practice.md:182`). **The conjugation deck is the only place
this app teaches a preteritum or supinum of a phrase-bound verb.** Excluding
these rows from it does not move the teaching somewhere better; it deletes it.

There is also a transfer payoff: `bry/bryr/brydde/brytt` is the vowel-final
grupp 3 pattern already shipped as `bo`, `tro`, `nå`, `klä`. Drilling it
strengthens a class, not a singleton.

### Why the forms stay bare, and why `te sig` is not the precedent

`VERB_DATA` contains exactly one reflexive lemma today, and it stores the
pronoun inside every form:

```ts
{ cefr: "C1", infinitive: "te sig", imperativ: "", presens: "ter sig", preteritum: "tedde sig", supinum: "tett sig", grupp: "3" }  // verbData.ts:87
```

Copying that convention onto `bry` would be the wrong call, and the particle
dataset already worked out why: a literal `sig` in a citation form is only
correct in the third person, so a learner who memorises the string says
_\*jag hör av sig_. That dataset therefore stores `{refl}` and renders the
pronoun per person through `renderReflexive` / `renderLemma`
(`particleVerbs.ts:7-46`), and a test forbids a literal `sig` in a reflexive
lemma (`particleVerbData.test.ts:244-251`).

`te sig` survives its own convention only because it takes non-human,
abstract subjects (_det ter sig underligt_) — which is exactly why its
imperativ is empty and flagged. `bry sig` has the opposite profile: first and
second person are its normal habitat (_bryr du dig?_, _jag bryr mig inte_).
Storing `bryr sig` as the answer to a presens card would teach the one
pronoun the learner least needs and most often gets wrong. So: bare forms,
frame in the presentation layer.

### The frame cue, specified

The 12 held items are released when `PracticeCard` can show, for a
`phraseBound` verb:

- **during retrieval:** the frame with the pronoun slot visible and no answer
  in it — `bry ___ om` for `'reflexive'`, `slappna av` / `piffa upp` /
  `tråka ut` for `'particle'`. The blank the learner fills is still the bare
  conjugated form; the frame is context, not part of the answer string.
- **after grading:** one first-person example sentence, so the pronoun the
  learner will actually use is the one they see (_jag brydde mig inte om
  det_).

The person-rendering already exists and should be reused rather than
reinvented: `renderReflexive('firstSingular')` returns `mig`
(`particleVerbs.ts:21-36`). The frame string and the example sentence are
`swedish-linguist`'s to author, one per marked row; the app composes no
Swedish of its own.

### How many other rows are like this

Grepping every `note` in `verbData.ts`, `bry` is the **only** row whose note
mentions reflexivity, and the only `VERB_DATA` infinitive containing `sig`
besides `te sig`. But reflexivity is the narrow case of a wider class shipped
in the same ORD-72 batch, and the batch comment names it itself: "the bare
verb is barely used outside its phrase" (`verbData.ts:1091-1092`).

| Row       | Phrase it lives in  | Bare imperativ today | Marking       |
| --------- | ------------------- | -------------------- | ------------- |
| `bry`     | _bry sig om_        | `bry`                | `'reflexive'` |
| `slappna` | _slappna av_        | `slappna`            | `'particle'`  |
| `piffa`   | _piffa upp_         | `piffa`              | `'particle'`  |
| `tråka`   | _tråka ut_          | `tråka`              | `'particle'`  |
| `vika`    | (ordinary bare use) | `vik`                | none          |
| `bädda`   | (ordinary bare use) | `bädda`              | none          |
| `te sig`  | (stores `sig`)      | `""` already         | out of scope  |

One field with two values, not two fields: the consequence is identical for
both values (no imperativ item, frame cue required), only the frame differs.
`vika` and `bädda` are excluded on the linguist's own evidence — _vika ett
papper_ and _bädda sängen_ are ordinary — and marking them would be a
pedagogy claim overriding a linguistic one, which is not my lane.

`te sig` stays untouched. Restating it in the `{refl}` convention is a real
inconsistency and a real piece of work, but it is a linguist-owned storage
change to a C1 row with an open `NEEDS HUMAN CHECK`, and folding it into this
decision would hold up four A2/B1/C1 rows behind it.

### needs-human

- **Is the positive imperative _bry dig om det_ attested at all, or only the
  negated _bry dig inte om det_?** This decides whether `bry`'s imperativ is
  empty because the verb is phrase-bound (my ruling) or empty because the
  form is unattested (the `anse` / `te sig` treatment). The item is suppressed
  either way, so implementation does not wait on it, but the comment on the
  row should say the true reason. `swedish-linguist` call.
- **Is _bry sig om_ ever getting a home outside the conjugation deck?** My
  decision to keep three items rests on the conjugation deck being the only
  place this phrase can be taught. If the human wants a
  preposition-verb dataset later, revisit — with a home elsewhere, plain
  exclusion becomes the cheaper answer.

## Decision 2 — no ceiling; fix the spacing rule instead

**There is no cap on how many particle entries a base verb may carry.**
Frequency and frameability decide what ships, exactly as they do now. What
scales with base density is not a limit but an obligation and a rate:

1. **Authoring obligation.** Once a base reaches **4 shipped entries**, every
   further entry on that base must be checked frame-by-frame against **all**
   shipped siblings on the same base, and ships only if each of its three
   frames admits exactly one sibling particle. Sibling checks that fail get
   recorded as prose at the entry site.
2. **Introduction rate, made exact.** At most one entry per base may be
   introduced per **7 calendar days**, measured from the sibling's **first
   exposure**, not from its current mastery.
3. **Within a sitting.** No two cards sharing a `baseInfinitive` may be
   adjacent. Reorder to satisfy it; **never drop a due review** to satisfy it.

Entries beyond the density threshold are therefore **just spaced** — never
withheld, never mastery-chained. The runner-up, a mastery gate (entry _n+1_
blocked until entries 1…_n_ are mature), lost badly: on `ta` it is an
18-link chain that any lapse resets, and it makes the highest-frequency verbs
the slowest to cover, which is precisely backwards.

| Parameter                               | Value                                                              |
| --------------------------------------- | ------------------------------------------------------------------ |
| max entries per base in the dataset     | **unbounded**                                                      |
| base density triggering sibling check   | **4** shipped entries                                              |
| frames per entry that must discriminate | **3 of 3**                                                         |
| max new entries per base per window     | **1**                                                              |
| window                                  | **7 calendar days from first exposure**                            |
| same-base cards adjacent in a sitting   | **0** (reorder only)                                               |
| same-base due reviews dropped           | **0** — never                                                      |
| `MAX_NEW_PER_PARTICLE_PER_SITTING`      | unchanged at **2** (`particleQueue.ts:34`)                         |
| storage                                 | one new optional field, `firstSeenAt` — v3→v4, `srs-engine` scopes |

### The actual counts

274 verified entries (every entry in the file is `verified: true`) across
**122 distinct bases**. Bases with 3 or more:

| Base     | Entries | Base     | Entries |
| -------- | ------- | -------- | ------- |
| `ta`     | 18      | `göra`   | 4       |
| `gå`     | 17      | `hänga`  | 4       |
| `komma`  | 14      | `kasta`  | 4       |
| `sätta`  | 9       | `köra`   | 4       |
| `hålla`  | 8       | `bli`    | 3       |
| `lägga`  | 8       | `dra`    | 3       |
| `slå`    | 8       | `flytta` | 3       |
| `se`     | 5       | `ha`     | 3       |
| `ge`     | 5       | `höra`   | 3       |
| `ställa` | 5       | `klä`    | 3       |
| `plocka` | 5       | `skicka` | 3       |
| `stiga`  | 3       | `stå`    | 3       |

Tail: 31 bases with 2 entries, 67 with 1. Two corrections to the numbers in
the brief: `plocka` is at **5**, not 4 — `ihop`, `undan`, `upp`, `fram`,
`bort` — and `lägga` is at **8**, not the "8 mentioned in past work" being
the outlier it sounded like. `ta` at 18 and `gå` at 17 are the real edge of
the distribution.

### The rule that exists today, and where it is wrong

`particle-verb-practice.md:174-178` states it: "never introduce two particle
verbs sharing a base verb within a week … semantic-set interference (Tinkham
1993; Waring 1997), made worse by the shared stem". The implementation is
`isBaseRecentlyUsed` (`particleQueue.ts:206-217`), which blocks a base while
any sibling cloze sits at `repetitions < RECALL_UNLOCK_REPETITIONS` (i.e.
`< 2`), plus a same-sitting block at `particleQueue.ts:315`. The file is
honest about the approximation:

> The known inaccuracy is that a lapse resets repetitions and re-blocks the
> base; that errs towards spacing things further apart, never towards
> introducing an interfering pair, so it fails in the safe direction.

That reasoning was right when a base had two or three entries. It stops being
right at 18. The rule now measures **current mastery** where it means
**recency of first exposure**, and every met sibling is a permanent lottery
ticket for blocking the base.

Rough size, with assumptions stated because we have no telemetry: take a
mature review interval around 60 days and a mature lapse rate around 12%
(the band Anki's community reports for well-tuned decks; we have measured
nothing). A lapse parks an item at `repetitions < 2` for the 1-day and then
6-day intervals, about 7 days. Each met sibling therefore blocks its base
roughly 7 ÷ (60/0.12) ≈ **1.4% of the time**. With 10 met siblings on a base
that is ~13% of days blocked; with 18, ~22%. Not starvation, and not an
emergency — but a drag that grows with base size, applies hardest to the most
frequent verbs in the language, and buys no pedagogical benefit at all, since
a lapse on `ta fram` says nothing about whether the learner is ready to meet
`ta itu med`.

**Fix:** store the first exposure. One optional `firstSeenAt?: number` on the
particle cloze state, written once when the item is created and never
rewritten; `isBaseRecentlyUsed` becomes "any sibling with
`now - firstSeenAt < 7 days`". Exact, no false blocks, and it also stops
over-blocking in the other direction (a sibling introduced 3 months ago and
still at `repetitions 1` blocks forever today).

`srs-engine` owns whether that is worth a v3→v4 bump on its own or should
ride the next one. If it rides, the zero-storage interim is
`repetitions < 2 && easeFactor >= INITIAL_EASE_FACTOR`: while `repetitions <
2`, a never-lapsed item has ease ≥ 2.50 (2.50 fresh, 2.55 after one typed
correct, unchanged after a choice-correct) and a lapsed one has ease ≤ 2.35,
because a lapse costs 0.20 and a correct returns 0.05 — recovering to 2.50
needs four corrects, which would already have carried `repetitions` past 2
(`srs.ts:34-37`, `91-116`). The one case it gets wrong is an item failed on
its very first cloze, which reads as "lapsed" and stops blocking exactly
where blocking is most warranted. Named, not hidden.

### Why a ceiling is the wrong instrument

The interference result the rule rests on — Tinkham 1993, Waring 1997, and
Nation 2000's "lexical sets: dangers and guidelines" — is about presenting
semantically or formally related items **together, at first encounter**.
None of it measures what happens when a base accumulates members across
months of spaced exposure. Reading a ceiling out of it is an inference beyond
the data, and I would rather say that plainly than dress it as a finding.

Pointing the other way, once items are individually established, contrasting
related ones is the thing that builds discrimination rather than the thing
that damages it (Kornell & Bjork 2008; Birnbaum, Kornell, Bjork & Bjork 2013;
Rohrer 2012 on interleaving). Eight `lägga` particles the learner can tell
apart is a better outcome than four they never had to distinguish — and this
project has already committed to that direction with the discrimination
exercise (`docs/learning/2026-08-08-discrimination-exercise.md`), which
_needs_ dense bases to have anything to contrast. A per-base ceiling would
starve a feature we chose to build.

The real cost of density is elsewhere, and Wave C already paid it correctly.
`plocka undan` was removed in remediation round 1 because "every natural
transitive frame also admits `bort` or `upp`", and re-added under ORD-72 on
object-less frames where the competitors are ungrammatical rather than merely
unintended — with a round-2 review that cross-checked `ihop` against the
shipped `pv:plocka-ihop` and recorded the result as prose
(`particleVerbData.ts:4818-4837`). That is not a count problem. That is a
frame-authoring problem, it was solved by frame authoring, and the fifth
`plocka` entry is fine. What grows with density is the **linguist's checking
cost**, roughly linearly in siblings — which is why the obligation above is
written as a checking rule with a numeric trigger rather than as a limit.

Breadth-versus-depth is handled already and needs no new rule: the
introduction comparator sorts CEFR band first and nothing below can move an
entry across a band boundary (`particleQueue.ts:171-183`), and rarer
siblings on a dense base carry higher bands, so they naturally queue behind
first entries on new bases.

### The cost this accepts, stated plainly

At one introduction per base per 7 days, `ta` needs **at least 18 weeks** of
continuous practice to be fully introduced, `gå` 17, `komma` 14. That is the
intended price of the interference rule, not a defect, and nobody should
"fix" it in a later wave by relaxing the window. If a future wave wants those
entries sooner, the argument it has to win is against Tinkham and Waring, not
against this paragraph.

### needs-human

**Is there a deadline?** Everything above optimises for durable retention with
no fixed date. If the human is studying toward an SFI or Sfi/SAS test with a
deadline, the 18-week drip on `ta` is the wrong trade and the window should
drop to 3-4 days with the interference cost accepted knowingly. I am not
guessing at that; it is a one-sentence answer from the human and it changes
one constant.

## What implementers change

**`swedish-linguist`** — `src/data/verbData.ts`: add the `phraseBound` field
to the `VerbData` interface with a comment in the `noNaturalImperativ` style;
set it on `bry`, `slappna`, `piffa`, `tråka`; set `imperativ: ""` on those
four rows with the reason on each row; author one frame string and one
first-person example sentence per marked row. `bry`'s existing `note` stays
as prose but stops being the mechanism.

**`frontend-expert`** — `src/components/PracticeCard.tsx`: render the frame
cue during retrieval and the first-person example after grading for a
`phraseBound` verb. Until this lands, the 12 items stay out of the pool. Reuse
`renderReflexive` from `src/lib/particleVerbs.ts`; compose no Swedish.

**`srs-engine`** — `src/lib/particleQueue.ts`: replace the mastery proxy in
`isBaseRecentlyUsed` with a 7-day first-exposure window (`firstSeenAt`, v3→v4)
or ship the ease-based interim above with its edge case commented; add the
no-adjacent-same-base reordering to the review ordering in
`buildParticleSitting`, reordering only. `MAX_NEW_PER_PARTICLE_PER_SITTING`
and `RECALL_UNLOCK_REPETITIONS` do not move.

**`staff-engineer`** — reviews the `firstSeenAt` storage bump if `srs-engine`
takes that path.

**`qa`** — a pin that no `phraseBound` verb yields an imperativ item; a pin
that no shipped `VerbData` form contains a literal `sig` except the `te sig`
row; a queue test that a base with a lapsed mature sibling is still
introducible; a queue test that no two same-base cards are adjacent and that
the sitting's due-review count is unchanged by the reordering.

**`product-manager`** — the two `needs-human` questions above are inputs to
scope, not to me.

## How we would know this was wrong

- A learner produces `Bry!` or `Slappna!` as a command anyway — the imperativ
  suppression was necessary but the frame cue is not landing, and the fix is
  the cue's wording, not the flag.
- The frame cue turns out to make the presens card answerable without
  knowing the verb (the frame gives the answer away). Then the cue belongs on
  the feedback screen only, and the retrieval-side cue is cut.
- A dense base (`ta`, `gå`) produces repeated learner complaints that two
  cards feel identical. That falsifies "no ceiling, better frames": the next
  move is a stricter frame contract for bases above 8, still not a count cap.
- The 7-day window turns out to under-space rather than over-space — two
  siblings introduced 8 days apart still interfere measurably. Move the
  window, not the ceiling.
- `firstSeenAt` lands and base blocking barely changes, meaning the 12%/60-day
  assumption was wrong and the starvation was never real. The rule is still
  more correct; the urgency was overstated, and that would be my error.

## Where the evidence is thin

The semantic-set interference results (Tinkham, Waring, Nation) are about
simultaneous first presentation of related items to classroom and lab
learners, mostly with English materials. Applying them to "how dense may a
base be in a corpus a learner meets over months" is an inference, and the
"no ceiling" call is that inference plus the interleaving literature pointing
the other way — not a measured result. The 4-entry trigger for the sibling
check and the 3-of-3 frame requirement are judgment calls sized to the
current distribution (they bind on 24 of 122 bases); they are cheap to move.
The blocking arithmetic in Decision 2 rests on a review interval and lapse
rate this app has never measured. For Decision 1, I have no evidence at all
on the specific question of whether drilling a bare bound stem creates a
durable belief that it is usable bare; the argument is from the formulaic-
sequence and idiom-principle literature (Sinclair 1991; Nattinger & DeCarrico
1992; Wray 2002) that the usable unit is the phrase, which is a claim about
what to teach, not a measurement of what a bare card damages.

## Sources

`src/data/verbData.ts` (`bry` row 1131, the ORD-72 batch comment 1079-1132,
`te sig` 87, the `VerbData` contract 23-61); `src/lib/verbs.ts` (145, 193-201,
126-129); `src/lib/srsProviders.ts:9, 65-94`; `src/lib/srs.ts:34-37, 91-116`;
`src/lib/particleVerbs.ts:7-46, 51-63`; `src/lib/particleQueue.ts:23, 34,
171-183, 206-217, 315`; `src/data/particleVerbData.ts:33-34, 44-46, 107-110,
4455-4472, 4818-4837`; `src/data/particleVerbData.test.ts:201, 244-251`.
[[particle-verb-practice]] lines 160-182 for the week rule and its citations.
[[2026-08-08-discrimination-exercise]] for why dense bases are an asset.
[[2026-08-08-verb-data-conventions]] for the `note` contract.
Tinkham 1993 and Waring 1997 on semantic-set interference; Nation 2000,
_Learning vocabulary in lexical sets: dangers and guidelines_; Kornell & Bjork
2008 and Birnbaum, Kornell, Bjork & Bjork 2013 on interleaving and
discrimination; Rohrer 2012. Sinclair 1991 (idiom principle); Nattinger &
DeCarrico 1992; Wray 2002 on formulaic sequences. Anki's default of burying
new siblings to the next day as the industry analogue for the same-base rule.

## Routed to

`swedish-linguist` — the four `phraseBound` rows, the emptied imperativs, the
frame strings and example sentences.
`frontend-expert` — the frame cue that releases the 12 held items.
`srs-engine` — the first-exposure window and the no-adjacent-same-base
reordering.
`staff-engineer` — the `firstSeenAt` storage bump, if taken.
`qa` — the pins listed above.
Lead — two `needs-human` questions for the human: whether the positive
imperative _bry dig om det_ is attested, and whether there is a test deadline
that should shorten the 7-day window.
