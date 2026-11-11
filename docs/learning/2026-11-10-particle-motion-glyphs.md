# Particle motion glyphs on the particle feedback screen and introduction card

Linear ORD-116 (GitHub #531).

**Amended by human decision I (2026-11-11).**
[[2026-11-11-glyph-loop-auto-stop]] (ORD-137) replaces "repeats without end" in
the Decision section, decision H, the transience evidence, rule 3 (with its
known costs), rule 4 "How to loop", rule 8, the parameter table (Loop
mechanism, Iterations and Introduction card rows) and the loop bullet in "How
we would know this was wrong". The glyph plays two times, then stops at the rest frame. A tap
plays the sequence again.

## Decision

A motion glyph shows in two places: on the particle feedback screen and on the
particle introduction card (human decision G). On both, it sits at the top of
the lemma area. It is centred, directly above the lemma heading (for example
`gå in`). On the feedback screen it is below the "Correct!" or "Not quite"
block. It never replaces a text line. The sense line stays plain text and does
not change. On the feedback screen it shows after a correct answer and after a
wrong answer. It always shows the glyph of the correct particle, never the
glyph of the learner's answer. It starts in the same frame as the feedback or
the introduction card. It moves for 700 ms with no start delay. Then it holds
the rest frame for 2000 ms. Then it repeats, without end (cycle 2700 ms, human
decision H). A tap restarts the cycle from the start state. It never disables a
control. Under reduced motion it shows the rest frame only, it does not loop,
and it is not a button. On the introduction card it is the same component at
the same size. It never delays or replaces "Got it". A tap on it never grades
or schedules anything. The glyph never shows on a cloze, recall or
discrimination prompt before the grade. Per-correct-answer confetti is removed
from the particle card before the glyph ships (P8). An entry gets a glyph only
when it passes all six gates in "Eligibility" below. The last gate is a human
flag, `motionGlyphVerified: true`. The default is no glyph. An entry whose
accepted particles map to more than one glyph, or to no glyph, gets no glyph.
An entry with a spatial sense and a non-spatial sense splits into two entries,
and only the physical entry can get a glyph. The loop has known costs: it
distracts, and it does not meet WCAG 2.2.2 (rule 3). The human accepts them.

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
   path trace. The keyframes define the start state and hold the rest values
   for the rest of the cycle. (Amended by human decision H. Before H, the
   keyframes defined only the start state.)
5. Out of scope: idiomatic entries, other particles, per-verb assets, raster or
   video, animation libraries, A/B telemetry, text in a glyph, a settings
   toggle.

## Human decisions, 2026-11-10

The human answered five review questions on 2026-11-10, then decided the
glyph placement after seeing the real screen (decision F), then added the
introduction card (decision G) and the loop (decision H). These answers are
authoritative. A later decision applies where it disagrees with an earlier
one.

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
  card. (Decision G replaces "feedback only" and "never on the introduction
  card". Decision H replaces "play once". "Never on a prompt" stays.)
- **G. Introduction card, 2026-11-10.** The glyph also shows on the particle
  introduction card, the card that teaches a new particle verb. It is the same
  component at the same size (44 × 44 CSS px). It is centred at the top of the
  card's lemma area, directly above the lemma heading. It shows only for
  entries that pass all six gates in rule 9. It starts when the introduction
  card appears, and a tap restarts it. Under reduced motion it shows the rest
  frame, with no button. It never delays or replaces "Got it". A tap on it
  never grades or schedules anything. It still never shows on a cloze, recall
  or discrimination prompt before the grade. The human accepts the risk that
  rule 8 names.
- **H. Loop, 2026-11-10.** The glyph loops everywhere it shows: on the
  feedback lemma card and on the introduction card. Each cycle is 700 ms of
  movement, then 2000 ms at the rest frame, and the cycle repeats without end
  (2700 ms). A tap restarts the cycle. Under reduced motion there is no loop:
  the glyph shows the rest frame, with no button. This replaces "play once,
  never loops". The human's loop request needs one change to settled point 4:
  the keyframes now also hold the rest values for the rest of the cycle
  (rule 4, "How to loop"). The human accepts the costs in rule 3.

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
line 505. The glyph goes in the feedback panel and on the introduction card
(human decision G). In both places it sits above the lemma heading, not in the
sense-line row. The engineer must not add the glyph to the shared `senseLine`
constant. Render the glyph as its own element at the top of each lemma area.

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
iteration (`src/index.css`, lines 104–113:
`animation-duration: 0.01ms !important` and
`animation-iteration-count: 1 !important`). A glyph whose base style is the
rest frame therefore shows the rest frame at once. The same rule also stops
the infinite loop of decision H: it runs once, at once, and ends at the rest
frame. The picture needs no glyph-specific code. The replay control does need
code: under this rule a tap does nothing visible.

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
rest frame and the replay tap are two remedies, so this note requires both.
The loop (decision H) is a third remedy: the movement comes back every 2.7 s,
so it does not disappear. On this point the loop helps.

The evidence for the glyph's size of benefit is thin. The dual-coding studies
mostly use word lists. Boers et al. used idioms and university learners. No
study tests six abstract SVG paths beside Swedish particle verbs on a phone. The
direction is defensible. The size is unknown.

## Options and their cost to the learner

**Glyph on the feedback screen (chosen).** The learner retrieves the form
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

**Glyph on the introduction card too (accepted, human decision G).** The
learner gets the meaning picture at first encoding, when there is no answer to
protect. Cost: the picture can make the first cloze of the verb easier, and
that cloze is graded. See rule 8.

## Rules

### 1. Placement

- The glyph shows in two places only:
  - in the graded feedback panel (`showFeedback === true`) of a cloze, recall
    or discrimination card. It sits at the top of the lemma card, centred,
    directly above the lemma heading, below the "Correct!" or "Not quite"
    block (human decision F).
  - on the introduction card (`kind === 'introduction'`). It sits at the top
    of the card's lemma area, centred, directly above the lemma heading (human
    decision G).
- It never shows on a prompt or on any screen before the grade.
- On the introduction card, the glyph never delays, hides, disables or
  replaces "Got it". "Got it" works from the first frame. A tap on the glyph
  never grades, schedules or advances anything.
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

### 3. Loop, tap to restart

- The first cycle starts when the feedback panel or the introduction card
  mounts. Each cycle is 700 ms of movement, then 2000 ms at the rest frame.
  The cycle repeats without end while the panel or card is on screen (human
  decision H).
- A re-render of the same panel or card does not restart the cycle (for
  example, after "Pronounce sentence"). The loop continues without a jump.
- A tap on the glyph restarts the cycle from the start state, during movement
  or during the pause.
- There is no restart limit.
- The loop stops when the panel or card unmounts.
- No control is disabled, hidden or delayed while the glyph moves. "Next Card"
  and "Got it" work from the first frame. A tap on either during movement
  advances at once.
- The glyph does not take focus. Focus stays where it is today.

**Known costs of the loop. The human accepted these (decision H).**

- **Distraction.** A loop that never stops is moving content next to text the
  learner reads: the correct form, the sentence and the sense line. Moving
  content pulls the eye. Every 2.7 s, it can take attention from the sentence
  that carries the meaning. A single play did not have this cost after the
  first 700 ms.
- **WCAG 2.2.2 (Pause, Stop, Hide), level A.** Motion that starts by itself,
  lasts more than 5 s and shows next to other content needs a way to pause,
  stop or hide it. The glyph loop does not have one. A tap restarts the loop
  and does not stop it. The OS reduced-motion setting is not the control that
  2.2.2 asks for. **The app does not meet 2.2.2 for the glyph while motion is
  allowed.**
- **Recommended follow-up, not done.** Add a pause control, or stop the loop
  automatically. Either one meets 2.2.2 only if the motion stops, or the
  learner can pause it. A pause control is the clean fix: one tap stops the
  loop at the rest frame. An automatic stop meets 2.2.2 only when all motion
  ends 5 s or less after it starts. Report this to the lead as a separate
  ticket for the maintainer to decide.

### 4. Duration

| Parameter                                   | Value                                          |
| ------------------------------------------- | ---------------------------------------------- |
| Movement duration (`GLYPH_DURATION_MS`)     | **700 ms** (allowed band 600–900 ms)           |
| Pause at rest frame (`GLYPH_LOOP_PAUSE_MS`) | **2000 ms**                                    |
| Cycle (`GLYPH_CYCLE_MS`)                    | **2700 ms** = movement + pause                 |
| Movement share of the cycle                 | **25.926 %** of the keyframes                  |
| Start delay after mount                     | **0 ms**                                       |
| Easing of the movement                      | `ease-out`                                     |
| Stagger of one secondary element            | delay **100 ms** or less, from the cycle start |
| Latest end of any movement, design          | **900 ms** after the cycle start               |
| Hard cap on movement, including every delay | **1500 ms** after the cycle start              |
| Iterations                                  | infinite; 1 under reduced motion (rule 5)      |

The hard cap applies to the movement in each cycle: `animation-delay` plus
`GLYPH_DURATION_MS` of every animated element. It does not apply to the pause
or the cycle. A movement that needs more than 900 ms is a design defect, even
below the cap. Every element must reach the rest frame before the next cycle
starts.

**How to loop.** Use one infinite CSS animation per animated element, with
duration `var(--glyph-cycle)` (2700 ms) and `animation-iteration-count:
infinite`. The base style stays the complete rest frame with the faint path
trace. The keyframes define the start state at `0%`. They hold the rest values
from `25.926%` to `100%`. The movement is the first 25.926 % of the cycle
(`GLYPH_DURATION_MS / GLYPH_CYCLE_MS`, rounded to 3 decimals). Use no
JavaScript timer for the loop. A tap restarts the cycle by remounting the
glyph element (for example a new React `key`). Under reduced motion the global
rule in `src/index.css` forces one near-instant iteration, so nothing loops.
Runner-up: keep 700 ms start-only keyframes and restart them with a timer
every `GLYPH_CYCLE_MS`. It lost because it adds timers and cleanup on unmount
and tap, and it bypasses the global reduced-motion rule, so the timer needs
its own reduced-motion guard.

**Make the timing testable.** jsdom does not compute keyframes or read
durations from a stylesheet. So `frontend-expert` must expose every duration
and every delay in one of two ways:

- as exported TypeScript constants (`GLYPH_DURATION_MS = 700`,
  `GLYPH_LOOP_PAUSE_MS = 2000`, `GLYPH_CYCLE_MS = 2700`, and for example
  `GLYPH_STAGGER_MS`) that the component uses, or
- as inline CSS custom properties on the glyph elements (for example
  `--glyph-cycle: 2700ms`) that the stylesheet reads.

Vitest then asserts these points:

- Delay plus `GLYPH_DURATION_MS` is 1500 ms or less for each animated element.
- `GLYPH_CYCLE_MS` equals `GLYPH_DURATION_MS + GLYPH_LOOP_PAUSE_MS`.
- Delay plus `GLYPH_DURATION_MS` of each element is less than
  `GLYPH_CYCLE_MS`.
- The keyframe percentage in the stylesheet equals
  `round(GLYPH_DURATION_MS / GLYPH_CYCLE_MS * 100, 3)` (25.926). The test
  reads the stylesheet source as text, because jsdom does not parse keyframes.

Reason for 700 ms: it is long enough to read a direction. Reason for 2000 ms:
the glyph is still for most of each cycle (74 %), so the learner can read the
text between movements. The 2000 ms pause is the human's value, not a measured
one. The glyph starts with the feedback, so it never delays the feedback. P1
holds.

### 5. Reduced motion

- Under `prefers-reduced-motion: reduce`, there is no loop. The global rule in
  `src/index.css` sets `animation-iteration-count: 1 !important` and
  `animation-duration: 0.01ms !important`. So the infinite animation runs
  once, at once, and stops at the rest frame. The glyph needs no extra CSS for
  this.
- Under reduced motion, the glyph is **not** a button. It has no `onClick`, no
  `tabIndex`, no pointer cursor and no focus ring. It is `aria-hidden="true"`.
- With motion allowed, the glyph is a `<button type="button">` with an
  accessible name, for example `Replay movement: upp`.
- The card reads the media query when the feedback panel or the introduction
  card mounts, as `ConfettiEffect.tsx` does. A change of preference during one
  card does not need to update that card.
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

**Accepted** (human decision G, 2026-11-10). This replaces the earlier
deferral.

The glyph shows on the introduction card of an entry that passes all six gates
in rule 9. Placement, size, colour, timing, loop, tap restart and reduced
motion are the same as on the feedback panel (rules 1, 3, 4 and 5). It never
delays or replaces "Got it". A tap on it never grades or schedules anything.

**The risk, named.** `srs-engine` raised this concern, and it stays true. A
picture of "out" on the introduction card can prime the answer `ut` for the
first cloze of that verb. The first cloze is graded 0|5, and a correct answer
gets full credit. So part of a first-cloze success can come from the picture,
not from memory of the particle.

**What limits the risk.**

- The introduction card is not graded and creates no SRS item (`itemId:
null`, `countsTowardGoal: false`, `src/lib/particleQueue.ts`). The glyph
  cannot change a grade on that card.
- The first cloze comes at least 2 cards after the introduction, and 6 if
  possible (`MIN_INTERVENING_BEFORE_FIRST_CLOZE = 2`, preferred gap 6). If the
  gap is below 2, the first cloze moves to a later sitting. The learner must
  hold the particle across other cards.
- The glyph shows only the direction of the particle. It does not show the
  verb or the sentence. The cloze also needs the learner to put the particle
  in a sentence.
- The human accepted the remaining risk.

The risk remains for the first cloze only. Later reviews come on the normal
schedule, after the priming has faded.

**What the maintainer watches.** The maintainer checks by hand. There is no
telemetry. Compare first-cloze accuracy on verbs with a glyph and verbs
without one. Also notice any time you answer a first cloze from the picture
and not from the verb. "How we would know this was wrong" gives the threshold
for action.

**Screen budget.** The introduction card already shows three sentences, the
sense line, the contrast line and the reference line. `frontend-expert` takes a
360 × 640 screenshot of the introduction card with the glyph and records it in
the PR. If "Got it" goes below the fold, report it to the lead. Do not remove
the sense line to make space.

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

| Parameter                      | Value                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| Screens                        | graded feedback panel; introduction card (decision G); never a prompt                         |
| Answers                        | correct and wrong                                                                             |
| Glyph shown                    | correct particle only, alias `ned` → `ner`                                                    |
| Size                           | 44 × 44 CSS px                                                                                |
| Position                       | top of the lemma area, centred, above the lemma heading; on feedback, below the result block  |
| Colour                         | mover `text-primary`; landmark `text-muted-foreground`; never success/destructive             |
| Duration                       | movement 700 ms (band 600–900 ms), `ease-out`, 0 ms delay; pause 2000 ms; cycle 2700 ms       |
| Secondary stagger              | 100 ms or less                                                                                |
| Design end                     | movement ends 900 ms or less after the cycle start                                            |
| Hard cap (delay + duration)    | 1500 ms per movement; `GLYPH_DURATION_MS`, `GLYPH_LOOP_PAUSE_MS`, `GLYPH_CYCLE_MS`            |
| Loop mechanism                 | one infinite CSS animation over `var(--glyph-cycle)`; movement in first 25.926 %; no JS timer |
| Iterations                     | infinite (decision H); tap restarts the cycle; no limit                                       |
| Reduced motion                 | no loop; rest frame, not a button, `aria-hidden`                                              |
| WCAG 2.2.2                     | not met while motion is allowed; pause control or auto-stop is a recommended follow-up        |
| Confetti on the particle card  | none on a correct answer (P8); lands before the glyph                                         |
| Multi-glyph or no-glyph accept | no glyph                                                                                      |
| Multi-sense entry              | split; existing id keeps the majority sense; other sense is a new entry                       |
| Spatial test                   | every example; doubt = fail; hard-class table in rule 9                                       |
| Data flag                      | `motionGlyphVerified?: boolean`, default off                                                  |
| Gate 6 approval                | one human batch approval of the pass list, in the PR                                          |
| Introduction card              | yes, gated entries only; loops; never delays "Got it"; a tap never grades                     |

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
- First clozes after an introduction with a glyph feel too easy, or a learner
  reports that they guessed the particle from the picture. The
  introduction-card glyph primes the answer. Remove the glyph from the
  introduction card. Keep the glyph on the feedback panel. A difference that
  the maintainer notices by hand is enough. Example: first clozes on glyph
  verbs almost never fail, but first clozes on similar verbs with no glyph
  often fail. No statistics are needed.
- The glyph on the introduction card pushes "Got it" below the fold on a
  360 × 640 screen. Reduce the glyph row height and keep a 44 px tap area with
  padding.
- The looping motion pulls attention from reading the example sentence, or
  the maintainer finds the loop tiring. Stop the loop at the rest frame after
  a few cycles (2 or 3), or pause it on tap. Do not remove the glyph. Do not go
  back to one play without a human decision.
- The 2000 ms pause feels restless. Make the pause longer before you shorten
  the movement.

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
card in the feedback panel (human decision F) and at the top of the lemma area
on the introduction card (human decision G, rule 8), by rules 1–5, inside
`src/components/ParticleVerbCard.tsx` and `src/index.css`. Gates 1–4 in code;
gate 6 read from data. Expose every glyph duration and delay as exported
constants or inline CSS custom properties (rule 4). On the introduction card,
the glyph never delays or replaces "Got it", and a tap on it never grades or
schedules. Put a 360 × 640 screenshot of a gated introduction card in the PR.
Loop the glyph by rules 3 and 4 (human decision H): one infinite CSS animation
over `var(--glyph-cycle)`, movement in the first 25.926 % of the keyframes,
rest values for the remainder, base style still the complete rest frame, no
JavaScript timer. Export `GLYPH_DURATION_MS`, `GLYPH_LOOP_PAUSE_MS` and
`GLYPH_CYCLE_MS`.

Recommended follow-up, not in ORD-119: a pause control, or an automatic stop,
to meet WCAG 2.2.2 (rule 3). The lead puts this to the maintainer as a
separate ticket.

`qa`: tests for these points:

- the gate (each row of the rule-7 table);
- no glyph before the grade;
- the introduction card of a flagged entry shows the glyph;
- the introduction card of an unflagged entry shows no glyph;
- a tap on the introduction-card glyph reports no grade and does not advance
  the card;
- "Got it" is enabled on the first render of an introduction card with a
  glyph;
- no button under reduced motion, on the feedback panel and on the
  introduction card;
- the glyph CSS animation is infinite, with duration `var(--glyph-cycle)`;
- the keyframe percentage in the stylesheet equals
  `round(GLYPH_DURATION_MS / GLYPH_CYCLE_MS * 100, 3)`;
- under reduced motion nothing loops (the global rule sets iteration count 1);
- a tap restarts the cycle;
- a re-render does not restart the cycle;
- `GLYPH_CYCLE_MS === GLYPH_DURATION_MS + GLYPH_LOOP_PAUSE_MS`;
- no confetti on a correct particle answer;
- the 1500 ms cap on each movement, and every movement ends before
  `GLYPH_CYCLE_MS`.

The timing tests read the exported constants, the CSS custom properties or
the stylesheet source as text, because jsdom does not compute keyframes. After
ORD-123, add a test that every `pv:` id present before the split is still
present.

`srs-engine`: no code change. The glyph does not change a grade or an
interval. The first-cloze priming risk is recorded in rule 8 and accepted by
the human (decision G). The first-cloze gap rule in `src/lib/particleQueue.ts`
(floor 2, preferred 6) is part of what limits that risk. Do not reduce the gap
without a new learning-designer decision. New entries from splits are new keys
and get the normal new-item treatment.

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
