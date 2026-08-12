# Sentence completion: option sets, difficulty, credit and feedback

**Question:** The human asked for a TOEFL-style sentence-completion exercise.
One Swedish sentence, one blank, and the learner picks the whole particle
verb (`ta med`) from a short option list (`ta ut`, `ta emot`, `ta av`). How
many options, which distractors, how does difficulty progress, how does it
score against the SRS, and what does the learner see afterwards?

**Human ruling, 2026-08-13 (#386), after a critic round.** Three options
stands. The blank stays **particle-only**, exactly as
[[2026-08-08-discrimination-exercise]] (#319) specified; the option buttons
carry the **full phrase** as their label. The human confirmed that this
satisfies the original whole-phrase request: the learner still chooses
between `ta med` and `ta ut` as whole phrases, and the phrase-wide blank was
only ever one way of presenting that choice. The phrase-wide blank this note
first recommended is withdrawn on two verified defects, recorded under
"Blank width" below. Everything else here stands as written.

## Decision

**This is not a new mode. It is the discrimination variant of
`pv:<slug>:cloze` that [[2026-08-08-discrimination-exercise]] already
approved.** Everything that note settled stays in force: same item id, same
SRS state, no new namespace, no storage version bump, one review in three,
app-chosen, weaker credit on a correct choice, a full lapse on a wrong one,
and no learner-facing switch. Three things change or are settled for the
first time. Option count drops from four to **three** (target plus two
distractors). Option buttons are labelled with the **full phrase**,
`base + particle`, while the blank in the sentence stays the single particle
token the frame's `blankIndex` names. Distractors stay **same base,
different particle** and nothing else; different-verb and mixed option sets
are rejected, not deferred-with-sympathy. And distractor similarity **does
not scale with CEFR level** — it scales with what the learner has already
met, which the app can measure and a band label cannot.

The build gate moves with the option count: **at least 8 certified frames
across at least 5 distinct base verbs, each frame carrying at least 2
certified `excludedParticles`.** At three lures the gate is unreachable
today; the dataset contains **zero** frames with three excluded particles.
At two it is reachable and close.

| Parameter                | Value                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| item                     | `pv:<slug>:cloze` — a render mode, never a new item                                             |
| options                  | exactly 3: target plus 2 distractors                                                            |
| option label             | `${baseInfinitive} ${particle}` — the citation-form phrase, e.g. `ta med`                       |
| blank span               | the single token at the frame's `blankIndex`. Never two tokens                                  |
| inserted on answer       | the particle alone, so the completed sentence keeps its own presens verb                        |
| distractor source        | the frame's `excludedParticles`, certified per frame by `swedish-linguist`                      |
| distractor construal     | same base, different particle. Every label starts with the same word                            |
| distractor eligibility   | the particle is already introduced (definition unchanged)                                       |
| eligibility (frame)      | target cloze `repetitions >= 3`, at least 2 eligible lures, `reflexive === 'none'`              |
| eligibility (answer key) | the option set intersects `acceptedParticles` in exactly one member                             |
| rendered correct option  | `acceptedParticles[0]` only; a second accepted particle never appears as an option              |
| variant trigger          | eligible AND `repetitions % 3 === 0` — one review in three                                      |
| render index             | `k = floor(repetitions / 3)`. Every rotation below is driven by `k`, never by `repetitions`     |
| distractor pick          | eligible list in authored order, 2 taken cyclically from index `k % n`                          |
| option order             | sort by `localeCompare(b, 'sv')`, then rotate by `k % 3`                                        |
| ineligible fallback      | typed cloze as normal; never a two-option card                                                  |
| commit                   | first option tapped commits, no re-tap, no retry                                                |
| choice correct           | ease unchanged, `repetitions += 1`, `intervalDays = min(365, max(1, round(iv * min(ef, 1.6))))` |
| choice wrong             | full lapse, identical to a typed wrong answer                                                   |
| feedback, wrong option   | gloss of the chosen phrase, only when a `verified` entry carries that lemma                     |
| audio                    | the corrected sentence only. No pronounce control on any wrong option                           |
| build gate               | >= 8 certified frames, >= 5 distinct bases, >= 2 `excludedParticles` each                       |
| storage                  | no shape change, no version bump                                                                |

## What the code and the data actually contain today

**The variant does not exist.** No render mode, no option builder, nothing.

**The scheduler cannot express the credit rule yet.**
`calculateNextReview(state, grade)` (`src/lib/srs.ts:57`) takes a binary
grade and nothing else. `Grade` is `0 | 5` (`srs.ts:24`). There is no
`modality` parameter anywhere in `src/lib`, so the weaker-credit path is
still a document, not a code path. It lands before any card work, as the
earlier note already ruled.

**The data cannot feed a four-option card, and barely feeds a three-option
one.** `excludedParticles` is optional on `ParticleVerbExample`
(`src/data/particleVerbData.ts:60`) and appears on **20 frames**. **No frame
anywhere in the file carries three particles.** Four entries carry two:
`komma ihåg` with `['in', 'fram']`, `lägga ner` with `['in', 'upp']` and
`bli av` with `['kvar', 'över']` on all three of their frames, and
`stå till` with `['upp', 'ut']` on **2 of its 3** frames — the middle frame,
`Jag undrar hur det står till hemma hos er.`, carries none. The remaining
frames carry one particle. The field's own comment states why it is thin,
and the reason is correct: "Left unset when no substitution has been
individually verified — an empty guess would be worse than no claim at all."

So a four-option gate is not a high bar the corpus has not yet cleared; it
is a bar the corpus has cleared zero times in 100+ entries. That is the
single strongest argument in this note, and it is arithmetic rather than
pedagogy.

**`lägga ner` shows why the answer key needs a rule.** Its
`acceptedParticles` is `['ner', 'ned']` — one word, two standard spellings.
A naive option builder that rendered every accepted particle would put
`lägga ner` and `lägga ned` in the same list and mark one of them wrong.
Hence the two answer-key rows in the table above.

**CEFR already scopes the right thing.** `#350` narrowed `cefrLevels` to
introduction candidates only (`src/lib/particleQueue.ts:300-306`); due
reviews ignore it, so nothing a learner has met can be orphaned. That
decision does most of the difficulty-progression work this note is asked
about, and it does it upstream of the card.

## Three options, not four

Rodriguez's meta-analysis of 80 years of item-writing research is the
standard result: three options are optimal, because writing a third
plausible distractor is usually not possible, and a non-functional
distractor adds reading time and nothing else
([Rodriguez 2005](https://onlinelibrary.wiley.com/doi/10.1111/j.1745-3992.2005.00006.x)).
That finding is about assessment efficiency rather than learning, so on its
own it would not overturn a decision already made. Two other things do.

The learning benefit of a multiple-choice item depends entirely on the lures
being _competitive_. Little and Bjork's result is that a multiple-choice
test with plausible alternatives produces recall benefits comparable to
cued recall, and additionally improves later recall of material related to
the distractors — because the learner retrieves not only why the target is
right but why each alternative is wrong. When the alternatives are not
competitive, that benefit disappears
([Little, Bjork, Bjork & Angello 2012](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Little_EBjork_RBjork_Angello_2012.pdf)).
A padding lure is therefore not neutral here. It is the difference between a
card that teaches three particle contrasts and a card the learner solves by
elimination.

And the corpus fact above decides it. Demanding a third certified
impossibility per frame asks `swedish-linguist` for the _weakest_ lure on
every frame, which is precisely the one most likely to be defensible in the
sentence — the failure this design must not have. Two certified lures per
frame is roughly half the certification cost and buys a card whose every
option a human has actively rejected.

Runner-up: **keep four and wait for the corpus.** It loses on the number
zero. Sixteen further certified frames at three lures each is 48 individual
impossibility judgements before a single learner sees the feature, and the
marginal judgements are the shaky ones.

## Blank width: the particle, with phrase-labelled buttons

The whole-phrase framing is the human's original request, and it is the
right framing for what the learner is choosing between: `ta med` against
`ta ut` is a choice between two lexical items, not between two prepositions.
The buttons therefore carry the full phrase. What this note got wrong was
concluding that the _blank_ had to widen to two tokens to deliver that. The
critic round found two defects, both verified against the data, and both
fatal to the two-token blank.

**Defect 1 — Swedish does not keep the two tokens adjacent.** `stå till`'s
frames are `Hur står det till med familjen i dag?` with `blankIndex: 3`. The
verb is at index 1 and the particle at index 3, with `det` between them. A
blank spanning "the particle verb" has nothing contiguous to span. This is
not a quirk of one entry: verb-second order plus a subject or object
pronoun separates the two tokens whenever the clause is a question or has
fronted material, and `blankIndex` exists as an explicit field precisely
because the particle's position cannot be derived. A two-token blank would
have to be defined per frame as a token _set_, and the frames that need it
most are the ones where the learner most needs to see the surrounding
structure.

**Defect 2 — the label is a citation form and the sentence is presens.**
Options read `ta med`, but every v1 frame is presens, so a phrase-wide blank
filled with the tapped label renders `Jag ta med en present` on screen —
ungrammatical Swedish, shown to the learner, on a card whose purpose is to
teach the correct form. Using presens labels instead does not rescue it: the
target entry carries `forms.presens`, but a lure phrase is constructed as
`base + particle` from another verb's particle and **has no verified presens
form anywhere in the dataset**. Generating one would be guessing Swedish
morphology to render a wrong answer, which is the project's red line spent
on the least valuable string on the card.

The ruling avoids both. The blank stays the single token at `blankIndex`, so
tapping `ta med` inserts `med` and the sentence completes as its own author
wrote it. The button label stays the citation phrase, which is unambiguous,
already stored as `lemma` for the target and mechanically derivable for the
lures, and never claims to be a substring of the sentence. The learner sees
a phrase-level choice and a grammatical sentence, which is what the original
request was asking for.

## Different-verb distractors: rejected, with the reason

The tempting third source is same-particle, different-base: `ta med` against
`följa med`, `gå med`, `ha med`. Reject it, in this mode, permanently rather
than provisionally.

The competitiveness argument runs backwards from intuition here. An option
that differs from the target on two dimensions at once is rejectable on
_either_ dimension, so a mixed set is **easier** than a same-base set, not
harder. `Jag ska ___ paraplyet` with `ta med / gå ut / komma in` is solved by
anyone who knows that umbrellas are taken rather than walked. The same-base
set forces the discrimination the item exists for, which is exactly Little
and Bjork's "shares important information with the correct option".

The certification cost is also of a different kind. Excluding a particle is
a combinatorial judgement about one frame: does `lägga upp fabriken` parse.
Excluding a whole different verb is a semantic judgement against the entire
sentence, and near-synonyms are where Swedish gets genuinely arguable —
`ta med` and `ha med sig` overlap in ways that depend on context the frame
may not pin down. [[2026-08-08-discrimination-exercise]] already deferred
cross-verb near-synonym lures pending a per-option rejection reason on the
feedback screen. This note keeps that deferral for the recall item and
closes the door for the cloze item, because in the cloze the base verb is
part of the question, not part of the answer.

## Difficulty does not scale with CEFR band

Do not vary option count, lure similarity or lure count by the learner's
`cefrLevels`. Three reasons, in order of strength.

First, an easier version of this card is a card that lies to the scheduler.
The credit path treats a correct choice as evidence about the item; if the
lures were deliberately made non-competitive for a beginner, the evidence is
manufactured, and the beginner is the learner least able to afford an
inflated interval. Making the early card _easier_ is the standard
desirable-difficulty error (Bjork; and Little & Bjork's non-competitive
condition is literally this manipulation, which produced no benefit).

Second, the band does not measure what the knob would need it to measure.
[[2026-08-09-particle-cefr-majority-decision]] establishes that `cefr` here
records the first coursebook level with nonzero SVALex frequency — when a
phrase is first _useful_, not how hard the retrieval is — and states the
consequence plainly: `ta slut` (B1) is not a harder blank than `ta bort`
(A2). Tuning lure difficulty by a usefulness label is tuning by a proxy the
project has already documented as weak.

Third, the app already has a better signal, and it is already implemented.
The variant only fires at `repetitions >= 3`, so the card never meets a
learner who has not survived three typed retrievals of the same frame. And
the introduced-particle rule means the lure pool is exactly the set of
particles this learner has personally met, which for a beginner — whose
introductions are scoped by `cefrLevels` at
`src/lib/particleQueue.ts:300-306` — is automatically the beginner pool.
Difficulty progression is therefore emergent from exposure, needs no new
parameter, and degrades correctly for a learner who has been away.

## Rotation must be driven by the render index, not by `repetitions`

Corrected 2026-08-13. The first version of this note said "rotate by
`repetitions % 3`", which is a **no-op under its own trigger**: the card
only renders when `repetitions % 3 === 0`, so that expression is zero at
every single render and the correct answer sits in a fixed position
forever — the exact position-memory failure the rotation exists to prevent.

Define `k = floor(repetitions / 3)`, the count of discrimination renders
this frame has had. Rotate the sorted option list by `k % 3`, and take the
distractor window from index `k % n`. At `repetitions` 3, 6, 9, 12 the
rotation is 1, 2, 0, 1 — every position is used, and the rule stays a pure
function of stored state, so it remains deterministic and testable. When
exactly 2 lures are eligible, the window rotation has nothing to choose and
both lures always appear; it only does work at `n > 2`.

This is a bug in a document rather than in shipped code, but it is the kind
that survives into code, because the expression looks right in isolation and
is only wrong in combination with the trigger. `qa` should assert positions
vary across consecutive renders of the same frame rather than assert the
formula.

## Why a recognition card is justified at all

It is justified under four conditions together, and the case collapses if
any one is dropped. It is a **minority** of reviews (one in three); typed
production stays the drill, because production beats recognition for
retention even when both get feedback (Kang, McDermott & Roediger 2007). It
is **app-chosen**, so it cannot become the learner's permanent habitat —
red line 7 of [[2026-08-08-ux-pedagogy-red-lines]]. It carries **weaker
credit**, so a recognition success never buys a production-sized interval.
And its lures are **competitive**, which is what makes it a probe of lure
resistance rather than a free card.

The specific thing it tests that typed cloze does not: whether the learner's
knowledge of `ta med` survives contact with `ta ut` and `ta emot`. A typed
answer never confronts the competitor. Interference between related particle
verbs is the documented failure mode this whole feature routes around — it
is why [[particle-verb-practice]] spaces same-base introductions by seven
days — so a periodic direct measurement of it is worth one review in three.

## Feedback

The standard cloze feedback panel, unchanged, plus exactly one addition.

1. The correct option is marked immediately and plainly, on the same screen,
   with the full sentence completed in its own presens form. No retry, no
   second attempt: the first tap commits (P1, P3, P5 of
   [[2026-08-08-ux-pedagogy-red-lines]]).
2. The wrong option the learner tapped is marked wrong and shown muted and
   subordinate, never at equal weight beside the correct one (P21).
3. **The addition:** when the learner chose wrong, show the chosen phrase's
   own gloss — `ta ut — to withdraw` — but **only when a `verified` entry in
   `PARTICLE_VERB_DATA` has that lemma**. No new authoring, no new field, a
   lookup by `baseInfinitive + particle`. When no verified entry exists, show
   nothing extra.
4. **No per-option rejection reasons in v1.** `excludedParticles` is a list
   of strings and carries no reason. The per-frame prose reasons that exist
   live in source comments, are written for the linguist, and are not
   learner copy. Authoring 2 reasons per frame is corpus work of the same
   order as the exclusions themselves and belongs in its own ticket.
5. **No pronounce control on any wrong option.** Audio speaks the corrected
   sentence. The wrong option is real Swedish, but it is wrong _here_, and
   the sentence is where the prosody lives.

Point 3 is the one worth defending. A learner who leaves the card knowing
only "not `ta ut`" has spent a competitive lure and got nothing from it,
which wastes exactly the retrieval Little and Bjork identify as the source
of the benefit. One gloss line converts the lure into a second piece of
teaching at zero authoring cost.

## Ambiguity: what a test can catch and what only a human can

Mechanical, and `qa` should assert all four on the dataset:

1. `excludedParticles` never intersects `acceptedParticles` (already
   asserted, per #318).
2. The rendered option set contains exactly one member of
   `acceptedParticles`, namely `acceptedParticles[0]`. This is what stops
   the `lägga ner` / `lägga ned` card.
3. No duplicate options, and no option label equal to another option label.
4. A frame qualifies as certified only when `verified === true` and
   `excludedParticles.length >= 2`; the certified-frame count and the
   distinct-base count are computed, not asserted by hand.

Not mechanical, and the reason the human gate stays: whether the particle is
genuinely impossible in that exact sentence. Not unusual, not awkward —
impossible. The `se om` entry is the model, and it is worth quoting because
it shows the standard being applied correctly: `ut` is excluded because
`*vi ser ut filmen` is ungrammatical, while `på` is deliberately **not**
excluded, since `vi ser på filmen` is good Swedish with a different meaning.
A lure that is correct in the frame marks correct Swedish wrong. That is the
project's stated red line, and no test can find it.

Reflexive entries stay out of the variant entirely. `lemma` carries a
`{refl}` placeholder (`particleVerbData.ts:85-88`) precisely because `sig`
is wrong in the first and second person; rendering `höra av sig` as a
tappable label would teach the form the data structure exists to prevent.

## How we would know this was wrong

All of these need the per-answer log (item id, modality, correct, timestamp)
that [[2026-08-08-discrimination-exercise]] already names as a hard
prerequisite. `SrsState` keeps no answer history, and
[[2026-08-08-latency-and-attempt-signals]] deliberately persists no
attempts. Until that log exists, these are checked by hand from a sample.

- **Pooled choice accuracy above ~90%** over the trailing 30 choice answers:
  the lures are dead and the card is inflating intervals. Raise lure quality
  first; drop the frame from the variant if it cannot support two
  competitive lures.
- **One frame below ~50% choice accuracy after 5 answers while the same
  verb's typed cloze is above 80%:** the prime suspect is a lure that is
  actually correct. Pull the frame from the variant immediately, file a data
  defect, and grade nothing on its choice history.
- **One distractor is chosen by the learner on more than ~60% of the
  occasions it appears, on a frame the learner otherwise passes typed:**
  same diagnosis, caught earlier and per-lure rather than per-frame. This is
  the falsifier the three-option set makes affordable, because with two
  lures the base rate is 50% rather than 33%.
- **Accuracy is markedly higher on choice renders than the four-option
  design would predict, if both ever run:** confirms the fourth option was
  doing work and the gate should go back to three lures.
- **Choice-graded items lapse at or below typed rates on their next typed
  review:** the 1.6 multiplier is too conservative. Raise it toward 1.8
  before touching ease.
- **Learners pass the choice card and keep failing the typed cloze on the
  same frame:** recognition is running ahead of production for this item and
  the variant is not earning its slot. Drop the trigger from one review in
  three to one in four before removing the feature.
- **Accuracy is higher when the correct option happens to sit in the same
  position as last time:** the rotation is not doing its job, most likely
  because it was keyed on a value that is constant at render time. See the
  rotation section.

## Sources

[Rodriguez 2005](https://onlinelibrary.wiley.com/doi/10.1111/j.1745-3992.2005.00006.x),
_Three options are optimal for multiple-choice items_, Educational
Measurement: Issues and Practice 24(2).
[Little, Bjork, Bjork & Angello 2012](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Little_EBjork_RBjork_Angello_2012.pdf),
_Multiple-choice tests exonerated, at least of some charges_, Psychological
Science — competitive alternatives, retrieval of why distractors are wrong,
benefit to non-tested related information.
[Little & Bjork 2015](https://pubmed.ncbi.nlm.nih.gov/25123774/),
_Optimizing multiple-choice tests as tools for learning_, Memory &
Cognition.
Kang, McDermott & Roediger 2007 on production versus recognition. Roediger &
Karpicke 2006 on the testing effect. Bjork on desirable difficulties.
Haladyna & Downing on non-functional distractors.
[[particle-verb-practice]], [[2026-08-08-discrimination-exercise]],
[[2026-08-09-particle-cefr-majority-decision]],
[[2026-08-08-ux-pedagogy-red-lines]].

Where the evidence is thin: Little and Bjork tested US undergraduates on
prose facts, not L2 learners on particle verbs, and the transfer is an
inference. Rodriguez's meta-analysis is about test construction, and I use
it as supporting evidence rather than as the reason — the reason is the
corpus count. The one-in-three trigger, the 1.6 multiplier and the 60%
lure-choice threshold are principled in direction and arbitrary in size.
The claim that a phrase-labelled button delivers chunk-level retrieval as
well as a phrase-wide blank would have is a mechanism argument with no
measurement behind it; it is now moot for implementation, since the two
defects above decided the question on correctness grounds rather than on
pedagogy.

## Routed to

`swedish-linguist` — raise `excludedParticles` to 2 per frame on at least 8
verified frames across 5 distinct bases, both certification halves. Do not
chase a third. `stå till`'s middle frame is one certification short.
`srs-engine` — the `modality` parameter on `calculateNextReview` /
`recordAnswer` and the weaker-credit branch, which lands before any card
work; the deterministic eligibility, lure-window and rotation rules, all of
which read `repetitions` only, through `k = floor(repetitions / 3)`.
`frontend-expert` — the three-option render of the existing cloze card, the
single-token blank, phrase-labelled buttons, first-tap commit, the
chosen-lure gloss line, and no pronounce control on wrong options.
`qa` — the four dataset assertions above, the certified-frame and
distinct-base counts, a position-varies-across-renders test, and the
credit-path tests.
`product-manager` — sequencing against the per-answer log, which every
falsifier here depends on.
