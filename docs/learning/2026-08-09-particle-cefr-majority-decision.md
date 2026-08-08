# Particle verbs: the A1+A2 rule becomes a floor, not a majority

**Question (#343):** `particleVerbData.test.ts` requires verified A1+A2
entries to outnumber every other band together. The corpus supply of A1/A2
particle verbs is thin, so the rule now caps how large the dataset may grow.
Does the rule stay at the dataset level, move to the introduction queue, or
become a cap on intake?

**This blocks work now, not soon.** After batch 2 the dataset is 106 entries,
101 verified, A1+A2 at **51 of 101** against a threshold of 50.5. One further
verified B1, B2 or C1 entry anywhere in the dataset fails the test. The 16
remaining #336 rows at ranks 200–242 are blocked behind it, and so is every
band 6–8 row after them.

## Decision

**Delete the proportional majority rule. Replace it with an absolute floor of
45 verified A1+A2 entries, and let the introduction queue carry the
guarantee it was standing in for.** The queue already sorts introduction
candidates by CEFR band ascending, and the band term dominates every other
key (`compareForIntroduction`, `src/lib/particleQueue.ts:163-175`), so what a
beginner meets first is decided at introduction time, not by dataset
composition. The dataset must therefore hold _enough_ A1/A2 material to fill
the beginner's first month; it does not need to hold _mostly_ A1/A2 material.
The floor protects the learner. The proportion only protected the learner
back when the dataset and the introduction order were the same thing.

| Parameter                     | Value                                                                    |
| ----------------------------- | ------------------------------------------------------------------------ |
| `MIN_VERIFIED_A1_A2`          | **45** verified entries with `cefr === 'A1' \|\| cefr === 'A2'`          |
| runway this buys              | 30 days of introductions at the default `particleDailyGoal = 12`         |
| current value                 | 51 (A1 17, A2 34) — the floor holds with 6 to spare, ~34 days of runway  |
| dataset cap from this rule    | **none**. A B1 or B2 entry can never lower the A1+A2 count               |
| first-N ordering assertion    | first **30** entries of `orderForIntroduction(entries, {})` are A1 or A2 |
| linguist backlog target       | raise verified A1+A2 to **60**, opportunistically, not as a gate         |
| bands 1–5 intake              | **uncapped**; continue in rank order from rank 200                       |
| band 6 A1/A2 rows             | authorable out of rank order, on usefulness, not to satisfy a test       |
| `cefrLevels` on particle mode | follow-up, introductions only, never due reviews (see "Routed to")       |

## What the code does today

`VERIFIED` is 101 entries: **A1 17, A2 34, B1 34, B2 15, C1 1**. A1+A2 is 51,
which is 50.5%, against a threshold of 50.5. The next verified B1+ entry makes
it 51 against 51, and `toBeGreaterThan` fails. There is **no headroom left**:
the rule has stopped describing the dataset and started scheduling the
linguist's work.

The assertion is `src/data/particleVerbData.test.ts:407-410`:

```ts
it('leads with A1 and A2 core material', () => {
  const early = VERIFIED.filter((entry) => entry.cefr === 'A1' || entry.cefr === 'A2').length;
  expect(early).toBeGreaterThan(VERIFIED.length / 2);
});
```

Its origin is the design spec, deliverable F2: "~40 entries selected from the
SVALex extraction (**A1/A2 core first**)"
(`docs/superpowers/specs/2026-08-08-partikelverb-design.md:251-252`). The
intent was an ordering: the starter set leads with core material. At 40
entries authored in rank order, "leads with" and "is a majority of" describe
the same set, so the test encoded the second because the second is trivial to
assert. That equivalence was true for a 40-entry dataset with no ordering
code. It is not true now.

Three later changes moved the guarantee into the queue:

- **#316 / PR #331** added `CEFR_BAND_ORDER` and `compareForIntroduction`.
  The comment on `src/lib/particleQueue.ts:123-125` is explicit: band is
  "the only thing the ordering rule is allowed to touch first: nothing below
  can ever move an entry out of the position its own band gives it."
- **#315 / PR #323** removed the base-verb hard gate, so the introduction
  pool is no longer filtered by anything except the band ordering and the
  interference rules.
- **#318** embedded reference forms, so a shipping entry no longer depends on
  a `VERB_DATA` join.

Two structural facts make dataset growth cheap for the learner. Nothing in
the learner's daily load scales with dataset size: `getParticleReviewCount`
counts due reviews only, and `particleNewAllowedToday` is a function of
`particleDailyGoal` and `reviewsDue`, never of how many entries exist. And
`buildParticleSitting` walks `orderForIntroduction` and stops at
`remaining <= 0`, so a 400-entry dataset and a 101-entry dataset produce an
identical first sitting.

## Why the proportion cannot survive, as arithmetic

The rule asks the dataset to hold a band distribution the language does not
have. SVALex, the source the spec adopted, measures 429 verb+particle
combinations at **A1 25 / A2 70 / B1 122 / B2 143 / C1 69**
(`docs/superpowers/specs/2026-08-08-partikelverb-design.md:133-136`). A1+A2
is **22.1%** of a graded lexicon built from twelve CEFR-graded coursebooks.
The research list is the same shape: **123 of 1069 rows** are A1 or A2, which
is 11.5%.

Now that the rule is binding, its real cost is visible as a marginal rate.
**From here, every A1/A2 entry the linguist authors buys exactly one B1+
entry.** The dataset can only grow at 1:1 for the rest of its life. That is
the whole rule, stated honestly: it is an intake ratio, and it demands a ratio
more than twice what the corpus contains.

The ceiling that follows: a 50% rule caps the dataset at twice the authorable
A1/A2 supply. Even in the impossible best case, where every one of the 123
A1/A2 rows in the research list is glossable, verifiable and authored, the
dataset stops at 246 entries. Against 415 entries that are shippable today
(`docs/research/partikelverb/partikelverb-list.md:143`), the rule discards the
majority of the researched corpus. Today it stops at 102. This is not a
batch-2 accident that more authoring fixes; it is what a proportional rule
does when the population is 22% of the thing being proportioned.

## Why the band label cannot carry that much weight

The list states what the CEFR column is: "the SVALex 'first level with
nonzero frequency'. That derivation is ours, not a label the resource
assigns" (`docs/research/partikelverb/partikelverb-list.md:88-93`). It
records **when a coursebook first uses the phrase**. It is not a measurement
of how hard the card is.

For this exercise that distinction is sharp, because the card asks for a two-
to four-character particle in a frame the learner reads in full. `ta slut`
(B1) is not a harder blank than `ta bort` (A2); `känna till` (B1) is not
harder than `känna igen` (A2). The band tracks usefulness and exposure, which
is a real signal for _ordering_, and it tracks retrieval difficulty only
loosely, which is why it is a poor gate on _membership_. Nation's
frequency-first principle in vocabulary teaching is a claim about the order
of acquisition and the payoff of coverage, not a claim that a learner's word
list must be half beginner items. Graded courses, Duolingo included, control
what is presented when; they do not hold their content bank to a
level-proportional split.

The one place the label does bind is the beginning. A learner two weeks in
who meets `hålla till` ("to hang out, to be based somewhere", B2) instead of
`stänga av` has been handed something less useful at the moment their
motivation is least established. That risk is real, and it is exactly what an
absolute floor plus rank-ordered intake protects, which is why this decision
keeps a number rather than deleting the rule.

## Where 45 comes from

The default `particleDailyGoal` is 12, so
`particleNewCardsPerDay = clamp(1, 10, round(12 / 4)) = 3`. New cards are
counted as cards, and recall unlocks spend the allowance before
introductions. A non-reflexive verb costs two cards over its life (cloze,
then recall); a reflexive costs one. In steady state, 3 new cards a day
introduces about **1.5 new verbs a day**. Thirty days of introductions is
therefore about **45 verbs**.

45 verified A1+A2 entries means: **at default settings, a learner meets no
entry above A2 for their first month.** That is the sentence the rule is
protecting, stated as a number an engineer can type. At today's 51 the runway
is about 34 days, so the floor is satisfied and stays satisfied while B1+
authoring resumes.

Be clear about what this number is not. No study says a beginner needs thirty
days of A1/A2 particle verbs. The derivation is from this app's own default
pacing, and the choice of "one month" is a judgement that a month is long
enough for the habit to be the thing that carries the learner, not the
novelty. At the settings maximum (`particleDailyGoal = 60`,
`particleNewCardsPerDay = 10`) the same 45 entries last about nine days — and
a learner who sets 60 cards a day has told us they are not protecting
themselves.

## The options that lost

**Author more A1/A2 first (option 2) — runner-up, and now measurably weak.**
It is not wrong, and this decision folds the useful half in as a backlog
target of 60. It loses as an _answer to the invariant question_, and the
binding rule makes the loss quantifiable rather than rhetorical.

Ranks 200–242, the rows #336 has left, contain about ten A1/A2 candidates
(`plocka upp`, `stoppa in`, `läsa in`, `springa ut`, `springa fram`,
`vara ihop`, `få ihop`, `kasta ut`, `byta om`, `stå till`). Authoring all ten
first takes A1+A2 from 51 to 61 and the dataset to 111 — which unblocks
exactly **ten** B1+ rows before the test binds again. So the whole remaining
A1/A2 supply in the corpus-ranked bands buys about one batch. The supply is
thinner than the dataset needs but not exhausted: band 6 holds roughly 35 more
A1/A2 candidates. Even spending all of them buys 35 B1+ rows and leaves the
1:1 rate in force forever after.

The second reason it loses is that it distorts the authoring order. To farm
A1/A2 labels the linguist must jump from the corpus-ranked bands 1–5 into
band 6, which the list itself says "should not be mixed with bands 1–5 in any
automated sort" because its bands are judgment
(`docs/research/partikelverb/partikelverb-list.md:453-455`). Authoring band-6
rows because `stänga av` and `slå på` are the verbs a learner needs to operate
a phone is good work. Authoring them because a test counts labels is the test
setting the curriculum.

**Cap bands 1–5 intake (option 3) — rejected.** It caps growth at exactly the
point where the evidence is strongest. Bands 1–5 are the frequency-ordered,
corpus-backed rows; bands 6–9 are judgment and inventory. A rule that says
"stop taking corpus-ranked rows" while leaving judgment-ranked rows available
inverts the source hierarchy the research list was built to establish. It also
does not solve the problem it is aimed at: the 1:1 rate applies wherever the
rows come from.

**Move the rule verbatim to the queue (option 1) — incomplete, not wrong.**
Re-scoping to the queue is the right direction and is half of this decision.
On its own it is a deletion: `compareForIntroduction` already sorts by band,
so a "queue leads with A1/A2" test passes vacuously on a dataset with three
A1 entries and four hundred B2 entries. The floor is what stops the deletion
from being a hole.

## What implementers change

**`qa` — `src/data/particleVerbData.test.ts`.** Replace the assertion at
lines 407-410:

```ts
const MIN_VERIFIED_A1_A2 = 45;

it('keeps the beginner runway: at least 45 verified A1/A2 entries', () => {
  // Not a majority (see docs/learning/2026-08-09-particle-cefr-majority-decision.md).
  // A1+A2 is 22% of SVALex, so a proportional rule is an intake ratio the corpus
  // cannot supply. What the learner meets first is decided by CEFR_BAND_ORDER in
  // particleQueue.ts; this floor only guarantees there is enough A1/A2 material to
  // fill the first ~30 days of default-paced introductions.
  const early = VERIFIED.filter((entry) => entry.cefr === 'A1' || entry.cefr === 'A2').length;
  expect(early).toBeGreaterThanOrEqual(MIN_VERIFIED_A1_A2);
});
```

**`qa` — `src/lib/particleQueue.test.ts`.** Add the assertion that now carries
the pedagogy, on an empty store:

```ts
it('introduces 30 verbs before it leaves A1/A2', () => {
  const first30 = orderForIntroduction(getVerifiedParticleVerbs(), {}).slice(0, 30);
  const late = first30.filter((entry) => entry.cefr !== 'A1' && entry.cefr !== 'A2');
  expect(late.map((entry) => entry.id)).toEqual([]);
});
```

This change unblocks #336 ranks 200–242 and the band 6–8 work behind it. It
should land before the next data batch, not alongside it, so that a data PR is
never the thing that turns the test red.

**`srs-engine` — nothing now.** `compareForIntroduction` and
`CEFR_BAND_ORDER` are correct as written and this decision depends on them.
Do not weaken the band term to a tiebreak.

**`swedish-linguist` — intake.** Bands 1–5 continue in rank order from rank
200, with no band-label quota. Take every A1/A2 row you pass, which covers the
ten listed above without reordering anything. Separately, and on usefulness
rather than on the count, author the band-6 rows that are day-one operational
vocabulary the coursebook corpus misses — `stänga av`, `slå på`, `slå av`,
`följa med`, `ha på sig`, `ta på sig`, `ta av sig`, `flytta in`, `checka in`,
`torka av`, `städa upp`, `fylla i` — which lifts the runway past the 60
target.

## What stays

Everything else in the CEFR block and the verified gate is untouched. The
`cefrEvidence` provenance test stays. `VERIFIED.length >= 40` stays. Every
sentence, gloss, reflexive and `excludedParticles` test stays. The band field
itself stays and keeps its current derivation, because the introduction
ordering depends on it entirely — demoting the majority rule raises the
importance of the band being right, it does not lower it.

## The residual risk, named

Two gaps remain open after this decision.

**A learner who stays a beginner.** After the runway, band ordering hands them
B1. There is no learner-level signal in particle mode:
`buildParticleSitting` calls `getVerifiedParticleVerbs()` with no filter, and
the `cefrLevels` setting reaches conjugation items only. The right fix is to
apply `cefrLevels` to particle **introductions**, and never to due reviews —
filtering reviews would orphan items the learner has already met and has
schedules for. That is a separate ticket, and it is the mechanism that makes
unbounded dataset growth safe for someone who wants to stay at A2.

**The in-band skip.** `buildParticleSitting` skips a candidate blocked by the
7-day same-base rule or the 2-per-particle cap and moves to the next in band
order, which is a higher band once the band's unblocked candidates run out.
With 45+ A1/A2 entries this cannot reach the first 30 introductions unless
nearly all of them share a handful of base verbs. The A1 band is the exposed
one: 17 entries over about eight bases (`gå` ×4, `komma` ×5, `ta` ×3). It is
worth watching, not worth code today.

**The Progress page** lists every verified entry
(`src/pages/Progress.tsx:125,152`). At 300 entries it shows a learner a mostly
untouched table, which reads as a backlog rather than progress. That is
`frontend-expert`'s call, not a reason to hold the dataset small.

## How we would know this was wrong

- **Verified A1+A2 falls below 45**, through reclassification rather than
  through growth. The floor fails and the fix is authoring, not a threshold
  edit.
- **An entry above A2 appears in a learner's first 30 introductions.** The
  band ordering leaked, most likely through the in-band skip above. Fix the
  skip; do not restore the proportion.
- **First-review accuracy on the first 20 particle items falls below ~50%
  while conjugation items stay above 70%.** The runway is not protecting
  anyone and the band ordering is not the right ordering. This is the signal
  that would send the whole decision back.
- **Particle mode is abandoned within a week of the first B1 introduction**,
  measured as the particle queue going unopened after that date. Either 45 is
  too short, or the `cefrLevels` follow-up is urgent rather than optional.
- **A B1 entry that a learner meets in month two is repeatedly easier than
  the A2 entries in month one**, by first-review accuracy. The band is
  measuring coursebook order and nothing else, and intake should switch to
  pure corpus rank with the band kept only for the runway count.

All are computable from `localStorage` given the per-day answered log that
[[session-shape-and-daily-goal]] already requires, except the first, which is
a test.

## Sources

`docs/research/partikelverb/partikelverb-list.md` (Ranking, band
definitions, the shippable-entry ceiling).
`docs/superpowers/specs/2026-08-08-partikelverb-design.md` (SVALex band
distribution, deliverable F2).
[[particle-verb-practice]] (progression, "Progression, and what CEFR can and
cannot do"). [[session-shape-and-daily-goal]] and [[new-vs-review-mix]] for
the pacing constants the 45 is derived from.
Nation, _Learning Vocabulary in Another Language_, on frequency-first
sequencing and coverage. Wozniak, _Twenty rules of formulating knowledge_,
on building from simple to complex — an ordering claim, not a composition
claim.

Where the evidence is thin: the 30-day window and therefore the number 45 are
derived from this app's default pacing and a judgement about habit formation,
not from a study. The direction — a fixed-length protected beginning rather
than a proportion — is well supported; the magnitude is mine. The claim that
CEFR band correlates weakly with cloze difficulty for a two-to-four character
particle is an inference from the exercise design, not a measurement; the
last bullet in "How we would know this was wrong" is how it gets tested.

## Routed to

`qa` — the two test changes above, ahead of the next data batch.
`swedish-linguist` — intake rule, the band-6 backlog target of 60.
`srs-engine` — no change now; owns the `cefrLevels`-on-introductions
follow-up if the lead cuts that ticket.
`frontend-expert` — the Progress page at dataset scale.
`product-manager` — whether the `cefrLevels` follow-up is v1 or later.
