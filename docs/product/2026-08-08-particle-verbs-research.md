# Particle verbs (partikelverb) — feasibility and scope — 2026-08-08

Owner: `product-manager`. Research note plus the human's shape decisions.
Not yet a binding spec; no implementation is authorised by this document.

## 0. Recommendation

**Conditional go, on the medium variant, third in the queue.**

Build particle verbs as a **separate mode with its own stable slug ids**,
starting at **40 entries**. Not as extra rows in `VERB_DATA`.

The human has since settled the shape (section 0a). What remains conditional:

1. `learning-designer` rules on the one open pedagogy question — rotating
   contexts versus a single fixed sentence per entry (6.5) — before content
   authoring starts, because it sets the size of the authoring job.
2. `swedish-linguist` has authored and verified all 40 entries, glosses and
   sentences included, **before** any card work begins. Content is the long
   pole, not the code.
3. It is sequenced after the session/queue work and after the id migration
   plus CSV coverage. Not blocked by them technically — see section 5 — but
   below them in value per unit of effort.

**Runner-up: add particle verbs as ordinary rows in `VERB_DATA`** (variant A
in section 4). It is by far the cheapest to build and it is the only variant
that does not teach the thing the learner needs. Rejected in section 3.2.

## 0a. Decided by the human

These are settled and are not reopened by this note.

- **Separate mode, not a mixed queue.** Particle verbs do not interleave with
  conjugation items and do not draw on the conjugation daily budget.
- **Two exercise formats:** cloze with the **particle blanked** in a verified
  example sentence, and **meaning-to-phrase recall** (English gloss → Swedish
  particle verb).
- **Lexical-unit-first: no conjugation in v1.** A particle verb is taught as a
  single lexical unit. Its four conjugated forms are not scheduled.

Consequences of these three, worked through in the sections below: the item
count is **two per entry, so 40 entries is 80 SRS items** (6.2); the frontend
scope grows by a mode entry point and a second due count (4, variant B); and
the meaning-to-phrase direction creates a new content constraint on gloss
authoring (7.6).

## 1. What the app does today

One practice mode. The SRS holds one item per (verb, form) pair across four
forms, and the card asks the learner to fill in the missing conjugated form.

- `src/hooks/useSrsProgress.ts:83-95` builds items as
  `${verb.id}-${form}` for `['presens','preteritum','supinum','imperativ']`.
- `src/lib/verbs.ts:22-27` derives `verb.id` from `String(index + 1)` — the
  array index of `VERB_DATA`. This is the known id fragility.
- `src/components/PracticeCard.tsx` renders the pattern, grades with one
  exact string comparison at line 87, and passes grade 5 or 0.
- `src/pages/Practice.tsx:108-117` renders exactly one card component. There
  is no notion of a card _type_, and no notion of a _mode_ above the card.

Two facts that bear directly on this proposal:

**1.1 There are no particle verbs in the data, at all.** Not in the shipped
`VERB_DATA` (~50 rows) and not in `public/data/swedish_verbs.csv` (~1537
rows). Grepping the CSV for `bygga upp`, `höra av`, `tycka om`, `komma ihåg`,
`slå på`, `stänga av`, `ta reda på`, `känna igen`, `se ut` returns zero rows.
The CSV does contain reflexives (`te sig`, `närma sig`, `bosätta sig`,
`förlita sig`) and spelling variants (`ta (el. taga)`), which is a different
category. **Every particle verb entry is net-new authored content.** There is
no extraction shortcut.

**1.2 The example-sentence surface the proposal wants to build on does not
exist.** `getExampleSentence` (`src/lib/verbs.ts:145-171`) is a hardcoded
object covering three verbs — `vara`, `ha`, `gå` — with a literal fallback:

```ts
return examples[infinitive]?.[form] || `[Example with ${form}]`;
```

For the other ~47 shipped verbs the learner would be shown the string
`[Example with presens]`. It is invisible today only because
`showExamples` defaults to `false` (`src/hooks/useSettings.ts:14`). This is a
pre-existing defect worth its own ticket regardless of this feature.

The relevant consequence for scoping: sentences are not a thing the app has.
They are a thing this feature would have to introduce, own, and fill.

## 2. Is this the right feature for this product

**Yes on value, qualified on timing.**

**2.1 Particle verbs are not a nice-to-have in Swedish.** They are among the
highest-frequency constructions in spoken Swedish and a well-known plateau:
a learner can hold correct morphology across all five conjugation groups and
still fail to understand `hör av dig`, `ta reda på`, `hålla på med`,
`ge upp`, `se ut`, `komma på`. Their meanings are largely non-compositional,
so they cannot be derived from the parts the learner already knows. That is
exactly the profile of material that spaced repetition serves well and that
textbooks serve badly.

**2.2 It does not dilute the core loop, because it is a different loop.** And
that is the whole finding — the one the human's lexical-unit-first decision
now encodes. The morphology of a particle verb is free: if the learner knows
`bygga → bygger / byggde / byggt`, then `bygga upp → bygger upp / byggde upp
/ byggt upp` costs nothing. The particle never inflects. The difficulty is
entirely **which particle, and what the pair means** — a lexical and semantic
problem, not an inflectional one.

So the instinct that example sentences are the right vehicle is correct, and
it is correct for a reason worth stating: meaning-in-context is the only
surface on which a particle verb is actually hard. A conjugation drill over
particle verbs would be a drill the learner passes without knowing the answer,
which the pedagogy red lines already name as the cardinal sin
(`docs/learning/2026-08-08-ux-pedagogy-red-lines.md`, P2/P4/P14 — anything
that lets the learner answer without retrieving "feeds the scheduler a lie").

**2.3 It fits the two-minute phone session.** A cloze sentence with a
one-or-two-word answer is the same interaction cost as a conjugation card.
The separate-mode decision means the learner chooses which two minutes they
spend, which keeps the unit of use intact rather than lengthening a session.

**2.4 It needs no backend.** Local data, local SRS. No constraint violated.

## 3. Why not the cheap version

**3.1 The morphology is already covered.** Section 2.2, and now settled by the
lexical-unit-first decision.

**3.2 The current card would give the answer away.** `generateVerbPattern`
(`src/lib/verbs.ts:104-111`) renders the sibling forms with the target
blanked. For `bygga upp` preteritum the learner sees roughly
`bygga upp – bygger upp – _____ – byggt upp`. The particle is visible three
times; the stem is visible three times. This is P2's objection at its most
extreme.

**3.3 It would multiply the id-migration blast radius.** Particle verbs sorted
into the existing CEFR-ordered table would interleave with existing rows,
shifting every downstream array index and silently repointing every stored SRS
key. Appending them at the end avoids that but produces a table whose order no
longer matches its own CEFR sort, which `new-vs-review-mix` relies on for new
item ordering ("new items sorted by verb order, which is CEFR-ascending").

**3.4 Audio is a live correctness risk.** In a particle verb the particle
carries the stress — this is what distinguishes the particle reading from the
prepositional one. `speakSwedish` (`src/lib/speech.ts`) hands a string to the
browser's TTS and has no control over prosody, so a two-word string may well
be spoken with the wrong stress pattern. Under "wrong Swedish is worse than
missing Swedish", audio for particle verbs is off by default until
`swedish-linguist` has listened to the actual output on the target device and
signed off. This is a question for the linguist, not a ruling by me.

## 4. Scope variants

### Variant A — particle verbs as ordinary verb rows (minimal)

Add rows to `VERB_DATA`; everything else unchanged.

|         |                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Effort  | Small. Data only.                                                                                                                      |
| Files   | `src/data/verbData.ts`                                                                                                                 |
| Risk    | Id migration blast radius (3.3); teaches morphology the learner has (2.2); answer visible on the card (3.2)                            |
| Verdict | **Rejected.** Cheapest to build, only variant that does not teach the target skill. Also ruled out by the lexical-unit-first decision. |

### Variant B — dedicated particle-verb mode (medium) — RECOMMENDED

A separate mode with its own item types. Each entry is a particle verb with a
stable slug id, a CEFR band, an English gloss, and at least one verified
Swedish example sentence with a marked particle span. Each entry yields **two
SRS items**: a cloze item (sentence with the particle blanked) and a
meaning-to-phrase item (gloss → full Swedish particle verb). Items live in the
same SRS store under a disjoint key namespace and are graded by the same 5/0
scale.

|              |                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Effort       | Medium, and larger than the mixed-queue version would have been: a separate mode needs its own entry point, its own due count and its own daily budget.                                                                                                                                                                                    |
| Files        | new `src/data/particleVerbData.ts` + `src/lib/particleVerbs.ts` (`swedish-linguist`); `src/hooks/useSrsProgress.ts` or a sibling hook (`srs-engine`); new `src/components/ParticleClozeCard.tsx` and `ParticleRecallCard.tsx`, plus `src/pages/Home.tsx`, `Practice.tsx`, `Settings.tsx`, `Progress.tsx` (`frontend-expert`); tests (`qa`) |
| Content cost | **The long pole.** 40 entries × (gloss + 1–3 verified sentences), all human-authored. Nothing to mine.                                                                                                                                                                                                                                     |
| Item count   | 80 SRS items at 40 entries, two per entry                                                                                                                                                                                                                                                                                                  |
| Storage      | Additive keys only, no rewrite of existing keys — see section 5                                                                                                                                                                                                                                                                            |
| Risk         | Content authoring capacity; sentence memorisation (6.5); gloss ambiguity in the recall direction (7.6)                                                                                                                                                                                                                                     |
| Verdict      | **Recommended, at 40 entries.**                                                                                                                                                                                                                                                                                                            |

Start at 40 and stop. Forty core particle verbs cover the constructions a
learner meets daily; the marginal value of entries 41–200 is far lower than
the marginal value of the ~1487 base verbs still sitting unshipped in the CSV.

### Variant C — full CEFR A1→C1 progression tracks (large)

Hundreds of entries, a per-level track UI, and multiple exercise types
including word-order placement.

|         |                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Effort  | Large. Hundreds of verified sentences; a second progression system beside the SRS.                                                                                                               |
| Risk    | Content authoring alone outlasts the attention span of the project; "tracks" duplicates scheduling the SRS already does; A1 particle verbs barely exist, so the low end of the ladder is padding |
| Verdict | **Rejected as a starting point.** This is where B goes if B proves out, not where we begin.                                                                                                      |

## 5. The sequencing finding that matters

**Variant B is not blocked by the verb-id migration**, and this is the most
useful thing in this note. The separate-mode decision strengthens it further.

The id migration blocks _growing `VERB_DATA`_, because those ids are array
indices. A new item type with its own stable string ids — `pv:tycka-om:cloze`
and `pv:tycka-om:recall` rather than `47-presens` — never touches that scheme.
New keys are added to the same `items` map; no existing key is renamed, moved
or rewritten.

`parseStoredProgress` (`src/hooks/useSrsProgress.ts:43-55`) takes the items
map as-is, and `getDueItems` iterates over verbs rather than over stored keys,
so unknown keys are ignored and preserved. An older build reading a newer
store keeps the particle keys harmlessly; a newer build reading an older store
just finds none. **No storage version bump and no forward migration are
required**, provided the namespace is genuinely disjoint. `staff-engineer`
must confirm that reading, and the human still signs off per the standing
rule, but the answer being asked for is "additive, no rewrite".

There is a bonus: doing this correctly makes particle verbs the **pilot for
the stable-slug id scheme** that `VERB_DATA` needs anyway. The id migration
gets a working precedent instead of a design argument.

**Where it still belongs third.** Per unit of learner value, the CSV
extraction dominates. There are ~1487 base verbs already written down and
already CEFR-tagged, versus 40 particle verbs that must be authored sentence
by sentence. And both are downstream of the queue work: the first session of a
new install is still ~175 cards
(`docs/learning/new-vs-review-mix.md` — "the app's first screen is the
abandonment screen"). Adding a second mode to an app whose first mode is
abandoned buys nothing. Recommended order: **queue and session shape → id
migration and CSV coverage → particle verbs**.

## 6. Pedagogy questions

**6.1 Cloze target — SETTLED.** The particle is the blank
(`Han slog ___ radion` → `på`). This isolates the actual difficulty and keeps
the answer to one or two characters on a phone.

**6.2 Recall direction — SETTLED.** Both directions ship: cloze
(sentence → particle) and meaning-to-phrase (gloss → full particle verb), as
two separately scheduled items. The cost is that 40 entries produce 80 items,
which `srs-engine` must account for in the mode's daily budget.

**6.3 Queue integration — SETTLED.** Separate mode. Particle items do not
interleave with conjugation items and do not draw on the conjugation
`dailyGoal` or `newAllowedToday`. `learning-designer` still needs to say what
the particle mode's own budget is; my recommendation is that it reuses the
same minutes-per-day derivation rather than inventing a second knob.

**6.4 Is the base verb's conjugation ever tested — SETTLED.** No, not in v1.
Lexical-unit-first.

**6.5 Sentence memorisation — STILL OPEN, and now the only blocker.** With one
fixed sentence per entry, spaced repetition will teach the learner the string
pair `Han slog ___ radion → på` without teaching the verb. Rotating 2–3
contexts per entry defends against this and multiplies the linguist's
authoring cost by 2–3×. This needs an explicit decision **before** content
authoring starts, because it is the difference between 40 sentences and 120.
The recall item partially hedges the risk — a learner who has memorised the
sentence still has to produce the phrase cold from the gloss — which is an
argument for accepting one sentence per entry in v1 and revisiting.

## 7. Open questions for `swedish-linguist`

**7.1 Which 40.** Frequency-ranked core particle verbs for a self-study
learner, with the English gloss and the CEFR band.

**7.2 CEFR bands are authored judgment here, not a lookup.** The existing
CSV's levels came from a source; there is no equivalent source per particle
verb, and the band of a particle verb is not the band of its base verb
(`bygga` is early; `bygga upp` in its figurative sense is not). The linguist
should assign bands they are willing to defend, or decline and give frequency
tiers instead. My recommendation is to reuse the existing CEFR filter with
coarse bands (A2/B1/B2) rather than invent a second taxonomy for one feature —
but the honesty constraint outranks the convenience, so if the bands would be
guesses, say so and we use tiers.

**7.3 Particle verb versus the corresponding compound verb.** Pairs such as
`bryta av` / `avbryta` and `sätta in` / `insätta` exist with related but not
always identical meanings and registers. Does an entry need to disclose the
compound, and is showing both on one card confusing?

**7.4 Word order.** Object placement relative to the particle, and pronoun
objects specifically, differ from English. Out of scope for v1 (section 9),
but the linguist should say whether any of the 40 entries is actively
misleading without a word-order note.

**7.5 Audio.** Section 3.4. Does browser TTS produce acceptable stress on
these two-word strings on the target device, and if not, is audio disabled for
particle items?

**7.6 Gloss ambiguity — new, created by the meaning-to-phrase decision.** An
English gloss can have more than one correct Swedish particle verb: "get in
touch" admits `höra av sig`, "find out" admits both `ta reda på` and
`få reda på`. A recall card that marks a defensible answer wrong teaches the
learner a fiction, which is the standing red line. Two ways out, and the
linguist picks: author glosses narrow enough to select exactly one phrase, or
give each recall item an accepted-answer set under the policy already ruled in
`2026-08-08-alternate-answers-decision.md` (P1/P2). I lean on the accepted-set
route, because narrowing glosses tends to smuggle the Swedish structure into
the English prompt and hand the learner the answer.

## 8. Dependencies by role

| Role                | Needs to deliver                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `learning-designer` | 6.5 (rotating contexts) and the particle mode's own daily budget (6.3), before any implementation              |
| `swedish-linguist`  | All 40 entries with verified sentences and glosses; 7.1–7.6; owns `particleVerbData.ts` and `particleVerbs.ts` |
| `srs-engine`        | Slug id namespace, two item types per entry, the separate mode's queue and budget                              |
| `staff-engineer`    | Confirms the additive-keys reading in section 5; reviews the separate-mode shape before merge                  |
| `frontend-expert`   | `ParticleClozeCard`, `ParticleRecallCard`, mode entry point on Home, Settings toggle, Progress display         |
| `devops`            | Bundle budget for sentence data (trivial at 40, not at 400)                                                    |
| `qa`                | Test plan; regression risk that Home and Practice now carry two modes                                          |

## 9. Explicitly out of scope for v1

- **Word-order and object-placement drills** (7.4). Different skill, different
  card.
- **Conjugating particle verbs.** Settled: lexical-unit-first. If it is ever
  wanted, it is a follow-up, not a v1 cut.
- **More than 40 entries.** Follow-up, gated on the first 40 being used.
- **Fixing `getExampleSentence`** (1.2). Real defect, its own ticket, must not
  be smuggled into this feature's PR.
- **Free-text English meaning answers** (learner types the English). Grading
  that needs fuzzy matching, ruled out of scope in
  `2026-08-08-alternate-answers-decision.md` section 6. Note this is the
  reverse of the settled meaning-to-phrase format, where the learner types
  Swedish and the gloss is the prompt — that one is in scope.

## 10. What needs the human

The shape questions are answered (section 0a). One decision remains.

**Content budget.** Forty particle verbs with verified glosses and sentences
is real linguist time, spent instead of on extracting the ~1487 CSV verbs
already written down. Both cannot be first. My recommendation is CSV coverage
first because it is more learner value per hour, but if the human's own
Swedish gap is particle verbs specifically, that preference beats my
arithmetic — this is a product with one known learner and their felt need is
data.
