# Motion glyphs and meaning pictures stop after two plays

Linear ORD-137.

## Decision

A motion glyph and a meaning picture play their movement two times, then
stop. They do not loop without end. The first play starts when the feedback
panel or the introduction card mounts. It moves for 700 ms and rests for
2000 ms. The second play moves for 700 ms. All movement ends 3400 ms after the
mount. After that, the glyph or picture shows the rest frame and does not move
again by itself. A tap plays the same sequence again: two plays, 3400 ms. The
tap behaviour, the button, its 44 × 44 CSS px box and its accessible name do
not change. There is no pause button. There is no setting. No stored field
changes. Reduced motion does not change: the rest frame only, no button. This
rule amends human decision H of [[2026-11-10-particle-motion-glyphs]] ("the
cycle repeats without end"). It applies in the same way to
[[2026-11-10-idiom-meaning-pictures]]. With this rule, WCAG 2.2.2 does not
apply to the glyph or the picture, because no automatic movement lasts more
than 5 s.

**Human decision I, 2026-11-11.** The human chose auto-stop after two plays
(movement ends at 3400 ms, rest frame, tap replays) over a pause control or
keeping the loop. This replaces decision H's endless loop in the glyph note and
settled point 2 of the picture note ("waves for 0.7 s, rests for 2 s, and
repeats"). The implementation ticket may start.

## Question

The glyph and the picture loop without end. WCAG 2.2.2 asks for a way to
pause, stop or hide such movement. Which fix does the app use: a pause button
on each card, an automatic stop after a number of plays, or a setting? What
happens to the tap that restarts the movement?

## What the app does today

- `src/components/ParticleGlyph.tsx` exports `GLYPH_DURATION_MS = 700`,
  `GLYPH_LOOP_PAUSE_MS = 2000` and `GLYPH_CYCLE_MS = 2700`. The start delay is
  0 ms.
- `src/index.css` runs one CSS animation on `.particle-glyph-mover` and one on
  `.meaning-picture-mover`. Each has the duration `var(--glyph-cycle)` and the
  iteration count `infinite`. The movement takes the first 25.926 % of each
  cycle. The remainder of the cycle holds the rest frame.
- The animations have no fill mode. The base style of each mover is the
  complete rest frame. So a mover with no animation shows the rest frame.
- With motion allowed, each component is a `<button type="button">` in a
  44 × 44 CSS px box (`size-11`). The names are `Replay movement: <particle>`
  and `Replay picture`. A click changes a React key. This remounts the SVG and
  restarts the animation.
- Under `prefers-reduced-motion: reduce`, the global rule in `src/index.css`
  sets `animation-iteration-count: 1 !important` and
  `animation-duration: 0.01ms !important`. Each component reads the media
  query one time at mount. If it matches, the component renders a `<span>`
  with `aria-hidden="true"` and no button.
- `ParticleVerbCard.tsx` renders the glyph or the picture above the lemma
  heading, on the introduction card and on the feedback panel. The glyph row
  is 44 px high. A second control in that row, or a taller row, moves "Next
  Card" and "Got it" down on a 360 × 640 screen.
- The settings store (`swedish-verbs-settings`) has no version field.

## WCAG 2.2.2

Success criterion 2.2.2 (Pause, Stop, Hide, level A) applies to moving content
that has all three of these properties:

1. It starts automatically.
2. It lasts more than 5 s.
3. It shows in parallel with other content.

The loop of decision H has all three properties, so the app does not meet
2.2.2 today. The fix must remove one property or add a control. Property 3
stays: the glyph sits next to the text that the learner reads. Property 1
stays: the human requires the automatic first play. This rule removes
property 2.

| Time after mount | State                                               |
| ---------------- | --------------------------------------------------- |
| 0 ms             | play 1 starts                                       |
| 700 ms           | play 1 ends, rest frame                             |
| 2700 ms          | play 2 starts                                       |
| 3400 ms          | play 2 ends, rest frame, no more automatic movement |
| 5400 ms          | the CSS animation ends, the picture does not change |

The last change on the screen is at 3400 ms. That is 1600 ms less than the
5 s limit. From 3400 ms to 5400 ms the animation holds values that are equal
to the base style, so nothing moves. Three plays end at 6100 ms. That is more
than 5 s, so three plays are not allowed with the current timing.

A tap starts a new sequence. That movement does not start automatically, so
property 1 is absent. It also ends after 3400 ms. Thus 2.2.2 does not apply to
it.

The OS reduced-motion setting is not a part of this argument. It stays as an
additional protection.

## Why two plays, and not the other fixes

**Automatic stop (chosen).**

- It protects every learner on every card with no action. A learner who is
  distracted by movement does not have to find a control first.
- It also removes the distraction cost that rule 3 of the glyph note records.
  After 3400 ms nothing moves next to the sentence and the sense line.
- It keeps a part of the reason for the loop. The record does not give the
  reason for decision H, other than the transience remedy (Ayres & Paas 2007)
  that the glyph note records for the loop. The picture note gives "attention"
  as a reason for the animation, not for the loop. The second play starts
  2700 ms after the mount, so a learner who looks late still sees one repeat.
- After the second play, the meaning does not disappear. The rest frame is
  complete: the mover is at the end of its path, and the direction cue shows
  the travel direction. The sense line gives the meaning in text.
- It needs no new control, no new string, no layout change and no stored
  field. The change is one CSS value.
- Its cost: a learner who first looks at the glyph after 3400 ms sees no
  movement. After 3400 ms the state is the state before decision H: play, rest
  frame, tap to replay. The transience remedy of the loop is lost. The tap is
  the remedy, as it was before decision H.

**Pause button on each card (rejected).**

- It leaves the default as movement without end. The learner who is harmed by
  the movement must act on every card. A typical session has many cards.
- The 44 px glyph is the only tap target in its row. A second 44 px control in
  that row puts a pause icon next to a picture that must contain no added
  symbols. A control below the row adds height above "Next Card" and "Got it"
  on a 360 × 640 screen.
- One button that both pauses and restarts changes the tap from "play again"
  to "stop". The learner cannot see which state the button is in without an
  added icon.
- It needs new strings and a state for each card. It does not reduce the
  distraction for a learner who does not find the control.

**Setting (rejected).**

- It needs a new stored field. The settings store is not versioned. A new
  field needs a version field, a forward migration and human approval first.
- A setting that is off by default leaves the default as movement without
  end. The learner must find the settings page before the movement stops.
- "A settings toggle" is out of scope in the glyph note (settled point 5).

## Rules

### 1. Number of plays

- One sequence is 2 plays. This is `GLYPH_PLAY_COUNT = 2`.
- Play 1 starts at the mount of the feedback panel or the introduction card,
  with a 0 ms delay.
- The timing of one cycle does not change: 700 ms of movement, then 2000 ms at
  the rest frame.
- All movement of a sequence ends at
  `GLYPH_START_DELAY_MS + (GLYPH_PLAY_COUNT - 1) × GLYPH_CYCLE_MS + GLYPH_DURATION_MS`.
  With the current values this is 0 + 2700 + 700 = 3400 ms. This is
  `GLYPH_MOTION_END_MS`.
- `GLYPH_MOTION_END_MS` must be 5000 ms or less. A test enforces this limit.
  A change to a timing constant that breaks the limit must fail the test.
- After the sequence, the mover shows the rest frame. It does not move again
  until a tap or a new mount.
- A re-render of the same panel or card does not restart the sequence and
  does not add a play (for example, after "Pronounce sentence").
- A new card mounts a new glyph, and that glyph plays its own sequence.
- The rule is the same for the glyph and the picture, and the same on the
  feedback panel and the introduction card.

### 2. Tap to restart

- A tap on the glyph or the picture starts a full sequence from the start
  state: 2 plays, 3400 ms.
- A tap during a sequence restarts the sequence from the start state. This is
  true during movement and during the rest.
- A tap after the sequence is complete starts a new sequence.
- There is no limit on the number of taps.
- A tap never pauses or stops movement. A sequence stops by itself.
- A tap never grades, schedules or advances a card. It never disables, hides
  or delays a control. "Next Card" and "Got it" work from the first frame.
- The glyph does not take focus by itself.

### 3. Control, size and labels

- The control stays one `<button type="button">` in a 44 × 44 CSS px box. The
  SVG stays 40 × 40 CSS px.
- There is no new visible control, icon or text.
- The accessible names stay exactly as they are:
  - glyph: `Replay movement: <particle>` (for example `Replay movement: upp`)
  - picture: `Replay picture`
- These names are true before, during and after a sequence, so the name does
  not change with the state. There is no `aria-pressed` and no live region.
- There is no new Swedish string and no new English string.

### 4. Reduced motion

- Nothing changes. Under `prefers-reduced-motion: reduce`, the glyph and the
  picture show the rest frame at once and do not move.
- Under reduced motion they are not buttons. They have no `onClick`, no
  `tabIndex` and no focus ring, and they are `aria-hidden="true"`.
- The global rule sets the iteration count to 1 with `!important`. It
  overrides the count of 2. No extra CSS is necessary.
- Each component reads the media query one time at mount, as it does today.

### 5. Storage

- No `localStorage` key or field changes. No setting is added. No migration is
  necessary.

## Parameters, collected

| Parameter             | Value                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Plays in one sequence | 2 (`GLYPH_PLAY_COUNT`)                                              |
| Movement              | 700 ms (`GLYPH_DURATION_MS`), no change                             |
| Rest between plays    | 2000 ms (`GLYPH_LOOP_PAUSE_MS`), no change                          |
| Cycle                 | 2700 ms (`GLYPH_CYCLE_MS`), no change                               |
| Start delay           | 0 ms (`GLYPH_START_DELAY_MS`), no change                            |
| End of all movement   | 3400 ms after mount or tap (`GLYPH_MOTION_END_MS`)                  |
| Limit                 | 5000 ms (`GLYPH_MOTION_LIMIT_MS`), margin 1600 ms                   |
| CSS iteration count   | `var(--glyph-plays)` = 2, never `infinite`                          |
| Fill mode             | none (the base style is the rest frame)                             |
| Tap                   | restarts the sequence of 2 plays, no limit, never pauses            |
| Tap area              | 44 × 44 CSS px, no change                                           |
| Accessible names      | `Replay movement: <particle>`, `Replay picture`, no change          |
| Pause button          | none                                                                |
| Setting, stored field | none                                                                |
| Reduced motion        | rest frame, 1 iteration at 0.01 ms, not a button, no change         |
| Applies to            | `ParticleGlyph` and `MeaningPicture`, feedback panel and intro card |
| WCAG 2.2.2            | does not apply: automatic movement lasts 3.4 s                      |

## What we will not claim

We cannot measure whether two plays teach as well as a loop without end. The
app has no backend and no control group. The only check is the subjective
check of the maintainer during use. We also do not claim a full WCAG audit.
This note covers 2.2.2 for the glyph and the picture only.

## How we would know this was wrong

The maintainer makes these checks by hand.

- The maintainer frequently looks at the glyph after it stopped and wants to
  see the movement. First, use the tap. If the tap is not enough, reduce the
  rest between plays to 1400 ms and set `GLYPH_PLAY_COUNT` to 3. Then all
  movement ends at 4900 ms. A rest of 1400 ms makes the cycle 2100 ms. The
  keyframe value 25.926 % must then change to 33.333 % in all six keyframes in
  `src/index.css`. Also scale the other stops by 2700 / 2100: sway 6.5 % to
  8.357 % and 19.4 % to 24.943 %, pulse 13 % to 16.714 %. Do not go back to a loop without end unless a new
  decision adds a pause control.
- The second play still distracts from the sentence. Set `GLYPH_PLAY_COUNT` to 1. This needs a human decision, because it goes back to one play.
- The learner does not find the tap. This is not a 2.2.2 problem, because the
  movement stops by itself. Report it to the lead as a separate question.
- A later change adds movement that lasts more than 5 s to a card. Then 2.2.2
  applies again to that movement, and this note does not cover it.

## Hand-off

One implementation ticket for `frontend-expert`, and one test ticket for
`qa`. There is no work for `srs-engine`, `swedish-linguist`, `devops` or
`staff-engineer`. The change touches no storage and no cross-owner file.

### `frontend-expert`

Files: `src/components/ParticleGlyph.tsx`, `src/components/MeaningPicture.tsx`,
`src/index.css`. Do not change `src/components/ParticleVerbCard.tsx` or
`src/hooks/useSettings.ts`.

1. In `ParticleGlyph.tsx`, export these constants:
   - `GLYPH_PLAY_COUNT = 2`
   - `GLYPH_MOTION_END_MS = GLYPH_START_DELAY_MS + (GLYPH_PLAY_COUNT - 1) * GLYPH_CYCLE_MS + GLYPH_DURATION_MS`
     (3400)
   - `GLYPH_MOTION_LIMIT_MS = 5000`
2. In `ParticleGlyph.tsx`, add `'--glyph-plays': String(GLYPH_PLAY_COUNT)` to
   the inline custom properties of the mover.
3. In `MeaningPicture.tsx`, import `GLYPH_PLAY_COUNT` and add the same custom
   property to the inline style of the mover group.
4. In `src/index.css`, replace `infinite` with `var(--glyph-plays)` in the
   `animation` shorthand of `.particle-glyph-mover`.
5. In `src/index.css`, replace `animation-iteration-count: infinite` with
   `animation-iteration-count: var(--glyph-plays)` on `.meaning-picture-mover`.
6. Do not give `var(--glyph-plays)` a fallback value. If the property is
   absent, the result is safe in both cases. For the glyph, the shorthand
   `animation` contains `var(--glyph-plays)`, so the complete `animation`
   declaration is invalid at computed-value time: the animation name is
   `none`, the glyph shows the rest frame, and nothing moves. For the picture,
   the longhand `animation-iteration-count` becomes 1.
7. Do not add a fill mode. Do not change the keyframes or the 25.926 % value.
8. Do not add a JavaScript timer. The CSS iteration count stops the movement.
9. Keep the restart by React key. A click remounts the SVG, and the new
   animation plays 2 times.
10. Keep the button, its classes, its 44 px box and its `aria-label` exactly
    as they are. Keep the reduced-motion branch exactly as it is.
11. Rename the tap state `playCount` in `ParticleGlyph.tsx` and
    `MeaningPicture.tsx` (for example to `replayKey`). Then "play count" has
    one meaning: `GLYPH_PLAY_COUNT`.
12. Update the comments in the two components and in `src/index.css` that say
    "infinite" or "loops", and refer to this note.

### `qa`

Files: `src/components/ParticleGlyph.test.tsx`,
`src/components/MeaningPicture.test.tsx`, `e2e/particle-glyph.spec.ts`, and
each other spec that asserts an `infinite` animation on these movers.

The assertions that expect `infinite` (for example
`ParticleGlyph.test.tsx` line 234 and `e2e/particle-glyph.spec.ts` lines 138,
140 and 253) change to the new rule. This is a rule change. It is not a
weaker test. The unit tests read the exported constants, the inline custom
properties and the stylesheet source as text, because jsdom does not compute
keyframes.

Unit tests:

1. `GLYPH_PLAY_COUNT === 2`.
2. `GLYPH_MOTION_END_MS === GLYPH_START_DELAY_MS + (GLYPH_PLAY_COUNT - 1) * GLYPH_CYCLE_MS + GLYPH_DURATION_MS`,
   and it equals 3400.
3. `GLYPH_MOTION_LIMIT_MS === 5000` and
   `GLYPH_MOTION_END_MS <= GLYPH_MOTION_LIMIT_MS`.
4. The glyph mover has the inline custom property `--glyph-plays` with the
   value `"2"`, for each glyph name.
5. The picture mover has the inline custom property `--glyph-plays` with the
   value `"2"`, for each picture id.
6. The `.particle-glyph-mover` rule in the stylesheet contains
   `var(--glyph-plays)` and `var(--glyph-cycle)`.
7. The `.meaning-picture-mover` rule contains
   `animation-iteration-count: var(--glyph-plays)`.
8. The word `infinite` is in no rule of `.particle-glyph-mover` or
   `.meaning-picture-mover`.
9. Neither rule sets `animation-fill-mode`, and the `animation` shorthand
   contains no `forwards` or `both`.
10. With motion allowed, the glyph is a button named
    `Replay movement: <particle>`, and the picture is a button named
    `Replay picture`. Each has the class `size-11`.
11. A click remounts the SVG. The button and its name stay.
12. Each component has exactly one button. No element has a name that
    contains "Pause" or "Stop".
13. A re-render with the same props does not remount the SVG.
14. Under reduced motion, there is no button, and the wrapper is
    `aria-hidden="true"`.
15. The existing tests for the keyframe percentage, the 1500 ms cap and the
    cycle sum stay and pass.

End-to-end tests (Chromium, 360 × 640):

1. Feedback panel, motion allowed: the mover has one animation with
   `iterations === 2`, a duration of 2700 ms, and the computed
   `animation-iteration-count` of `"2"`.
2. When that animation is complete, `getAnimations()` on the mover is empty,
   and the mover is at the rest frame (the computed `transform` is `none`).
3. At 3400 ms or more after the mount, the bounding box of the mover is equal
   to its box at the rest frame.
4. A click on the button after the sequence gives a new mover node with one
   animation, `iterations === 2`, and a current time of less than 1500 ms.
5. A click during the sequence gives the same result as test 4.
6. Introduction card of a flagged entry: the same as test 1.
7. A card with a meaning picture: the same as tests 1, 2 and 4, on
   `.meaning-picture-mover`.
8. Reduced motion: no button, the computed iteration count is `"1"`, and
   nothing moves. This test does not change.
9. "Next Card" and "Got it" are enabled on the first frame, during the
   sequence and after it.
10. No button on the card has a name that contains "Pause" or "Stop".

### Lead

- Create the two follow-up issues in Linear after the human merges this PR.
- Before a completion claim on the implementation, run `npm run lint`,
  `npm run typecheck`, `npm test` and `npm run build`.

## Sources

W3C, _Web Content Accessibility Guidelines (WCAG) 2.2_, success criterion
2.2.2 Pause, Stop, Hide (level A), and _Understanding SC 2.2.2_. Ayres & Paas
2007, _Making instructional animations more effective: a cognitive load
approach_, Applied Cognitive Psychology 21. Tversky, Morrison & Bétrancourt
2002, _Animation: can it facilitate?_, International Journal of Human-Computer
Studies 57.
