# Discrimination card (TOEFL-style particle choice) — readiness spec — 2026-08-12

Owner: `product-manager`. This spec does not authorise UI work. It records
what blocks the feature, and it asks for one decision that unblocks it.

## 0. Decision

**The feature is already designed. Do not spec it again. Build the data and
the two prerequisites first, and do not open a frontend ticket yet.**

The requested exercise — a Swedish sentence with one blank, four particle
options, one correct — is the discrimination variant ruled in
`docs/learning/2026-08-08-discrimination-exercise.md` (#319) and amended into
`docs/superpowers/specs/2026-08-08-partikelverb-design.md`. The human proposed
that format and signed it off. Every parameter the request asks for is already
fixed there: option count, distractor source, trigger, credit path.

The feature does not ship today for three reasons, in order of cost:

1. **The build gate is closed, and the count is zero.** The gate needs at
   least 8 certified frames across at least 5 distinct verbs. A certified
   frame is one example sentence whose `excludedParticles` list holds at least
   3 particles. `src/data/particleVerbData.ts` ships annotations on 7 verbs,
   and the longest list holds 2 particles. So the corpus currently has **0**
   certified frames. Section 3 gives the counts.
2. **The scheduler cannot yet grade a choice answer.**
   `src/hooks/useSrsProgress.ts:490` accepts `modality` and discards it on the
   next line (`void modality;`). `src/lib/srs.ts` does not mention modality at
   all. The weaker-credit path is unwritten code.
3. **The falsifiers have nothing to read.** The ruling depends on pooled and
   per-frame choice accuracy. No per-answer log exists. Without it the two
   data-defect tripwires are decorative.

**Runner-up: build the card now against the 7 partly annotated frames, with
3 options instead of 4.** It lost on process, not on merit — the option count
is a `learning-designer` parameter and I may not change it. Section 5 makes
that case as an open question, because the external research favours it and it
would open the gate at once.

## 1. Correction to the request as framed

The request asked for a card that forces the learner to choose "BOTH the
correct particle verb AND its correct form". The second half is out of scope
by a settled decision, not by a cut in this spec.

Particle verbs are taught lexical-unit-first
(`docs/product/2026-08-08-particle-verbs-research.md`, section 0a): v1 does
not schedule the conjugated forms of a particle verb, because the morphology
is free once the base verb is known. Every example sentence in the corpus is
presens for that reason. A card that tested form as well as particle would
test one thing the learner already has, and it would let a learner pass by
rejecting three options on shape alone.

The request also described the distractors as whole particle verbs
(`ta med` against `ta ut`, `ta emot`, `ta av`). The ruling reaches the same
place through the blank: the blank is the particle only, so all four options
complete the same base verb and the learner does read four competing particle
verbs. The rendering differs, the discrimination does not.

## 2. What the app does today

- `src/pages/PracticeParticles.tsx` runs the particle mode. It renders one
  component, `ParticleVerbCard`, for every card in the sitting.
- Line 86 states the current position in a comment: `'typed' is the only
  modality particle items use in v1`.
- `src/lib/particleQueue.ts` builds the sitting. Card kinds today are the
  introduction, the cloze and the recall card.
- `src/data/particleVerbData.ts:60` already declares the field the variant
  needs: `excludedParticles?: string[]` on a `ParticleVerbExample`. The field
  is optional, and an absent field means the frame never renders as a
  discrimination card.
- `src/data/particleVerbData.test.ts:351` guards the field. It asserts that no
  excluded particle also appears in the same entry's `acceptedParticles`, and
  it fails if the dataset ships no annotation at all.

Nothing renders options. Nothing branches on modality. The variant is data and
two engine changes away from possible, and no further product design.

## 3. The gate count, frame by frame

Counted from `src/data/particleVerbData.ts` on 2026-08-12. Every entry below
is `verified: true`.

| Entry        | Excluded particles authored | Frames annotated | Certified at 3 distractors | Eligible at 2 distractors |
| ------------ | --------------------------- | ---------------- | -------------------------- | ------------------------- |
| `komma ihåg` | `in`, `fram`                | 3 of 3           | 0                          | 3                         |
| `lägga ner`  | `in`, `upp`                 | 3 of 3           | 0                          | 3                         |
| `bli av`     | `kvar`, `över`              | 3 of 3           | 0                          | 3                         |
| `stå till`   | `upp`, `ut`                 | 2 of 3           | 0                          | 2                         |
| `tala om`    | `till`                      | 3 of 3           | 0                          | 0                         |
| `ta slut`    | `bort`                      | 3 of 3           | 0                          | 0                         |
| `se om`      | `ut`                        | 3 of 3           | 0                          | 0                         |

**Totals: 0 certified frames across 0 verbs at the ruled 4-option format.
11 eligible frames across 4 verbs if the format drops to 3 options.**

Two readings of that table matter for sequencing.

First, the third distractor is the expensive one. The linguist has already
certified 1 or 2 impossible particles per frame. The certification bar is
"impossible in this exact sentence, and an attested same-base verb" — for many
frames a third particle that clears both halves may not exist. This is not
slow authoring; it may be an authoring ceiling.

Second, even at 3 options the corpus reaches 4 distinct verbs, one short of
the ruled floor of 5. One more annotated verb clears it.

## 4. Recommended sequence

Three tickets, in this order. The first two are independent of each other. No
frontend ticket exists until ticket 1 reports its result.

**Ticket A — `swedish-linguist`: report the third-distractor ceiling.**
Take the 7 annotated entries. For each frame, say whether a third particle
exists that clears both certification halves. Add it where it exists. Where it
does not, say so and give the reason. Add annotations to further entries only
if that is cheaper than extending the existing 7. Deliverable is a count, not
a target: the answer "no frame supports three" is a valid and useful result,
and it decides section 5. Files: `src/data/particleVerbData.ts`. This ticket
does not change any existing accepted particle or any sentence.

**Ticket B — `srs-engine`: implement the modality branch.**
The weaker-credit path is fully specified in the ruling: choice correct leaves
ease unchanged, increments repetitions, and sets
`intervalDays = min(365, max(1, round(intervalDays * min(easeFactor, 1.6))))`;
choice wrong is a full lapse identical to typed wrong. Files: `src/lib/srs.ts`,
`src/hooks/useSrsProgress.ts`. No storage shape change and no version bump: the
branch reads existing fields. The existing test at
`src/hooks/useSrsProgress.particleKeys.test.ts:217` asserts the current
plumb-and-ignore behaviour and must be rewritten by `qa`, not deleted.

**Ticket C — `product-manager` plus `srs-engine`: decide the per-answer log.**
The falsifiers need item id, modality, correct and timestamp per answer. This
is a storage decision with the human in it, and it is deliberately last of the
three: it does not block the card working, only the ability to detect that the
card is wrong. I will write that decision when Ticket A reports, because the
corpus size sets how many samples the log ever has to hold.

## 5. Open question that controls the schedule

**For `learning-designer`: does the option count drop from 4 to 3 if Ticket A
reports that three certified distractors are rare?**

The ruling fixes "exactly 4: never 3, never 5". The external evidence runs the
other way. Rodriguez's meta-analysis of 80 years of research concludes three
options are generally optimal, because the fourth option rarely attracts
anybody and costs test time that is better spent on coverage. Haladyna's
item-writing guidelines make the same point from the other side: a distractor
that does not plausibly attract a learner who lacks the knowledge is not a
distractor, it is padding. Under our own certification bar, the third
distractor is exactly the one most likely to be padding, because the linguist
picks the strongest competitors first.

The product cost of holding 4 is concrete and is now measured: the feature has
0 certified frames and may stay near 0. The product cost of dropping to 3 is
that guessing pays 33% instead of 25%. The credit path already treats a
correct choice as weak evidence, so that difference is partly absorbed.

This is a pedagogy parameter and the ruling is `learning-designer`'s. I am not
changing it. I am reporting that it is currently the binding constraint, and
asking for a ruling conditional on Ticket A's result.

## 6. Acceptance criteria

These bind the tickets above. Card acceptance criteria are already in the
ruling and are not restated here.

1. `src/data/particleVerbData.ts` has no example whose `excludedParticles`
   list contains a particle that also appears in the same entry's
   `acceptedParticles`. Enforced today by
   `src/data/particleVerbData.test.ts:351`.
2. A dataset test reports the certified-frame count mechanically: frames on
   `verified: true` entries whose `excludedParticles` length is at least the
   ruled distractor count. The test asserts the count, so the number moves
   only when someone edits it on purpose. Owner: `qa`.
3. After Ticket B, a correct answer recorded with `modality: 'choice'` leaves
   `easeFactor` unchanged and multiplies `intervalDays` by at most 1.6, and
   the result stays clamped to 365 days. A wrong choice answer produces the
   same state as a wrong typed answer.
4. After Ticket B, no stored key changes shape and `STORAGE_VERSION` stays 3.
   An existing store loaded by the new build produces identical schedules for
   every typed answer.
5. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass on
   each ticket, with output pasted.

## 7. Explicitly out of scope

- **Conjugation inside the choice card.** Section 1. Settled by
  lexical-unit-first, not cut here.
- **Cross-verb near-synonym distractors** (options from a different base
  verb). Deferred by the ruling. Each such option needs an authored reason
  saying why that real verb is wrong in this frame, which is corpus work of a
  different order.
- **A learner-facing setting that turns particle reviews into multiple
  choice.** Forbidden by pedagogy red line 7. The app picks the variant; the
  learner does not.
- **Multiple choice returning to conjugation cards.** Human decision 2 stays
  in force everywhere except this one variant.
- **Multi-blank sentences.** TOEFL Structure items use a single blank, and a
  second blank in a two-minute phone session doubles the reading cost for no
  extra discrimination. Not proposed, and not wanted.
- **New Swedish sentences written to fit the exercise.** The variant reuses
  the existing certified frames. It authors no sentence, and it never derives
  a distractor from a template or a pattern. Only `swedish-linguist` adds a
  particle to an `excludedParticles` list, and only after confirming both
  certification halves by hand.

## 8. Cost

Files that change: `src/data/particleVerbData.ts` (linguist), `src/lib/srs.ts`
and `src/hooks/useSrsProgress.ts` (srs-engine), plus the affected tests (qa).
Data that migrates: none. `excludedParticles` is an existing optional field
and every stored key keeps its shape.

What could break: the schedule of items already in the store, if the modality
branch is written as a change to the shared path instead of a branch on top of
it. Criterion 4 exists for that. The second risk is a lure that is in fact
correct in its frame; that marks correct Swedish wrong, which is the one
failure this feature may not have, and it is why Ticket A is a linguist
ticket and not a data-entry ticket.

## 9. Sources for the item-format research

- Rodriguez, "Three Options Are Optimal for Multiple-Choice Items: A
  Meta-Analysis of 80 Years of Research", Educational Measurement 24 (2005),
  <https://onlinelibrary.wiley.com/doi/10.1111/j.1745-3992.2005.00006.x>
- Haladyna, Downing and Rodriguez, "A Review of Multiple-Choice Item-Writing
  Guidelines for Classroom Assessment",
  <https://site.ufvjm.edu.br/fammuc/files/2016/05/item-writing-guidelines.pdf>
- ETS, TOEFL ITP Structure and Written Expression sample questions,
  <https://www.itp-calculator.com/know-your-test/structure-and-written-expression/part-a.html>
