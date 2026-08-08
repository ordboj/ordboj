# Particle verbs: exercise design, progression, and queue

**Question:** How should Ordböj teach Swedish particle verbs (`bygga upp`,
`höra av sig`, `slå upp`), given a phone-sized card, no backend, and a learner
who is already drilling conjugation?

## Settled by the human

These are decided and this note works inside them rather than relitigating them:

1. **Separate practice mode**, with its own queue and its own due count.
2. **Two formats**: particle-blank cloze, and meaning-to-phrase recall.
3. **Lexical-unit-first**: no conjugation of particle verbs in v1.
4. **Its own independent daily goal** — additional time, not a slice of the
   existing `dailyGoal`.
5. **~40 verbs in v1**, reflexives included (cloze-only, as designed below).
6. **Particle verbs before the CSV work.**

My original recommendation was a single blended queue and cloze only. Both lost;
the consequences of losing them are worked through below rather than hidden. The
separate mode and the independent goal together create a two-ways-to-fail risk;
the section "Two goals, one adherence line" is the guard against it.

## Decision

Each particle verb becomes **two scheduled items with separate SRS state**:

```
pv:bygga-upp:cloze    Han vill bygga ___ ett företag.   (to establish)   → upp
pv:bygga-upp:recall   "to establish, to found"                           → bygga upp
```

The cloze is introduced first. The recall item unlocks only when the cloze item
reaches `repetitions >= 2`. Both are typed. Both live in the particle queue, which
has its own due count, its own session and its own daily goal.

| Parameter                      | Value                                                                     |
| ------------------------------ | ------------------------------------------------------------------------- |
| item ids                       | `pv:<slug>:cloze`, `pv:<slug>:recall` — **never** an array index          |
| `particleDailyGoal` default    | **12 cards**, settings range 4–60, independent of `dailyGoal`             |
| `particleItemsPerMinute`       | 3 (planning constant; conjugation mode uses 5)                            |
| `particleNewCardsPerDay`       | `clamp(1, 10, round(particleDailyGoal / 4))` → 3 at the default           |
| new-card priority              | recall unlocks before new verb introductions                              |
| `reviewsPerNewCard`            | 4 (conjugation mode uses 3)                                               |
| adherence condition            | unchanged: `answeredToday >= dailyGoal`, particle cards included          |
| recall unlock condition        | sibling cloze item `repetitions >= 2`                                     |
| siblings in one sitting        | never — hold the recall item to the next sitting                          |
| introduction placement         | start of sitting, before reviews                                          |
| first cloze after introduction | last in sitting, ≥ 6 intervening items preferred, **≥ 2 required**;       |
|                                | fewer than 2 defers it to the next sitting. Never counts toward the goal. |
| sentences per verb             | min 2, target 3, **all presens in v1**                                    |
| sentence rotation              | `sentences[repetitions % sentences.length]`, deterministic                |
| sentence length                | 6–10 words, target in a main clause                                       |
| introduction prerequisite      | none — removed by issue #315; introduction order uses a soft base-verb tiebreak (see #316) |
| same base verb, new            | never twice within 7 days (`bygga upp` / `bygga ut` are spaced)           |
| same particle, new             | at most 2 per day                                                         |
| reflexive verbs                | cloze item only, no recall item                                           |
| multiple choice                | not offered in v1; if ever offered, reduced credit (see below)            |
| audio                          | speaks the **sentence**, never the bare two-word phrase                   |
| accepted answers               | reuse the accepted-set accessor from the alternate-answers decision       |

## What the code does today

Nothing about particle verbs exists, and two facts in the current data decide more
of this design than any pedagogy argument does.

**There is no particle-verb data anywhere.** `VERB_DATA` is 50 rows; a grep for an
infinitive containing a space finds exactly one, `te sig`
(`src/data/verbData.ts:49`), and `verbData.test.ts:129` calls it "the one particle
verb" — it is in fact reflexive, not a particle verb. The 1537-row
`public/data/swedish_verbs.csv` contains reflexives at every level (`närma sig`,
`bege sig`, `motsätta sig`) and **zero** particle verbs: a search for
`<verb> + upp|ut|av|på|in|om|till|med|bort|fram|ner|efter|över` across the whole
file returns nothing. This feature is a new corpus authored by `swedish-linguist`,
not a filter over existing rows.

**There are no example sentences either.** `getExampleSentence`
(`src/lib/verbs.ts:145-171`) is a hardcoded object covering `vara`, `ha` and `gå`;
every other verb returns the literal string `[Example with presens]`. And
`showExamples` defaults to `false` (`src/hooks/useSettings.ts:14`). The vehicle
this feature depends on does not exist even for the verbs that ship.

**CEFR is currently meaningless.** All 50 shipping rows are `cefr: "A1"`, so the
CEFR filter in `getDueItems` (`src/hooks/useSrsProgress.ts:135-138`) can only
select everything or nothing. The CSV does band A1–C2 (302 rows at A1), but the
CSV does not ship. "Introduced in CEFR order" is a claim about data that has to be
authored, not about behaviour that exists.

Two things are in our favour. `calculateNextReview` (`src/lib/srs.ts:38`) touches
nothing but `itemId` and a binary grade, so new item types cost the scheduler
nothing. And the alternate-answers decision
(`docs/product/2026-08-08-alternate-answers-decision.md`, P1–P2) already
establishes an ordered accepted-answer list per card with `.toLowerCase().trim()`
normalisation — exactly what a particle blank needs when two particles are both
defensible.

One hazard to route around: verb ids are `String(index + 1)`
(`src/lib/verbs.ts:22`), so appending particle verbs to `VERB_DATA` would renumber
existing verbs and silently repoint every stored SRS key. Particle items must use
their own slug-based id namespace and must not be added as `VERB_DATA` rows.

## Why the particle is the blank, and why recall comes second

Particle verbs are the textbook case of a form learners understand and refuse to
produce. Dagut & Laufer (1985) found Hebrew-speaking learners systematically
preferring one-word verbs over phrasal ones; Hulstijn & Marchena (1989) found
Dutch learners avoiding a different subset; Liao & Fukuya (2004) found avoidance
concentrated at intermediate level and fading at advanced. The disagreement is
about _which_ ones get avoided; the shared finding is that recognition runs far
ahead of production. Any recognition-shaped exercise therefore drills the skill
that is not broken.

Narrowing the blank to the particle is the Barcroft argument: the TOPRA model
holds that resources spent on meaning are unavailable for form, and semantically
elaborative tasks measurably depress word-form learning. A card asking for
`byggde upp` tests a conjugation, a particle and a chunk boundary under one binary
grade — the minimum-information principle from SuperMemo's twenty rules, where
cloze deletion is the recommended technique when a fact resists further splitting.

The sentence is not decoration. Webb (2007), comparing word pairs against glossed
sentences, found context adds little for form–meaning and real gains for
grammatical function and collocation. For a single word that argues against
sentences; for a particle verb, grammatical function _is_ the content — where the
object goes (`byggde upp företaget`, never `byggde företaget upp`), whether the
reflexive agrees, what the phrase collocates with.

Meaning-to-phrase recall is the strongest production practice available and the
direct answer to the avoidance finding. Its weakness is marking: "get in touch"
maps to `höra av sig`, `kontakta` and `ta kontakt`. Two conditions make it safe.
The gloss must be specific enough to select one phrase, which is corpus work, not
code. And it must be gated behind the cloze, because a learner meeting the phrase
for the first time through a production prompt has nothing to retrieve and the
card degrades into a reveal.

## Two consequences worth stating

**Reflexive particle verbs are safe in cloze and dangerous in recall.**
`höra av sig` learned as a bare string teaches a form ungrammatical in first and
second person: the learner will say *`jag hör av sig`. In the cloze the sentence
displays the correct pronoun and the learner never produces a wrong one — provided
at least one frame per reflexive item is non-third-person
(`Jag hör ___ mig när jag landat`), or they see `sig` three times and generalise
it anyway. The recall card has no such protection: it asks for a citation form
whose pronoun is wrong in two persons out of three. **Reflexive verbs get the
cloze item only; no recall item in v1.** This is what makes them cheap enough to
include in the v1 forty.

**Stress has to come from the sentence.** Swedish marks the particle verb
prosodically — the verb loses its stress and the particle takes it, and a
construction stressed on the verb is not a particle verb at all. Browser TTS is
unreliable on a bare two-word phrase and much better inside a clause, so
`speakSwedish` is given the whole sentence. Whether it realises the stress is a
spot-check `swedish-linguist` owns; if it does not, drop audio for these items
rather than teach wrong prosody.

## Progression, and what CEFR can and cannot do

Order by **corpus frequency**, banded A1–C1 by the linguist, with compositionality
as the tiebreak inside a band: literal (`gå ut`, `komma in`, `ta med`) before
figurative (`slå upp`, `ta upp`) before aspectual (`äta upp`, `bygga upp`). That
is Dagut & Laufer's own three-way taxonomy and it tracks the difficulty gradient
their data showed. CEFR does not publish per-lexeme levels for Swedish particle
verbs, so the band is the linguist's judgement recorded as data, and the UI should
not imply a standard.

**No queue-level grouping by particle.** The tempting move — a "upp week" — comes
from Boers (2000), who showed that teaching a particle's core spatial sense and
its metaphorical extensions beat textbook explanation for the items actually
taught, but did _not_ transfer to new particle verbs. The benefit is in the
explanation, not the batching, so deliver it as **one short line per particle on
the feedback screen** ("upp — often completion, or making something visible") and
leave the queue in frequency order. Fifteen strings instead of a curriculum.

The one grouping constraint that binds is negative: never introduce two particle
verbs sharing a base verb within a week. `bygga upp` and `bygga ut` together is a
semantic-set interference design (Tinkham 1993; Waring 1997), made worse by the
shared stem. Same particle, different verbs is a much weaker risk; cap it at two a
day and stop worrying.

## Lexical-unit-first: the cost, and the free mitigation

With no conjugation in v1, all frames are presens and the learner never encounters
`byggde upp` or `har byggt upp` at all. The first time they meet the past form in
the wild, it is new. The mitigation costs nothing and stays inside the decision:
**the feedback screen shows the phrase's four forms as a static reference line,
exposure only, never tested and never scheduled.** Nothing is asked, so nothing
about lexical-unit-first is violated, and the form is not a surprise later.

The v1.1 question this defers is whether the recall item eventually graduates to a
tensed prompt ("they established the company" → `byggde upp`). Do not build it
yet. The assumption underneath v1 is that producing `byggde` on the conjugation
card and `bygga upp` on the recall card composes into producing `byggde upp` in
speech. The formulaic-language literature is the reason to doubt it: if these are
stored and retrieved as chunks, two half-skills may not add up. That is a
measurement to take, listed below, not a feature to pre-build.

## Two goals, one adherence line

The independent goal is settled, and it is the right call for pacing: particle
practice is time the learner is adding, so it should have its own budget rather
than quietly eating the conjugation budget. What it must not do is create a second
pass/fail line. **`particleDailyGoal` never appears in the streak calculation.**

The adherence condition is unchanged from [[streak-mechanics]]: a day counts when
`answeredToday >= dailyGoal`, and `answeredToday` now sums cards answered in both
modes. So the threshold a learner must clear is exactly the one that existed
before they turned particle practice on — adding the mode cannot make their streak
harder to keep, and the time they spend in it counts fully toward the thing they
are already tracking.

The alternatives both fail. **Both goals** is the two-ways-to-fail design: the
probability of missing at least one of two independent targets is worse than
missing either, and the learner is punished for having opted into more work.
**Either goal** makes the streak cheap and lets particle practice substitute for
conjugation on the ledger while the conjugation queue keeps accruing. **Original
only, particle cards not counted** adds no failure mode but tells the learner the
app does not value the time they added.

The substitution worry that argues against "either" does not apply to the summed
version, because the particle queue is bounded by what is actually due: at default
settings a learner who empties it contributes roughly 12–15 cards toward a 50-card
goal. That is meaningful credit, not a way to skip conjugation. And policing queue
balance is not the streak's job — the conjugation queue's own due count and
capacity gate do that, and using streak pressure for it is the loss-aversion
pattern P18 of [[2026-08-08-ux-pedagogy-red-lines]] forbids.

## Three calls for `srs-engine`

**1. The independent goal and new cards per day.**
`particleDailyGoal` defaults to **12 cards**, range 4–60 in Settings, stored
independently of `dailyGoal` and never derived from it.

Twelve, not fifty, because this is additional time on top of an existing
commitment and the standing rule from [[session-shape-and-daily-goal]] is a number
the median learner hits on a bad day. In minutes that is about four, at a planning
constant of **three particle cards per minute** rather than the five used for
conjugation: the cloze answer is only two to four characters, but the learner also
reads a 6–10 word sentence and a feedback panel carrying the sentence, the gloss,
the particle core-sense line and the four-form reference. Like the existing
`itemsPerMinute`, three is a planning constant and should be replaced by the
learner's observed median once per-day logging exists.

```
particleNewCardsPerDay  = clamp(1, 10, round(particleDailyGoal / 4))     // 3 at the default
particleNewAllowedToday = clamp(0, particleNewCardsPerDay,
                                floor((particleDailyGoal
                                       - min(particleReviewsDue, particleDailyGoal)) / 4))
```

The formula survives the rebase with **one change: the clamp floor drops from 2 to 1.** The floor of 2 was written when the goal was a slice of a larger budget; on a
standalone goal of 4 it would spend half the day on new material and starve
reviews. Counted in cards, so a recall unlock and a new verb introduction cost the
same. Priority within the allowance: **recall unlocks first, new verb introductions
second.** Capacity-gated at four reviews per new card rather than three, because
these lapse more than an inflectional form does — the answer is arbitrary rather
than derivable, so there is no partial knowledge to fall back on. If observed lapse
rates come in at conjugation levels, drop it to 3.

Sizing check against the v1 corpus: 40 verbs, of which the reflexives are
cloze-only, is roughly 70 scheduled cards. At three new cards a day the whole
collection is live in about 24 days, and after that particle mode is pure review
with a frequently empty queue. Route the empty queue to the non-recording free
practice from [[session-shape-and-daily-goal]] rather than a dead end (P19), and
treat forty as a starter set rather than the end state.

**2. Ordering within a particle sitting.**

```
1. introduction cards for today's new verbs   (unscheduled, not tested, at the top)
2. due reviews, most overdue first
3. first cloze of each verb introduced in step 1
```

Introductions go at the **start** because first exposure needs attention and
attention is highest at the beginning of a sitting; they are not tests, so they do
not compete with review retrieval. The first cloze of a newly introduced verb
comes at the **end of the same sitting**, at least six items after its
introduction card, and does not count toward the goal — same treatment as a lapse
re-queue in [[lapse-handling]]. This is the single scheduling detail I would
defend hardest: without it, first exposure is pure reading, and the testing effect
(Roediger & Karpicke 2006) is the whole reason the item exists.

**Short-sitting fallback.** At `particleDailyGoal = 4` the six-item gap is
unsatisfiable — one introduction plus at most three reviews. **Place the first
cloze last in the sitting with whatever gap the sitting affords, provided at least
two items intervene; if fewer than two would, defer it to the next sitting.** Six
is a preference rather than a threshold — [[lapse-handling]] already treats three
intervening items as enough to clear working memory — whereas deferring costs the
immediate retrieval outright, and on a four-card goal the next sitting is probably
tomorrow, so blanket deferral would give the smallest-budget learner first exposure
with no retrieval at all. The floor of two exists because an adjacent
reveal-then-ask is a familiarity check, not a retrieval, and it would report a
success to the scheduler that the learner did not earn. On a four-card day this
means the first cloze is often deferred, which is the honest cost of a four-card
day rather than a defect.

Reviews themselves stay interleaved, i.e. shuffled across particles and base
verbs, with one hard constraint: **the two items of the same verb never appear in
the same sitting.** The cloze feedback screen displays `bygga upp` in full, so a
recall card for the same verb later in that sitting is answered from short-term
memory and reports a success the learner did not earn. When both siblings are due,
serve the cloze and hold the recall to the next sitting.

**3. Multiple choice gets weaker credit — but is not offered in v1.**

Amended 2026-08-08 by #319 — a data-gated discrimination variant of the cloze
item is approved for a later revision; see
`docs/learning/2026-08-08-discrimination-exercise.md`.

Not offered for particle items, because the typed answer is two to four characters
and the mobile-friction argument that justifies multiple choice elsewhere (P11,
P15 in [[2026-08-08-ux-pedagogy-red-lines]]) does not apply, and because safe
distractors are unusually expensive here: `slå upp`, `slå av`, `slå på` and
`slå ner` are all real verbs, so a distractor is only safe once a human has
confirmed it is impossible in _that_ sentence.

If it is ever offered, anywhere in the app, a correct choice must not advance the
schedule as far as a correct typed answer:

```
typed correct  : easeFactor += 0.05 (ceiling 2.80), repetitions += 1, normal interval
choice correct : easeFactor unchanged,              repetitions += 1,
                 intervalDays = max(1, round(intervalDays * min(easeFactor, 1.6)))
choice wrong   : full lapse, identical to typed wrong
```

A correct recognition answer advances the item at a fixed low multiplier and earns
no ease. Production beats recognition for retention even when both get feedback
(Kang, McDermott & Roediger 2007), so scheduling recognition success at production
intervals is how the scheduler comes to believe the learner knows something they
cannot produce. A wrong choice is still a full lapse: failing a recognition test
is worse evidence than failing production, not better.

The credit must attach to **how the item was answered**, not to the current value
of a settings field, so switching modes never retroactively reinterprets history.
That needs the input modality at `recordAnswer`, which is the same signature change
[[lapse-handling]] already requires for hint reporting. Bundle them into one
payload: `{ correct: boolean; hintsUsed: number; modality: 'typed' | 'choice' }`.

## Corpus constraints this imposes

For `swedish-linguist`, since the data is the whole cost of this feature:

1. Two to three sentences per particle verb, **all presens in v1**.
2. 6–10 words, target in a main clause, no vocabulary above the item's own band.
3. The object follows the particle in at least one frame, so word order is
   modelled rather than asserted.
4. The English gloss must be idiomatic and **must not contain the particle's
   English cognate** — "look up" as a gloss for `slå upp` hands over the answer.
   Prefer a one-word synonym: "consult", "establish", "contact".
5. The gloss carries a second load now that recall exists: it must be specific
   enough that exactly one Swedish phrase is a defensible answer, or the recall
   item marks correct Swedish wrong.
6. Where more than one particle is acceptable in a frame, rewrite the frame or
   list both in the accepted set.
7. Reflexive items need at least one non-third-person frame, and no recall item.

## How we would know this was wrong

- **Cloze accuracy above ~90% from the first review.** The learner is completing a
  remembered sentence, not retrieving a verb. Raise to three or four frames.
- **First-review accuracy below ~50% while conjugation items are above 70%.** The
  single introduction card is not enough; add a recognition step before the first
  cloze.
- **Recall-item accuracy far below its sibling cloze once unlocked, and staying
  there.** `repetitions >= 2` on the cloze is too weak an unlock; raise to 3, or
  gate on interval instead.
- **Learners answer the recall item correctly with wrong Swedish that the accepted
  set happens to contain.** The glosses are under-specified; that is corpus work,
  not a scheduler tune.
- **Same-base-verb pairs miss together once both are live.** The 7-day spacing is
  too short; go to a full interval cycle.
- **Deferred first clozes (the short-sitting fallback) lapse at first review more
  than same-sitting ones.** The overnight gap is too long for a first retrieval on
  idiomatic material; drop the floor to one intervening item rather than deferring.
- **`particleDailyGoal` is met on fewer than half the days `dailyGoal` is.** Twelve
  is too high for additional time; drop to 8 before concluding the mode has failed.
- **The particle queue is opened on fewer than half the days the conjugation queue
  is.** The separate mode has become optional in practice, which is the cost of the
  independent goal; revisit blending before adding any nudge.

All are computable from `localStorage` given the per-day answered log that
[[session-shape-and-daily-goal]] already requires.

## Open question for the human

**`showExamples` defaults off**, and particle cards ignore it by construction —
the sentence _is_ the card. That inconsistency should be a deliberate call rather
than something noticed in review.

## Sources

Dagut & Laufer 1985, _Avoidance of phrasal verbs — a case for contrastive
analysis_, SSLA; Hulstijn & Marchena 1989, _Avoidance_, SSLA; Liao & Fukuya 2004,
Language Learning. Boers 2000 on orientational metaphor and multi-word verbs.
Webb 2007, _Learning word pairs and glossed sentences_, Language Teaching
Research. Barcroft, the type-of-processing / resource-allocation model. Kang,
McDermott & Roediger 2007 on production versus recognition. Roediger & Karpicke
2006 on the testing effect. Wozniak, _Twenty rules of formulating knowledge_.
Tinkham 1993 and Waring 1997 on semantic-set interference. Swedish particle-verb
prosody per standard Swedish grammar and the L2 literature on `partikelverb`
comprehension.

Where the evidence is thin: the avoidance and TOPRA findings are on English
phrasal verbs and university learners in lab conditions, and the transfer to
Swedish particle verbs on a phone is an inference. Boers is the result I lean on
most lightly — it showed a benefit for taught items and no transfer, which is why
it changes one line of feedback copy and nothing structural. The 7-day
same-base-verb spacing is the weakest number here: a direction I am confident in,
a magnitude I am not. Three particle cards per minute, the two-item floor on the
short-sitting fallback, and the 1.6 recognition multiplier are likewise principled
in direction and arbitrary in size.

## Routed to

`swedish-linguist` — the corpus, sentence frames, glosses, banding, accepted sets,
reflexive handling, TTS stress spot-check.
`srs-engine` — the `pv:` id namespace, two items per verb, the unlock gate, the
three calls above, sentence rotation by `repetitions`, sibling-separation
constraint.
`frontend-expert` — cloze card, recall card, introduction card, sentence-level
audio, per-particle core-sense line, the static four-form reference on feedback,
the `particleDailyGoal` control in Settings.
`product-manager` — sequencing of v1.1 (tensed recall prompts) if ever wanted.
