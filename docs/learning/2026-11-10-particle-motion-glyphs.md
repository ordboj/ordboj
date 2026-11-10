# Particle motion glyphs on the particle feedback screen

Linear ORD-116 (GitHub #531).

## Decision

A motion glyph shows only on the particle feedback screen. It sits at the top
of the lemma card in the feedback panel. It is centred, directly above the
lemma heading (for example `gå in`), and below the "Correct!" or "Not quite"
block. It never replaces a text line. The sense line stays plain text and does
not change. It shows after a correct answer and after a wrong answer. It always shows
the glyph of the correct particle, never the glyph of the learner's answer. It
starts in the same frame as the feedback. It plays once for 700 ms, with no
delay. The learner taps it to play it again. It never loops and never disables
a control. Under reduced motion it shows the rest frame only, and it is not a
button. Per-correct-answer confetti is removed from the particle card before
the glyph ships (P8). An entry gets a glyph only when it passes all six gates
in "Eligibility" below. The last gate is a human flag,
`motionGlyphVerified: true`. The default is no glyph. An entry whose accepted
particles map to more than one glyph, or to no glyph, gets no glyph. An entry
with a spatial sense and a non-spatial sense splits into two entries, and only
the physical entry can get a glyph. The glyph on the introduction card is
deferred, not rejected.

## Question

How does a six-glyph motion aid for particle meaning appear on the particle
card, and which entries get one? The aid must help meaning recall. It must not
inflate grades or delay feedback.

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

## Human decisions, 2026-11-10

The human answered five review questions on 2026-11-10, then decided the
glyph placement after seeing the real screen (decision F). These answers are
authoritative.

- **A. Pool.** The human does not accept a small pool as it is. The
  `swedish-linguist` rewrites the example sentences of literal spatial
  candidates. After the rewrite, every shipped example of a glyph candidate
  uses the physical, drawable sense. The strict "every example" test of gate 5
  stays. The rewrite happens before the allowlist pass. Conditions are in rule 9. Entries with more than one sense split first (decision E).
- **B. `upp` sense line.** The human approves a new wording of
  `PARTICLE_CORE_SENSE.upp` that names upward movement. This is a separate
  `swedish-linguist` ticket. It blocks only the `upp` glyph. If the linguist
  finds a problem with the wording, the linguist reports it to the lead and the
  human. The linguist does not silently drop `upp`.
- **C. Gate 6.** The human gives one batch approval of the linguist's pass
  list. The list is in the PR, with a one-line reason for each entry.
- **D. Confetti.** Per-correct-answer confetti is removed from the particle
  card (`ParticleVerbCard.tsx:173` and `:194`). This applies P8. It is a
  separate small `frontend-expert` ticket. It lands before the glyph
  placement. Rule 6 records this.
- **E. Multi-sense entries.** The gloss is rendered on the feedback panel
  (`ParticleVerbCard.tsx:306` and `:482`). One glyph beside a two-sense gloss
  tells the learner that the senses are the same. So an entry whose gloss
  lists a spatial sense and a non-spatial sense splits into two entries. One
  entry has the physical sense and can get a glyph. The other entry has the
  non-spatial sense and never gets a glyph. No sense is lost from the app. The
  human accepts that this adds new SRS items for the learner. The split rule
  is in rule 9.
- **F. Placement, 2026-11-10.** The human saw the real feedback screen. The
  glyph does not go in the sense-line row. It goes at the top of the lemma
  card, centred, directly above the lemma heading and below the "Correct!" or
  "Not quite" block. The sense line stays plain text and does not change. All
  other rules stay: feedback only, after the grade, after wrong answers too
  (always the correct entry's glyph), play once, tap to replay, rest frame
  with no button under reduced motion, never on a prompt or the introduction
  card.

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
frame therefore shows the rest frame at once. The picture needs no
glyph-specific code. The replay control does need code: under this rule a tap
does nothing visible.

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

**Ownership.** The CLAUDE.md ownership table lists
`src/data/particleVerbData.ts` and `src/lib/particleVerbs.ts` under
`swedish-linguist` (the human confirmed this on 2026-11-10).

## Evidence

**Dual coding.** A meaning held as both a word and a picture is easier to
retrieve than a meaning held as a word only (Paivio 1986; Clark & Paivio 1991).
This is the reason for the glyph. The effect is strongest for concrete,
imageable meanings. A literal spatial particle is concrete. An aspectual `upp`
(`äta upp`) is not.

**Pictures help meaning, not form.** Boers, Piquer Píriz, Stengers & Eyckmans
(2009) found that pictures helped learners recall the meaning of idioms. The
pictures did not help learners recall the form. For some learners the pictures
took attention from the form. That is the reason for the goal "meaning
recall". It is also the reason the glyph never shows before the learner
produces the form.

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
a binary 0|5 grade, that is a free correct answer. This breaks collected red
line 1 of [[2026-08-08-ux-pedagogy-red-lines]] (no part of the answer during
recall). It also breaks P7 (at most four elements during recall).

**Glyph instead of the sense line.** Rejected. The sense line names the
non-spatial senses of the particle. The glyph shows only one spatial sense. A
learner who sees only the glyph learns that `upp` means "up" and nothing else.

**Glyph on the introduction card too.** Deferred. See rule 8.

## Rules

### 1. Placement

- The glyph shows only in the graded feedback panel (`showFeedback === true`)
  of a cloze, recall or discrimination card.
- It never shows on a prompt, on the introduction card, or on any screen
  before the grade.
- It sits at the top of the lemma card in the feedback panel. It is centred,
  directly above the lemma heading, below the "Correct!" or "Not quite" block
  (human decision F).
- The glyph box is 44 × 44 CSS px. This is the minimum touch target.
- The glyph never replaces a text line. The sense line stays in its row as
  plain text. The glyph does not change the sense line at render time. (Rule
  10 changes one data string. That is a data change, not a render change.)
- The glyph uses two theme tokens. The mover uses the primary theme colour
  (`text-primary`). The landmark uses the muted foreground colour
  (`text-muted-foreground`). The glyph never uses the success colour or the
  destructive colour. It looks the same after a correct answer and after a
  wrong answer.
- The glyph contains no text.

### 2. Correct and wrong answers

The glyph shows after both. It always shows the correct particle
(`entry.particle`, through the alias map).

Reason: after a wrong answer, the meaning of the correct particle is what the
learner needs most. Learners learn well from errors when feedback follows
(Metcalfe 2017, cited in P21). If the glyph showed only after correct answers,
it would become a reward. It would also be absent from the screen that needs it
most.

Conditions:

- On a wrong answer, the "Not quite" marker and the correct form keep their
  present size and position. The glyph is below them, at the top of the lemma
  card.
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

| Parameter                              | Value                    |
| -------------------------------------- | ------------------------ |
| Main animation duration                | **700 ms**               |
| Start delay after the feedback renders | **0 ms**                 |
| Easing                                 | `ease-out`               |
| Stagger of one secondary element       | delay **100 ms** or less |
| Latest end of any keyframe, design     | **900 ms** after render  |
| Hard cap, including every delay        | **1500 ms** after render |
| Iterations                             | **1**                    |

The hard cap applies to `animation-delay + animation-duration` of every
animated element in the glyph. A glyph that needs more than 900 ms is a design
defect, even below the cap.

**Make the timing testable.** jsdom does not compute keyframes or read
durations from a stylesheet. So `frontend-expert` must expose every duration
and every delay in one of two ways:

- as exported TypeScript constants (for example `GLYPH_DURATION_MS`,
  `GLYPH_STAGGER_MS`) that the component uses, or
- as inline CSS custom properties on the glyph elements (for example
  `--glyph-duration: 700ms`) that the stylesheet reads.

Vitest then asserts that delay plus duration is 1500 ms or less for each
animated element.

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

### 6. Confetti on the particle card

**The particle card fires no confetti on a correct answer.** Remove the
`setShowConfetti(true)` calls at `ParticleVerbCard.tsx:173` (`handleSubmit`)
and `:194` (`handleChoice`). This applies P8 of
[[2026-08-08-ux-pedagogy-red-lines]]: confetti is for lapse recovery and end
of goal only. This is a separate `frontend-expert` ticket. It lands before the
glyph placement (human decision D). There is no fallback.

Reason: two motions at the same moment compete for the same attention, and
the confetti covers the glyph. If the glyph waited until the confetti ended,
the wait would be a second interruption, and the glyph would play while the
learner already reads the next line. If the confetti waited, that would also
be a second interruption. With no per-answer confetti, the conflict does not
occur. All particle cards also behave the same, so no learner reads a missing
confetti as "this answer counted less".

### 7. Entries with accepted particles that map to different glyphs

Rule: map every particle in `acceptedParticles` through the glyph map (`ned`
maps to `ner`). If the result is not exactly one glyph, the entry gets no
glyph. A particle with no glyph (for example `iväg`) counts as "not one glyph".

| Entry             | Accepted      | Result                              |
| ----------------- | ------------- | ----------------------------------- |
| `pv:ga-ner`       | ner, ned      | one glyph (`ner`): passes this gate |
| `pv:skriva-ner`   | ner, ned, upp | two glyphs: no glyph                |
| `pv:stoppa-ner`   | ner, ned, in  | two glyphs: no glyph                |
| `pv:skramma-bort` | bort, iväg    | `iväg` has no glyph: no glyph       |

Runner-up: show the glyph of the primary particle. It lost because a learner
who typed the accepted alternative would see a picture of a different
direction. That reads as a correction of a correct answer. P6 of
`docs/product/2026-08-08-alternate-answers-decision.md` forbids that for text:
the feedback panel discloses alternates as also accepted, never as errors.

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

The introduction card is not graded, so red line 1 and P7 do not block it.
Only the risk at first encoding and the screen budget block it.

### 9. Eligibility, per entry

An entry gets a glyph only when all six gates pass. The default is no glyph.

1. `verified === true`.
2. `transparency === 'literal'`.
3. `contrast` is not set. Reason: on these entries the feedback panel already
   shows a contrast line that names a stressed prepositional twin with a
   different meaning. A glyph in the same panel could attach to either
   reading, and the panel has the least height to spare (P10).
4. Rule 7 gives exactly one glyph.
5. **Spatial test** passes on **every** sentence in `examples` (see below).
6. A human has set `motionGlyphVerified: true` on the entry. Absent means
   false.

Gates 1–4 are code. Gate 5 is the linguist's work. Gate 6 is the human's
sign-off on gate 5. The human gives it as one batch approval of the linguist's
pass list in the PR. The list has a one-line reason for each entry (human
decision C).

**Order of work.**

1. The linguist splits multi-sense entries (human decision E) and rewrites
   example sentences of literal spatial candidates (human decision A).
2. The linguist applies the spatial test to all candidate entries and writes
   the pass list.
3. The human approves the pass list in one batch.
4. The linguist sets `motionGlyphVerified: true` on the approved entries.

**Split rule (human decision E).** An entry splits when its gloss lists
co-equal senses, at least one spatial and drawable and at least one not. A
single-sense entry is rewritten only, never split. The existing `pv:` id is
never renamed or removed, because stored SRS progress is keyed on it
(`pv:<slug>:cloze`, `pv:<slug>:recall`). The existing id keeps the sense that
most of its current examples use, so earned progress stays meaningful, and its
gloss narrows to that sense. The other sense becomes a new entry, appended,
with a new slug; the ORD-123 PR decides the slug scheme, and `staff-engineer`
reviews it and confirms that new ids need no storage migration. A new entry is
new Swedish content: it needs correct, natural examples, and it goes through
the `verified` gate and the human's batch approval; an unverified new entry
does not ship. Each split adds new SRS items for the learner to learn, and the
human accepts this cost.

**Rewrite conditions.**

- Each rewritten sentence must be correct, natural Swedish.
- The rewrite keeps the entry's gloss. After a split, this is the narrowed
  gloss.
- The rewrite uses the physical, drawable sense of the entry.
- An example that does not match the narrowed gloss after a split moves to
  the other entry or is replaced. The linguist writes the replacement.
- An entry that keeps a non-spatial sense after a split is not rewritten
  toward a physical sense. It gets no glyph.
- Do not force a single-sense entry whose sense is not physical. Example: if
  the only sense in the gloss is social or figurative, leave the examples as
  they are. The entry gets no glyph.
- Doubt = fail. If the linguist is not sure that a rewrite is natural or keeps
  the gloss, the linguist does not rewrite, and the entry gets no glyph.

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

In a caused-motion sentence, the figure is the object, not the subject. In
"Hon bär in lådan", the figure is `lådan`.

One "no" on one example fails the entry. **Doubt = fail.** If the linguist is
not sure of an answer, the answer is "no".

Metaphors of scale (prices, temperature) fail (a). Social meanings fail (b) or
(c). Completion, transfer of ownership, replacement and subtraction fail (a).
This removes the known traps: `äta upp`, `städa upp`, `värma upp`, `dela upp`,
`ringa upp`, `föda upp`, `hyra ut`, `låna ut`, `byta ut`, `räkna bort`.

**Rulings on hard classes.** This table reduces disagreement between two
reviewers. It does not remove it. For a case outside the table, doubt = fail,
and the linguist adds the case to the PR for the human.

| Class                         | Example                                                                                                          | Ruling                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Posture change                | rising (the linguist picks the exemplar, for example `ställa sig upp` or `resa sig upp`); `sitta ner` (sit down) | Pass only when the sentence describes the act of rising or sitting down. The body is the figure. A posture held over time fails (a).                                                                                          |
| Static configuration          | `sticka upp` (a nail sticks up)                                                                                  | Fail (a). Nothing moves.                                                                                                                                                                                                      |
| Non-solid figure              | `strömma in`, `andas in/ut`                                                                                      | Pass when the sentence names the fluid and it moves along the path ("Vattnet strömmar in i källaren"). Fail when the fluid is not named. Air into the body (`andas in`) is not drawable: fail.                                |
| State change with a direction | `fälla upp`, `hugga ner`, `låsa in`                                                                              | Fail (a). The main event is a change of state (open, felled, locked), even if a part moves along the path.                                                                                                                    |
| Return of possession          | `ge tillbaka pengarna`, `få tillbaka`                                                                            | Fail (a). This is transfer of ownership. When this class and the `tillbaka` direction test disagree, the physical reading wins only when a moving object returns to a place: that passes. A pure transfer of ownership fails. |
| Digital object                | `ta bort filen`                                                                                                  | Fail (a). A file is not a physical thing.                                                                                                                                                                                     |
| Discard                       | `kasta bort` (throw out, get rid of)                                                                             | Fail (a) when the sense is "get rid of". Pass only when the sentence describes a throw that moves the object away in space, with no "get rid of" sense.                                                                       |

**Worked checks against the current data** (`src/data/particleVerbData.ts`,
lines 156–233).

Before the split and the rewrite:

- `pv:ga-in`: gloss "to enter a room or building", one sense. All three
  examples move a figure into a building or a room. Passes gate 5. No split.
- `pv:ga-ut`: gloss "to leave the house; to spend an evening socialising".
  "Hon går ut genom dörren" passes. "Vi går ut och äter middag" and "På
  lördagar går de ut med sina vänner" are social. They fail. The entry fails
  today.
- `pv:ga-upp`: gloss "to rise; to increase". "Solen går upp" passes. "Priserna
  går upp" and "Temperaturen går upp" are scale metaphors. They fail. The
  entry fails today.
- `pv:ga-ner`: gloss "to descend; to decrease". "Solen går ner" and "Hon går
  ner för trappan" pass. "Priserna går ner" is a scale metaphor. It fails. The
  entry fails today.

After the split (human decision E). All three entries have one spatial sense
and one non-spatial sense, so all three split:

- `pv:ga-ut`: two of three current examples are social. The existing id keeps
  the social sense. Its gloss narrows to that sense. It gets no glyph. "Hon
  går ut genom dörren" moves to a new appended entry with the physical sense
  (leave a room or building). The linguist writes a social example to replace
  it. The new physical entry is a glyph candidate after it is verified.
- `pv:ga-upp`: two of three current examples use the "increase" sense. The
  existing id keeps "to increase". It gets no glyph. "Solen går upp" moves to
  a new appended entry with the physical sense (rise). The linguist writes a
  scale example to replace it. The new physical entry is a glyph candidate
  after it is verified. Rule 10 also blocks it.
- `pv:ga-ner`: two of three current examples use the physical sense. The
  existing id keeps "to descend". "Priserna går ner" moves to a new appended
  entry with the "decrease" sense. That new entry never gets a glyph. The
  linguist writes a physical example to replace it in the existing entry. The
  existing `pv:ga-ner` is then a glyph candidate.

Runner-up for gate 5: allow orientational metaphors (`priserna går upp`) for
`upp` and `ner`. Boers (2000) argues that awareness of the spatial source helps
learners retain these extensions. It lost because one picture beside two senses
tells the learner the senses are the same. Also, the test "every example is
physical" gives more consistent results between reviewers than the test "the
metaphor is close enough".

Runner-up for decision E: rewrite only, and keep the two-sense gloss. It lost
because the gloss shows on the feedback panel beside the glyph, so the panel
would still show one picture beside two senses.

**Check against P1.** The glyph starts with the feedback, at 0 ms delay. It
disables nothing. The correct form and the marker are on screen in the same
frame. Pass.

**Check against P10.** P10 is about the recall screen: no scroll to answer.
This note extends P10 to the feedback panel on purpose: "Next Card" must stay
above the fold. The earlier sense-line placement added +4 px. The new
placement adds a new row of about one glyph box (44 px), minus any spacing
that `frontend-expert` tightens. `frontend-expert` measures the real number.
On a 360 × 640 phone, "Next Card" is already below the fold on the feedback
screen, even for entries with no glyph. The existing page layout causes this,
not the glyph. So P10 on the feedback panel is not met today. It is an
existing defect, and a separate ticket handles it. This note does not claim
that P10 is met. Do not fix it by removing the sense line or the glyph.

### 10. `upp` sense line

The glyph for `upp` shows upward motion. The sense line for `upp` says
"completion, or making something visible". On a spatial entry the two would
contradict each other. **The `upp` glyph ships only after the `upp` line in
`PARTICLE_CORE_SENSE` names upward movement as a sense.** The human approved
this new wording on 2026-11-10 (human decision B). It is a separate
`swedish-linguist` ticket. It blocks only the `upp` glyph. The other five
glyphs do not wait for it. The wording is the linguist's call. If the linguist
finds a problem with the wording, the linguist reports it to the lead and the
human. The linguist does not silently drop `upp`.

## Parameters, collected

| Parameter                      | Value                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Screens                        | graded feedback panel only                                                        |
| Answers                        | correct and wrong                                                                 |
| Glyph shown                    | correct particle only, alias `ned` → `ner`                                        |
| Size                           | 44 × 44 CSS px                                                                    |
| Position                       | top of the lemma card, centred, above the lemma heading, below the result block   |
| Colour                         | mover `text-primary`; landmark `text-muted-foreground`; never success/destructive |
| Duration                       | 700 ms, `ease-out`, 0 ms delay                                                    |
| Secondary stagger              | 100 ms or less                                                                    |
| Design end                     | 900 ms or less                                                                    |
| Hard cap (delay + duration)    | 1500 ms, exposed as constants or CSS custom properties                            |
| Iterations                     | 1; tap replays; no limit                                                          |
| Reduced motion                 | rest frame, not a button, `aria-hidden`                                           |
| Confetti on the particle card  | none on a correct answer (P8); lands before the glyph                             |
| Multi-glyph or no-glyph accept | no glyph                                                                          |
| Multi-sense entry              | split; existing id keeps the majority sense; other sense is a new entry           |
| Spatial test                   | every example; doubt = fail; hard-class table in rule 9                           |
| Data flag                      | `motionGlyphVerified?: boolean`, default off                                      |
| Gate 6 approval                | one human batch approval of the pass list, in the PR                              |
| Introduction card              | deferred; revisit conditions in rule 8                                            |

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
- A rewritten example sounds unnatural to a native speaker. Revert that
  sentence and remove the flag from the entry.
- After a split, the maintainer's earned progress on an existing id no longer
  matches the sense that the id now teaches. The majority rule picked the
  wrong sense for that entry. Report it to the lead; do not rename the id.
- The new entries from splits make the daily load feel too heavy. Report it to
  the lead for the new-versus-review cap. Do not merge the senses back.
- The maintainer waits for the glyph before tapping "Next Card". 700 ms is too
  long. Drop it to 600 ms.
- The glyph after a wrong answer feels like a reward. Make it smaller or
  dimmer on wrong answers. Do not remove it.
- The separate P10 ticket brings "Next Card" above the fold, and then the
  glyph row pushes it below again. The glyph row is too tall. Reduce the glyph
  height and keep a 44 px tap area with padding.

## Hand-off

Follow-up tickets, in order:

1. **`swedish-linguist`: split multi-sense entries and rewrite example
   sentences** (ORD-123; human decisions A and E). Split every entry whose
   gloss lists a spatial sense and a non-spatial sense, by the split rule in
   rule 9. Never rename or remove an existing `pv:` id. Append each new entry
   with a new slug. The PR decides the slug scheme, and `staff-engineer`
   reviews it and confirms that no storage migration is necessary. Each new
   entry needs correct, natural examples, and it goes through the `verified`
   gate and the human's batch approval. Then rewrite the examples of literal
   spatial candidates so that every example uses the physical, drawable sense.
   Each sentence must be correct, natural Swedish and keep the entry's gloss.
   Do not force a single-sense entry whose sense is not physical. Doubt =
   fail. This happens before the allowlist pass.
2. **`swedish-linguist`: reword the `upp` sense line** (human decision B, rule
   10). Name upward movement in `PARTICLE_CORE_SENSE.upp`. This blocks only the
   `upp` glyph. A wording problem goes to the lead and the human.
3. **`frontend-expert`: remove per-correct-answer confetti from the particle
   card** (human decision D, rule 6). Remove the calls at
   `ParticleVerbCard.tsx:173` and `:194`. Also remove the state that is then
   dead: the `showConfetti` state at line 98, the reset at line 134, the
   `<ConfettiEffect>` render at line 312 and the `ConfettiEffect` import at
   line 6. This lands before the glyph placement.

Then the main work:

`swedish-linguist`: add `motionGlyphVerified?: boolean` to the entry type in
`src/data/particleVerbData.ts`. Apply gate 5, with the hard-class table, to
every entry that is `verified`, is `literal`, has no `contrast`, and has a
primary particle among the six glyph particles. This includes new entries from
ORD-123 after they are verified. Put the pass list in the PR, with a one-line
reason for each entry. After the human's batch approval, set the flag to
`true` on the approved entries only. The linguist owns this file and
`src/lib/particleVerbs.ts` (confirmed by the human on 2026-11-10; see "What
the app does today").

`frontend-expert` (ORD-119): the six glyphs, placed at the top of the lemma
card in the feedback panel (rules 1–5, human decision F), inside `src/components/ParticleVerbCard.tsx` and `src/index.css`. Gates 1–4 in
code; gate 6 read from data. Expose every glyph duration and delay as exported
constants or inline CSS custom properties (rule 4).

`qa`: tests for the gate (each row of the rule-7 table), for "no glyph before
the grade", for "no glyph on the introduction card", for "no button under
reduced motion", for "no confetti on a correct particle answer", and for the
1500 ms cap. The cap test reads the exported constants or the CSS custom
properties, because jsdom does not compute keyframes. After ORD-123, add a
test that every `pv:` id present before the split is still present.

`srs-engine`: nothing. The glyph does not change a grade or an interval. New
entries from splits are new keys and get the normal new-item treatment.

## Sources

Paivio 1986, _Mental Representations: A Dual Coding Approach_. Clark & Paivio
1991, _Dual coding theory and education_, Educational Psychology Review 3(3).
Boers, F. 2000, _Metaphor awareness and vocabulary retention_, Applied
Linguistics 21(4): 553–571. Boers, Piquer Píriz, Stengers & Eyckmans 2009,
_Does pictorial elucidation foster recollection of idioms?_, Language Teaching
Research 13(4). Tversky, Morrison & Bétrancourt 2002, _Animation: can it
facilitate?_, International Journal of Human-Computer Studies 57. Ayres & Paas
2007, _Making instructional animations more effective: a cognitive load
approach_, Applied Cognitive Psychology 21. Metcalfe 2017, _Learning from
errors_, Annual Review of Psychology.
