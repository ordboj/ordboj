# Discrimination exercise: cloze variant, weaker credit, data-gated

**Question (#319):** Ordböj will offer a TOEFL-style discrimination exercise
for particle verbs: the cloze sentence with the particle blanked, and the
learner picks among four close options instead of typing. What exactly is it,
how is it scheduled, how is it credited, and when is it built?

This note is the pedagogy ruling. The spec amendment lives in
`docs/superpowers/specs/2026-08-08-partikelverb-design.md` (Human decisions,
item 2, and the Amendment section).

## Human sign-off

Spec human decision 2 said: "Both typed. No multiple choice in v1." The human
proposed this discrimination format themselves during the four-owner review of
2026-08-08 and gave explicit sign-off to revise decision 2 for it. The
revision is narrow. Typed cloze and typed recall stay the default and the
majority of every learner's reviews. The discrimination variant is app-chosen,
takes weaker scheduling credit, and ships only after the data gate below is
met. No implementation ticket is cut before this note and the spec amendment
are merged. Decision 2 stays in force for every other surface: multiple choice
does not return to conjugation cards, and the learner gets no setting that
turns particle reviews into recognition drills.

## Decision

The discrimination exercise is a **presentation variant of `pv:<slug>:cloze`**.
Same item id, same SRS state, same sentence, same blank. The app decides
deterministically, per review, whether the item renders as typed cloze or as a
four-option choice. It is **not** a third scheduled item: no new id namespace,
no new stored state, no storage version bump.

| Parameter              | Value                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| item                   | `pv:<slug>:cloze` — a render mode, never a new SRS item                                                           |
| options                | exactly 4: the target particle plus 3 distractors; never 3, never 5                                               |
| distractor source      | the frame's `excludedParticles`, certified per frame by `swedish-linguist`                                        |
| distractor construal   | same-base different-particle: every option completes `<base> ___`                                                 |
| distractor eligibility | particle already introduced (see below)                                                                           |
| distractor pick        | eligible list in authored order; take 3 cyclically from index `(repetitions / 3) % n` when n > 3                  |
| option order           | sort alphabetically (`a.localeCompare(b, 'sv')`), then rotate by `repetitions % 4`                                |
| variant trigger        | eligible AND `repetitions % 3 === 0` — one review in three                                                        |
| eligibility            | target cloze `repetitions >= 3` AND at least 3 eligible distractors                                               |
| ineligible fallback    | render typed cloze as normal; never a reduced option set                                                          |
| commit                 | first option tapped commits, no re-tap ([[2026-08-08-latency-and-attempt-signals]])                               |
| choice correct         | ease unchanged, `repetitions += 1`, `intervalDays = min(365, max(1, round(intervalDays * min(easeFactor, 1.6))))` |
| choice wrong           | full lapse, identical to typed wrong                                                                              |
| modality               | `recordAnswer` gets `modality: 'choice'`; credit branches on it at answer time                                    |
| learner control        | none in v1 — `practiceMode` does not apply to particle items                                                      |
| per-option feedback    | none in v1; standard cloze feedback panel, correct option marked                                                  |
| build gate             | >= 8 certified frames across >= 5 distinct verbs, counted after F2 lands                                          |
| storage                | no shape change, no version bump                                                                                  |

"Introduced", for a distractor particle `p`: at least one particle-verb item
whose `particle === p` has SRS state in the store, i.e. its cloze card has
been presented at least once. A lure the learner has never met is noise, not a
competitor, and it would also teach a new particle inside a test, which is
introduction work done in the wrong place.

The authored `excludedParticles` list may hold more than three particles;
only introduced particles become options, and the card needs at least three
of them.

## Why a variant and not a third item

The discrimination card tests the same fact as the cloze card — which particle
belongs in this frame — under a different retrieval mode. Splitting it into a
scheduled sibling would double the review load per verb, reopen the
sibling-leak problem the cloze/recall separation already manages, and give the
scheduler two histories for one piece of knowledge. The evidence a choice
answer carries differs from a typed answer only in strength, and strength is
what the credit path expresses. So the state stays unified and the modality
carries the difference.

One review in three (`repetitions % 3 === 0`) keeps typed production at
two-thirds of reviews, because production remains the drill (Kang, McDermott &
Roediger 2007) and discrimination is a probe of lure resistance, not a
replacement. The modulus also makes the very first eligible review
(`repetitions = 3`) a discrimination card when the distractors allow it, which
is where particle confusion is most likely and most worth catching. The rule
reads only stored state, uses no randomness, and is therefore reproducible in
tests and identical across devices.

The rotation rules exist for one reason: determinism without position memory.
A fixed alphabetical order would let a learner remember "bottom option" across
reviews of the same frame; rotating by `repetitions % 4` changes the position
every review while staying a pure function of stored state. The distractor
window rotation (`(repetitions / 3) % n` when more than three particles are
eligible) varies the lure set the same way: each successive discrimination
render of the frame — one per three reviews — steps the window by one
particle, so the lure set changes across renders instead of staying fixed.

## Distractors: certified exclusivity, nothing else

A distractor particle must satisfy both halves of the linguist's
certification, recorded per example sentence in an `excludedParticles` field:

1. The particle forms an attested same-base particle verb (`slå av` is real
   Swedish), so the option is a genuine competitor rather than a shape the
   learner can reject on form alone — the same standard P14 of
   [[2026-08-08-ux-pedagogy-red-lines]] sets for conjugation distractors.
2. The particle is impossible in this exact sentence. Not unusual, not
   awkward: impossible. A frame where two particles are defensible cannot
   appear as a discrimination card with both as options; the ambiguity either
   gets authored out of the frame or the particle stays off the excluded list.

This is the "wrong Swedish is worse than missing Swedish" rule applied to
lures. A lure that is actually correct in the frame marks correct Swedish
wrong, which is the one failure this design must not have; the falsifier
section below is the tripwire for it.

**Deferred: cross-verb near-synonym distractors** (options drawn from other
base verbs with close meanings). That shape needs a per-option rejection
reason on the feedback screen — "why is this real verb wrong here" — because
the rejection is semantic rather than combinatorial, and authoring those
reasons is corpus work of a different order. It goes in a later revision with
its own certification pass. Nothing in this ruling precludes it; the option
model just gains a reason string per distractor when it comes.

Against the red lines: red line 7 forbids multiple choice as the default or as
an easier tier that schedules identically. Neither applies. The app picks the
variant for one review in three, the learner gets no switch, and the credit path
is strictly weaker. P15's "accessibility fallback" framing also does not apply,
because there is no learner-facing mode to fall back to.

## Credit: the weaker path, and the srs-engine handoff

Choice answers take exactly the weaker-credit path the particle-verb note
specified in advance:

```
typed correct  : easeFactor += 0.05 (ceiling 2.80), repetitions += 1, normal interval
choice correct : easeFactor unchanged,              repetitions += 1,
                 intervalDays = min(365, max(1, round(intervalDays * min(easeFactor, 1.6))))
choice wrong   : full lapse, identical to typed wrong
```

Both paths still clamp to `MAX_INTERVAL_DAYS = 365` (`srs.ts:46`); the 1.6 cap
does not remove the existing hard interval ceiling.

Recognition success is weaker evidence than production success, so it advances
the interval at a capped multiplier and earns no ease. A wrong choice is a
full lapse because failing a four-option recognition test is worse evidence
than failing production, not better. The credit attaches to how the item was
answered (`modality` at `recordAnswer`), never to a settings value, so no mode
switch can reinterpret history.

**Handoff rule:** the spec currently declares `modality` plumb-and-ignore —
recorded, never branched on. The moment this variant ships, that stops being
true: the scheduler branches on modality. Therefore `srs-engine` is notified
before any related provider work starts, and the modality branch in
`calculateNextReview`/`recordAnswer` is an `srs-engine` ticket that lands
before or with the first frontend work on the variant, never after. The lead
owns cutting that ticket when the build gate opens.

## Build gate: data, not calendar

Work starts when the corpus contains **at least 8 certified frames across at
least 5 distinct verbs**, counted after the F2 additions land. A certified
frame is an example sentence on a `verified: true` entry whose
`excludedParticles` list has at least 3 particles, both certification halves
confirmed by `swedish-linguist`. The distinct-verb floor exists so the variant
is a feature of the mode, not of one verb. The F6 dataset-integrity test
counts the frames mechanically (`verified: true` and
`excludedParticles.length >= 3`). It cannot confirm either certification
half; `swedish-linguist` still certifies attestedness and impossibility by
hand, and the gate opens only after that pass.

Below 8, the feature has too little surface to measure the falsifiers against,
and the certification cost per frame is better spent widening the corpus.

## How we would know this was wrong

These thresholds are not measurable today. [[2026-08-08-latency-and-attempt-signals]]
establishes only a disposable latency ring buffer (`swedish-verbs-stats`,
`version: 1`, 100 samples, safe to drop) and records "attempts persisted: no";
it rejected a per-answer review log as the runner-up. `SrsState` keeps no answer
history at all. A per-answer record — item id, modality, correct, timestamp — is
therefore a hard prerequisite of every falsifier below. That record needs its own
decision and a store change; the lead cuts it to `product-manager` and
`srs-engine` when the build gate opens, and it lands before the variant ships.
Until it exists, the thresholds are checked by hand from a manual sample and
bind nothing automatically.

- **Pooled discrimination accuracy above ~90%** over the trailing 30 choice
  answers: the lures are not competitive and the card is a scheduled gift that
  inflates intervals. Response: `swedish-linguist` raises lure quality
  (prefer higher-frequency, semantically closer particles); if a frame cannot
  support three competitive lures, it drops out of certification and the item
  reverts to typed-only.
- **Per-frame accuracy below ~50%** after at least 5 choice answers, while the
  same verb's typed-cloze accuracy is above 80%: the learner knows the verb
  and the card still fails, so the prime suspect is a lure that is in fact
  correct in the frame — the data is wrong, not the learner. Response: pull
  the frame from discrimination rotation immediately (typed-only), file a
  data defect to `swedish-linguist`, and grade nothing on that frame's choice
  history until the frame is re-certified.
- **Choice-mode reviews lapse at typed-mode rates or below on their next typed
  review**: the 1.6 cap is too conservative and is over-scheduling reviews;
  raise the cap toward 1.8 before touching ease.

## Routed to

`swedish-linguist` — `excludedParticles` authoring and certification, both
halves; lure-quality revisions when the >90% falsifier fires.
`srs-engine` — the modality branch (weaker-credit path), notified before any
provider work; the deterministic variant/distractor/order rules, which read
only `repetitions`.
`frontend-expert` — the four-option render of the existing cloze card,
first-tap commit, standard feedback panel.
`qa` — determinism tests (same state in, same card out), the certified-frame
count in the dataset-integrity test, credit-path tests.
`product-manager` — sequencing of the cross-verb near-synonym revision if ever
wanted.
`product-manager` + `srs-engine` — the per-answer log (item id, modality,
correct) that every falsifier needs; prerequisite, not an assumption.
