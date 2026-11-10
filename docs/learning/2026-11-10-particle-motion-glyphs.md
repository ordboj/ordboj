# Particle motion glyphs on the particle feedback screen

Linear ORD-116 (GitHub #531).

## Decision

A motion glyph shows only on the particle feedback screen. It sits in the same
row as the sense line, to the left of the text. It never replaces the sense
line. It shows after a correct answer and after a wrong answer. It always shows
the glyph of the correct particle, never the glyph of the learner's answer. It
starts in the same frame as the feedback. It plays once for 700 ms, with no
delay. The learner taps it to play it again. It never loops and never disables
a control. Under reduced motion it shows the rest frame only, and it is not a
button. Confetti does not fire on a feedback screen that shows a glyph. An
entry gets a glyph only when it passes all six gates in "Eligibility" below.
The last gate is a human flag, `motionGlyphVerified: true`. The default is no
glyph. An entry whose accepted particles map to more than one glyph, or to no
glyph, gets no glyph. The glyph on the introduction card is deferred, not
rejected.

## Question

How does a six-glyph motion aid for particle meaning appear on the particle
card, and which entries get one, so that it helps meaning recall and does not
inflate grades or delay feedback?

## Settled before this note

The human approved these points. This note works inside them.

1. The goal is meaning recall, not form recall.
2. The animation is required.
3. Six glyphs: `upp`, `ut`, `in`, `ner` (`ned` is an alias), `bort`,
   `tillbaka`.
4. CSS keyframes only. The base style is the complete rest frame with a faint
   path trace. The keyframes define only the start state.
5. Out of scope: idiomatic entries, other particles, per-verb assets, raster or
   video, animation libraries, A/B telemetry, text in a glyph, a settings
   toggle.

## What the app does today

The feedback screen already has a text sense line. The card builds it once and
uses it in two places: the introduction card and the graded feedback panel.

```236:243:src/components/ParticleVerbCard.tsx
  const senseLine = coreSense && (
    <p className="text-sm text-muted-foreground text-center">
      <span lang="sv" className="font-semibold">
        {entry.particle}
      </span>{' '}
      — {coreSense}
    </p>
  );
```

The introduction card renders it at line 273. The feedback panel renders it at
line 505. The glyph goes in the feedback panel only. The engineer must not add
the glyph to the shared `senseLine` constant, because then it also appears on
the introduction card.

Confetti fires on every correct answer, in the same handler that opens the
feedback.

```166:173:src/components/ParticleVerbCard.tsx
  const handleSubmit = useCallback(
    (answer: string) => {
      const correct =
        kind === 'recall' ? isAcceptedRecall(entry, answer) : isAcceptedParticle(entry, answer);
      setIsCorrect(correct);
      setSubmittedAnswer(answer);
      setShowFeedback(true);
      if (correct) setShowConfetti(true);
```

`handleChoice` does the same at line 194. This already conflicts with P8 of
[[2026-08-08-ux-pedagogy-red-lines]], which reserves confetti for lapse
recovery and end of goal.

The global reduced-motion rule sets every CSS animation to 0.01 ms and one
iteration (`src/index.css`, lines 104–113). A glyph whose base style is the rest
frame therefore shows the rest frame at once. No glyph-specific code is needed
for the picture. The replay control is a different matter: under this rule a
tap does nothing visible.

The sense strings are in `PARTICLE_CORE_SENSE` (`src/lib/particleVerbs.ts`,
lines 193–247). Five of the six glyph particles have a spatial line. `upp` does
not:

```194:194:src/lib/particleVerbs.ts
  upp: 'often completion, or making something visible or available',
```

The entry type has the fields the gate needs: `transparency`, `contrast?`,
`acceptedParticles` and `verified` (`src/data/particleVerbData.ts`, lines
113–127). There is no `motionGlyphVerified` field yet. It is a static data
field, not a `localStorage` field. It needs no storage migration.

## Evidence

**Dual coding.** A meaning held as both a word and a picture is easier to
retrieve than a meaning held as a word only (Paivio 1986; Clark & Paivio 1991).
This is the reason for the glyph. The effect is strongest for concrete,
imageable meanings. A literal spatial particle is concrete. An aspectual `upp`
(`äta upp`) is not.

**Pictures help meaning, not form.** Boers, Piquer Píriz, Stengers & Eyckmans
(2009) found that pictures helped learners recall the meaning of idioms, and did
not help them recall the form. For some learners the pictures took attention
from the form. That is the reason for the goal "meaning recall", and the reason
the glyph never shows before the learner produces the form.

**Animation is not better than a good still.** Tversky, Morrison & Bétrancourt
(2002) reviewed the studies. When an animation and a still carry the same
information, the animation usually does not teach more. The few gains came
from animations that carried more information. So the rest frame must carry the
complete meaning, and the motion adds only the direction. A learner with
reduced motion then loses nothing that teaches.

**Transience costs memory.** Ayres & Paas (2007) describe the transient
information effect. Information that disappears must be held in working
memory, and that adds load. A one-time animation is transient. The complete
rest frame and the replay tap are the two remedies, so this note requires both.

The evidence for the glyph's size of benefit is thin. The dual-coding studies
mostly use word lists. Boers et al. used idioms and university learners. No
study tests six abstract SVG paths beside Swedish particle verbs on a phone. The
direction is defensible. The size is unknown.

## Options and their cost to the learner

**Glyph on the feedback screen only (chosen).** The learner retrieves the form
first, then sees the meaning picture. The glyph cannot help the learner answer,
so the grade stays honest. Cost: the glyph appears only after the learner has
already answered, so it helps the next retrieval, not this one.

**Glyph on the prompt.** Rejected. The glyph tells the learner the particle. On
a binary 0|5 grade, that is a free correct answer. This breaks red lines P2 and
P7.

**Glyph instead of the sense line.** Rejected. The sense line names the
non-spatial senses of the particle. The glyph shows only one spatial sense. A
learner who sees only the glyph learns that `upp` means "up" and nothing else.

**Glyph on the introduction card too.** Deferred. See decision 8.

## Rules

### 1. Placement

- The glyph shows only in the graded feedback panel (`showFeedback === true`)
  of a cloze, recall or discrimination card.
- It never shows on a prompt, on the introduction card, or on any screen
  before the grade.
- It sits in the sense-line row, to the left of the sense text. The row is a
  flex row, centred.
- The glyph box is 44 × 44 CSS px. This is the minimum touch target.
- The sense line stays. Its text does not change because of the glyph.
- The glyph uses the neutral foreground colour. It never uses the success
  colour or the destructive colour. It must look the same after a correct
  answer and after a wrong answer.
- The glyph contains no text.

### 2. Correct and wrong answers

The glyph shows after both. It always shows the correct particle
(`entry.particle`, through the alias map).

Reason: after a wrong answer, the meaning of the correct particle is what the
learner needs most. Errors followed by feedback are learned well (Metcalfe
2017, cited in P21). A glyph only after correct answers would turn a meaning
aid into a reward, and it would remove the aid from the screen that needs it.

Conditions:

- On a wrong answer, the "Not quite" marker and the correct form keep their
  present size and position. The glyph is below them, in the sense-line row.
  P3 holds.
- On a discrimination card, the glyph of the tapped lure never shows. The
  lure gloss line (`chosenLureEntry`) stays text only.
- On a typed wrong answer, the glyph never shows for the particle the learner
  typed.

Runner-up: correct answers only. It lost because it removes the meaning
picture from the one screen where the learner did not have the meaning.

### 3. Play once, tap to replay

- The glyph plays once when the feedback panel mounts. Iteration count is 1.
- It does not play again on a re-render of the same feedback panel (for
  example, after "Pronounce sentence").
- A tap on the glyph plays it again from the start state. A tap during play
  restarts it.
- There is no replay limit.
- The glyph never loops.
- No control is disabled, hidden or delayed while the glyph plays. "Next
  Card" works from the first frame. A tap on "Next Card" during play advances
  at once.
- The glyph does not take focus. Focus stays where it is today.

### 4. Duration

| Parameter                              | Value                     |
| -------------------------------------- | ------------------------- |
| Main animation duration                | **700 ms**                |
| Start delay after the feedback renders | **0 ms**                  |
| Easing                                 | `ease-out`                |
| Stagger of one secondary element       | delay **100 ms** or less  |
| Latest end of any keyframe, design     | **900 ms** after render   |
| Hard cap, including every delay        | **1500 ms** after render  |
| Iterations                             | **1**                     |

The hard cap applies to `animation-delay + animation-duration` of every
animated element in the glyph. A test can check that sum against 1500 ms. A
glyph that needs more than 900 ms is a design defect, even below the cap.

Reason for 700 ms: it is long enough to read a direction. It ends before a
typical learner reads the correct form and moves to the sense line. The glyph
starts with the feedback, so it never delays the feedback. P1 holds.

### 5. Reduced motion

- Under `prefers-reduced-motion: reduce`, the global rule in `src/index.css`
  shows the rest frame. The glyph needs no extra CSS for this.
- Under reduced motion, the glyph is **not** a button. It has no `onClick`, no
  `tabIndex`, no pointer cursor and no focus ring. It is `aria-hidden="true"`.
- With motion allowed, the glyph is a `<button type="button">` with an
  accessible name, for example `Replay movement: upp`.
- The card reads the media query when the feedback panel mounts, as
  `ConfettiEffect.tsx` does. A change of preference during one card does not
  need to update that card.
- In both modes the sense line carries the meaning in text. A screen-reader
  user loses nothing.

A focusable control that does nothing visible is a dead control. It is not
allowed.

### 6. Glyph and confetti

**On a feedback screen that shows a glyph, confetti does not fire.** The
condition is the glyph gate of rule 9, not the answer. Confetti on the other
particle cards is unchanged by this note.

Reason: two motions at the same moment compete for the same attention, and
the confetti covers the glyph. Delaying the glyph until confetti ends is a
second interruption, and the glyph then plays when the learner already reads
the next line. Delaying confetti is also a second interruption.

Known cost: on glyph cards, a correct answer has no confetti, and on other
cards it has confetti. The learner can read that difference as "this answer
counted less". The clean fix is P8 for the whole particle card: confetti only
on lapse recovery and end of goal. That is a separate ticket for
`frontend-expert`. When P8 ships, this rule has no visible effect.

### 7. Entries with accepted particles that map to different glyphs

Rule: map every particle in `acceptedParticles` through the glyph map (`ned`
maps to `ner`). If the result is not exactly one glyph, the entry gets no
glyph. A particle with no glyph (for example `iväg`) counts as "not one glyph".

| Entry             | Accepted          | Result                              |
| ----------------- | ----------------- | ----------------------------------- |
| `pv:ga-ner`       | ner, ned          | one glyph (`ner`): passes this gate |
| `pv:skriva-ner`   | ner, ned, upp     | two glyphs: no glyph                |
| `pv:stoppa-ner`   | ner, ned, in      | two glyphs: no glyph                |
| `pv:skramma-bort` | bort, iväg        | `iväg` has no glyph: no glyph       |

Runner-up: show the glyph of the primary particle. It lost because a learner
who typed the accepted alternative would see a picture of a different
direction. That reads as a correction of a correct answer, which the
alternate-answers decision (P6) forbids for text.

### 8. Introduction card

**Deferred.** Not rejected.

Reason: the first cloze of a new verb comes later in the same sitting
([[particle-verb-practice]]). The learner sees the glyph on that feedback a few
minutes after the introduction, so the gain from an earlier glyph is small.
The introduction is the first encoding. A glyph that misleads there does more
harm than on a later feedback screen. The introduction card already shows
three sentences, the sense line, the contrast line and the reference line.

Revisit when all of these are true:

1. The feedback glyph has shipped.
2. The maintainer has used it for 14 days or more.
3. The maintainer found no gated entry where the glyph misleads.
4. A 360 × 640 screenshot shows that the introduction card with the glyph
   needs no extra scroll to reach "Got it".

The introduction card is not graded, so P2 and P7 do not block it. Only the
risk at first encoding and the screen budget block it.

### 9. Eligibility, per entry

An entry gets a glyph only when all six gates pass. The default is no glyph.

1. `verified === true`.
2. `transparency === 'literal'`.
3. `contrast` is not set.
4. Rule 7 gives exactly one glyph.
5. **Spatial test** passes on **every** sentence in `examples` (see below).
6. A human has set `motionGlyphVerified: true` on the entry. Absent means
   false.

Gates 1–4 are code. Gate 5 is the linguist's work. Gate 6 is the human's
sign-off on gate 5.

**The spatial test.** The card rotates the shown sentence by `repetitions`, so
the glyph appears beside every example in turn. Each example must pass all
three questions:

- (a) **Figure.** Does a person or a physical thing change its physical
  location in this sentence?
- (b) **Direction.** Does it move along the path of the glyph?
  - `upp`: from lower to higher.
  - `ner`: from higher to lower.
  - `in`: from outside a bounded place to inside it.
  - `ut`: from inside a bounded place to outside it.
  - `bort`: away from a reference place, and it ends somewhere else.
  - `tillbaka`: to a place where it was before.
- (c) **Drawing.** Can you draw this sentence as a figure moving along the
  glyph path, and is the drawing true?

One "no" on one example fails the entry. Metaphors of scale (prices,
temperature) fail (a). Social meanings fail (b) or (c). Completion, transfer
of ownership, replacement and subtraction fail (a). This removes the known
traps: `äta upp`, `städa upp`, `värma upp`, `dela upp`, `ringa upp`, `föda upp`,
`hyra ut`, `låna ut`, `byta ut`, `räkna bort`.

Worked checks against the current data (`src/data/particleVerbData.ts`, lines
156–233):

- `pv:ga-in`: all three examples move a figure into a building or a room.
  Passes gate 5.
- `pv:ga-ut`: "Hon går ut genom dörren" passes. "Vi går ut och äter middag"
  is social. It fails. The entry fails.
- `pv:ga-upp`: "Solen går upp" passes. "Priserna går upp" is a scale
  metaphor. It fails. The entry fails.
- `pv:ga-ner`: same as `gå upp`. The entry fails.

The linguist may rewrite examples so that an entry passes. A rewrite must keep
the gloss correct. If the gloss covers a non-spatial sense ("to increase"), the
examples must keep that sense, and the entry stays without a glyph.

Runner-up for gate 5: allow orientational metaphors (`priserna går upp`) for
`upp` and `ner`. Boers (2000) argues that the spatial image helps with these
extensions. It lost because one picture beside two senses tells the learner
the senses are the same. Also "every example is physical" is a test two
people apply the same way. "The metaphor is close enough" is not.

**Check against P1.** The glyph starts with the feedback, at 0 ms delay. It
disables nothing. The correct form and the marker are on screen in the same
frame. Pass.

**Check against P10.** The glyph adds no row. It is 44 px tall in the
sense-line row. The sense line is about 20 px tall. The glyph adds 24 px of
height or less. Test: on a 360 × 640 viewport, the feedback panel with the
glyph is 24 px or less taller than without it. If "Next Card" is already below
the fold without the glyph, that is a P10 defect that exists today. Report it.
Do not fix it by removing the sense line.

### 10. `upp` sense line

The glyph for `upp` shows upward motion. The sense line for `upp` says
"completion, or making something visible". On a spatial entry the two would
contradict each other. **The `upp` glyph ships only after the `upp` line in
`PARTICLE_CORE_SENSE` names upward movement as a sense.** The other five glyphs
do not wait for this. The wording is the linguist's call.

## Parameters, collected

| Parameter                      | Value                                         |
| ------------------------------ | --------------------------------------------- |
| Screens                        | graded feedback panel only                    |
| Answers                        | correct and wrong                             |
| Glyph shown                    | correct particle only, alias `ned` → `ner`    |
| Size                           | 44 × 44 CSS px                                |
| Position                       | sense-line row, left of the text              |
| Colour                         | neutral foreground; never success/destructive |
| Duration                       | 700 ms, `ease-out`, 0 ms delay                |
| Secondary stagger              | 100 ms or less                                |
| Design end                     | 900 ms or less                                |
| Hard cap (delay + duration)    | 1500 ms                                       |
| Iterations                     | 1; tap replays; no limit                      |
| Reduced motion                 | rest frame, not a button, `aria-hidden`       |
| Confetti on a glyph screen     | off                                           |
| Multi-glyph or no-glyph accept | no glyph                                      |
| Data flag                      | `motionGlyphVerified?: boolean`, default off  |
| Introduction card              | deferred; revisit conditions in rule 8        |

## What we will not claim

We cannot measure whether the glyphs improve retention. There is no backend,
no cohort and no control group, and one learner's log cannot separate the
glyph from ordinary practice. We will not claim a retention gain. The only
check is the maintainer's subjective check while using the app.

## How we would know this was wrong

The maintainer checks these points by hand.

- A gated glyph misleads on one of its examples. Remove the flag from that
  entry. If this happens on 3 or more entries, gate 5 is too loose. Make the
  linguist re-check every flagged entry.
- The maintainer waits for the glyph before tapping "Next Card". 700 ms is too
  long. Drop it to 600 ms.
- The glyph after a wrong answer feels like a reward. Make it smaller or
  dimmer on wrong answers. Do not remove it.
- The missing confetti on glyph cards reads as a weaker "Correct". Ship P8 for
  the particle card.
- "Next Card" moves below the fold on a 360 × 640 phone because of the glyph.
  The 44 px box is too large for this panel. Reduce the glyph to the
  sense-line height and keep a 44 px tap area with padding.

## Hand-off

`swedish-linguist`: apply gate 5 to the 81 entries. Add
`motionGlyphVerified?: boolean` to the entry type in
`src/data/particleVerbData.ts`, and set it to `true` only on entries that pass
gate 5 and that the human approves. Rewrite the `upp` line in
`PARTICLE_CORE_SENSE` (rule 10), or say why not.

`frontend-expert`: the six glyphs and the feedback-panel placement (rules 1–6),
inside `src/components/ParticleVerbCard.tsx` and `src/index.css`. Gates 1–4 in
code; gate 6 read from data. A separate ticket: P8 for the particle card.

`qa`: tests for the gate (each row of the rule-7 table), for "no glyph before
the grade", for "no glyph on the introduction card", for "no button under
reduced motion", for "no confetti on a glyph screen", and for the 1500 ms cap.

`srs-engine`: nothing. The glyph does not change a grade or an interval.

## Sources

Paivio 1986, _Mental Representations: A Dual Coding Approach_. Clark & Paivio
1991, _Dual coding theory and education_, Educational Psychology Review 3(3).
Boers, Piquer Píriz, Stengers & Eyckmans 2009, _Does pictorial elucidation
foster recollection of idioms?_, Language Teaching Research 13(4). Tversky,
Morrison & Bétrancourt 2002, _Animation: can it facilitate?_, International
Journal of Human-Computer Studies 57. Ayres & Paas 2007, _Making instructional
animations more effective: a cognitive load approach_, Applied Cognitive
Psychology 21. Boers 2000 on orientational metaphor and multi-word verbs.
Metcalfe 2017, _Learning from errors_, Annual Review of Psychology.
