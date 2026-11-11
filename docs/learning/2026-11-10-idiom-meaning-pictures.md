# Meaning pictures for idiomatic particle verbs

Linear ORD-130 (epic). Pilot: `ge upp` and about four more entries.

Amended 2026-11-11 by ORD-136, after the pilot shipped (ORD-134). The changes
are: two data fields, the `contrast` ruling, the pilot counts, the failure
threshold and the drawing lessons. See "Amendments, 2026-11-11 (ORD-136)".

**Proposed amendment, pending the human's decision (2026-11-11).**
[[2026-11-11-glyph-loop-auto-stop]] (ORD-137) proposes to replace the loop
without end in settled point 2. The picture would play two times, then stop at
the rest frame. A tap would play the sequence again.

## Decision

An idiomatic particle verb can show a meaning picture. A meaning picture shows
what the phrase means. It does not show what the particle means alone. An entry
gets a meaning picture only when the picture is true for **every** example
sentence of the entry, and a learner cannot read it as the literal motion of the
particle. The picture uses the same placement, loop and reduced-motion rules as
the motion glyph: above the lemma on the feedback card and on the introduction
card, 700 ms of motion, 2000 ms of rest, repeat; under reduced motion, the rest
frame only, and it is not a button. The default is no picture. An entry with no
clear, true picture gets no picture. Most of the 141 idiomatic entries will get
none, and that is correct. The data fields are `meaningPictureId` and
`meaningPictureApproved`. Both are absent by default. The id names the drawing.
The `swedish-linguist` sets the flag only after the human approves that picture
for that entry. A picture shows only when the entry has both (amendment A1).

## Question

Which idiomatic particle verbs get a picture of their meaning, what does that
picture look like, and how do we prevent a picture that teaches a false
meaning?

## Settled before this note

The human approved these points. This note works inside them.

1. The goal is **meaning recall**. It is not recall of the particle.
2. The human likes the `ge upp` sketch: a pole and an outline white flag. The
   pole is a still landmark in the muted colour. The flag is in the primary
   colour. The flag waves for 0.7 s, rests for 2 s, and repeats. On the card it
   sits above the lemma.
3. The literal `upp` motion glyph must not show on `ge upp`. It would teach
   "upward", which is false for this phrase.
4. The motion glyph rules for literal entries do not change: the gate, default
   deny, the human batch approval, placement above the lemma on the feedback
   card and on the introduction card, 700 ms motion + 2000 ms rest loop,
   reduced motion = rest frame with no button. The WCAG 2.2.2 cost (a loop with
   no pause control) is accepted.

**Note for the lead.** The copy of
[[2026-11-10-particle-motion-glyphs]] in this tree still says "feedback panel
only, play once, beside the sense line", and `ParticleGlyph.tsx` is not in this
tree. This note follows the rules in point 4, as the lead gave them on
2026-11-10. If the amended glyph note says something different, the amended
glyph note wins for placement and timing, and this note follows it.

## What the app does today

The entry type has `transparency: 'literal' | 'idiomatic'`, `gloss`,
`examples` and `verified` (`src/data/particleVerbData.ts`, lines 104–151).
There is no picture field. A picture field is static data. It is not a
`localStorage` field, so it needs no storage migration.

The pilot entry today:

```464:501:src/data/particleVerbData.ts
    id: 'pv:ge-upp',
    ...
    gloss: { en: 'to abandon an effort; to surrender' },
    transparency: 'idiomatic',
    ...
      { sv: 'Han ger upp efter tre timmar av hårt arbete.', ... },
      { sv: 'Vi ger aldrig upp trots alla svåra problem.', ... },
      { sv: 'Hon ger upp sin plats i tävlingen.', blankIndex: 2 },
```

The gloss has two parts with a semicolon. The third example ("she gives up her
place in the competition") is "relinquish something", not "stop trying" and
not "surrender". A white flag is true for the first two examples. It is not
clearly true for the third. So `ge upp` does **not** pass the gate today. See
"Worked check" below.

## Evidence

**Pictures for idioms help the meaning, not the words.** Boers, Piquer Píriz,
Stengers & Eyckmans (2009) gave learners pictures with idioms. The pictures
helped learners recall the **meaning** of the idiom. They did not help learners
recall the exact **words**. For some learners, the pictures took attention from
the words. This matches our goal. It also sets the limit: the cards in this app
drill the particle (the cloze blank and the recall answer). The picture is a
memory aid for the meaning. It will not help the learner fill the particle
blank, and we do not claim that it will.

**Dual coding.** A meaning that is held as a word and as a picture is easier to
retrieve than a meaning held as a word only (Paivio 1986; Clark & Paivio 1991).
The effect is strongest for concrete meanings. An idiom meaning is abstract. A
picture helps only when one concrete scene stands for the abstract meaning
without doubt. The white flag for "surrender" is such a scene. Most idioms do
not have one. That is why the default is no picture.

**The source of the metaphor.** Boers (2000) found that learners who know the
source domain of a figurative expression retain it better. This argues for
pictures of the literal source in some cases. We do not use that argument for
particle motion. For most idiomatic particle verbs, the literal motion of the
particle is not the source of the meaning (`ge upp` does not mean "give
upward"). A picture of that motion teaches a false source. So a meaning
picture shows the meaning, never the particle's direction.

**Animation is not better than a good still.** Tversky, Morrison & Bétrancourt
(2002) reviewed the studies. When an animation and a still picture carry the
same information, the animation usually does not teach more. There is no
evidence that the waving flag teaches more than a still flag. The animation is
the human's choice, for attention and consistency with the motion glyph. So the
**rest frame alone** must carry the complete meaning. A learner with reduced
motion then loses nothing that teaches.

**Transience costs memory.** Ayres & Paas (2007) describe the transient
information effect. Information that disappears must be held in working
memory. The loop and the complete rest frame remove this cost: the picture
never disappears.

**What the evidence does not say.** Boers et al. (2009) used English idioms,
university learners and printed pictures. No study tests 24 × 24 SVG pictures
beside Swedish particle verbs on a phone. The direction is defensible. The
size of the benefit is unknown. A wrong picture can do harm that we can not
measure. This is the reason for the strict gate.

## Options and their cost to the learner

**Meaning picture with a strict gate (chosen).** A few idioms get a true,
concrete picture. Cost: most idioms get no picture, so the app looks
inconsistent between entries. The learner can not use "no picture" as a cue,
because many literal entries also have no glyph.

**Runner-up: no pictures for idiomatic entries.** It lost because the human
wants them, and Boers et al. (2009) support pictures for idiom meaning. The
risk is controlled by the gate and by human approval per picture.

**Literal particle glyph on idiomatic entries.** Rejected. It teaches a false
meaning (`ge upp` = "give upward").

**A picture for every idiomatic entry.** Rejected. Many idioms have no concrete
scene. A forced picture is a wrong picture, and a wrong picture teaches a wrong
meaning with the same authority as text.

**Pictures that show people or gestures.** Rejected. Faces and gestures are
culture-specific, are hard to read at 40 px, and pull attention to the person.

## Rules

### 1. Placement, timing and reduced motion

Same as the motion glyph (point 4 of "Settled before this note"). Do not
redefine the timing. Import the same timing constants that the motion glyph
uses.

Additional rules:

- The picture never shows on a graded prompt before the answer. It shows on the
  introduction card and on the feedback card only.
- The picture shows after a correct answer and after a wrong answer. It looks
  the same after both. It never uses the success colour or the destructive
  colour.
- On a discrimination card, the picture of the tapped lure never shows.
- An entry never shows a motion glyph and a meaning picture together. The gate
  (rule 3) makes this impossible. A test also asserts it.
- The accessible name of the replay button does not describe the picture.
  Use `Replay picture`. Reason: a text such as "white flag" is a new piece of
  content that nobody has checked against the examples. The gloss carries the
  meaning in text.

### 2. Style of a meaning picture

| Rule                 | Value                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Content              | a scene with **one** landmark and **one** moving or changing element, **or** one recognizable object                 |
| People               | none: no figures, no faces, no hands, no gestures                                                                    |
| Text                 | none: no letters, no digits, no symbols that read as text                                                            |
| Colours              | two theme tokens only: mover or subject in `--primary`; landmark or support in `--muted-foreground`                  |
| Fill                 | outline strokes; same stroke width as the motion glyphs; a fill only where it is necessary to recognize the object   |
| viewBox              | `0 0 24 24`                                                                                                          |
| Drawn size           | 40 × 40 CSS px, centred in the 44 × 44 CSS px tap box                                                                |
| Animation technology | CSS keyframes only; no JS animation, no library, no raster, no video                                                 |
| Animated elements    | **one** element                                                                                                      |
| Kind of motion       | in place only: wave, sway, turn, grow or shrink, fade                                                                |
| Net translation      | **0** at the end of each cycle; peak translation **2** viewBox units or less                                         |
| Rotation             | **20°** or less from the rest frame, about a fixed point on the element                                              |
| Base style           | the complete rest frame; the keyframes define only the non-rest states; each cycle starts and ends at the rest frame |
| Rest frame           | carries the complete meaning alone                                                                                   |
| Not a glyph          | must not look like any of the six motion glyphs: no lone dot with a chevron, no arrow, no path trace along an axis   |

**Why in-place motion only.** A moving element that travels up, down, in or out
reads as a motion glyph. The learner then attaches the particle direction to
the idiom. That is the false meaning this note exists to prevent.

**Why the rest frame carries the meaning.** Reduced-motion users see only the
rest frame. Tversky et al. (2002) give no reason to expect the motion to add
meaning. So the motion is decoration on top of a complete still.

**The `ge upp` sketch against these rules.** Pole = landmark in
`--muted-foreground`. Outline flag = moving element in `--primary`. The flag
waves in place. It does not rise. No dot, no chevron. The rest frame (a white
flag on a pole) reads as "surrender" without motion. The sketch passes the
style rules. It does not yet pass the entry gate (see "Worked check").

**Cultural specificity.** The object must have a meaning that is international,
not specific to one country or one language. A white flag for surrender is an
international convention. Do not draw the image of an **English** idiom with
the same meaning (for example a towel for "throw in the towel"). That teaches
the English idiom, not the Swedish meaning. Doubt = no picture.

### 3. Eligibility, per entry

An entry gets a meaning picture only when all seven gates pass. The default is
no picture.

1. `verified === true`.
2. `transparency === 'idiomatic'`.
3. **One sense.** The gloss names one sense. If the gloss lists two senses, the
   entry splits first, by the split rule of human decision E in
   [[2026-11-10-particle-motion-glyphs]] (rule 9): the existing `pv:` id is
   never renamed or removed, it keeps the majority sense, and the other sense
   becomes a new appended entry. A gloss with a semicolon is not
   automatically two senses. The `swedish-linguist` decides whether the two
   parts are two senses or two paraphrases of one sense, and writes a one-line
   reason in the PR. Doubt = two senses.
4. **Every example.** The picture is true for **every** sentence in `examples`.
   The card rotates the shown sentence, so the picture appears beside each
   example in turn. One sentence where the picture is false, or not clearly
   true, fails the entry. Doubt = fail.
5. **Not literal motion.** A learner can not read the picture as the literal
   motion of the particle. The `ui-ux-expert` checks this at rest-frame review
   (rule 6).
6. **One picture.** Exactly one picture id per entry. The field holds one value,
   not a list.
7. **Human approval, per picture.** The human approves each picture for each
   entry. The `swedish-linguist` sets `meaningPictureApproved` on the entry
   only after that approval. Absent means no picture (amendment A1).

A `contrast` line on the entry is not a gate (amendment A2).

Gates 1, 2 and 6 are code. Gates 3 and 4 are the linguist's native check. Gate
5 is the `ui-ux-expert`'s review. Gate 7 is the human's sign-off. Unlike the
motion glyph, the approval is **per picture**, not one batch. Reason: each
picture is a new drawing with its own risk of a wrong meaning. A batch approval
of a list of words does not check the drawings.

**Rewriting examples to fit a picture.** Not allowed by default. The picture
serves the examples. The examples do not serve the picture. Exception: an
example that does not match the entry's own gloss is a data defect. The linguist
fixes that defect under the normal rewrite conditions (correct, natural Swedish;
keeps the gloss; doubt = do not rewrite). See open question 1.

### 4. The data field

| Field             | `meaningPictureId?: MeaningPictureId`                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Location          | entry type in `src/data/particleVerbData.ts` (owner: `swedish-linguist`)                                      |
| Type              | a string union of picture ids, for example `'white-flag'`; defined in the data file                           |
| Default           | absent = no picture                                                                                           |
| Meaning           | the drawing for this entry; the id alone shows no picture (amendment A1)                                      |
| Approval flag     | `meaningPictureApproved?: true` on the same entry; gate 7; absent = no picture                                |
| Allowed when      | `transparency === 'idiomatic'` and `verified === true`; a dataset test fails on any other entry               |
| Exclusive with    | `motionGlyphVerified`; a dataset test fails if one entry has both                                             |
| Drawing registry  | `Record<MeaningPictureId, …>` in the frontend component, so `npm run typecheck` fails if an id has no drawing |
| Storage migration | none; static data                                                                                             |

Runner-up: a boolean `meaningPictureVerified` plus a separate id map. It lost
because it has two sources of truth: an entry could be verified with no
drawing, or have a drawing with no approval. One optional id field can not be
in either state. (Amended by ORD-136. The code uses an id and an approval flag
on the same entry. Amendment A1 gives the reason.)

A picture id can be shared by two entries only when both entries pass all seven
gates for it on their own, and the human approves each entry separately.

### 5. Introduction card

The picture shows on the introduction card, above the lemma, as the motion
glyph does. The introduction card is not graded. The first graded cloze comes
later in the same sitting ([[particle-verb-practice]]), and its prompt shows no
picture. So the picture does not give a free grade.

## Worked check: `ge upp`

- Gate 1: `verified: true`. Pass.
- Gate 2: `idiomatic`. Pass.
- Gate 3: gloss "to abandon an effort; to surrender". The linguist decides if
  this is one sense or two. A white flag fits both parts, so the split would
  not change the picture. The linguist records the ruling.
- Gate 4:
  - "Han ger upp efter tre timmar av hårt arbete." He stops trying. White flag:
    true.
  - "Vi ger aldrig upp trots alla svåra problem." We never stop trying. White
    flag: true.
  - "Hon ger upp sin plats i tävlingen." She relinquishes her place. This is
    not "stop trying" and not "surrender" in the gloss. White flag: not clearly
    true. **Doubt = fail.**
- Result: `ge upp` fails gate 4 today. It passes only if the third example is
  replaced by a sentence that uses the gloss sense. The third example arguably
  does not match the gloss. Whether the linguist may replace it is open
  question 1.

## Risks, stated plainly

- **A wrong picture teaches a wrong meaning.** The learner trusts a picture as
  much as the text beside it. A picture that is true for two examples and false
  for the third teaches a false meaning one card in three. This is why gate 4
  tests every example and why doubt = fail.
- **The picture can give away the answer.** On the introduction card the
  picture is beside the lemma and the meaning, which is the purpose of that
  card. The risk is a picture on a graded prompt. Rule 1 forbids it. The first
  cloze is graded and shows no picture before the answer.
- **The picture helps meaning, not the particle.** The cards grade the
  particle. The picture will not make the learner's grades better, and nobody
  should expect it to (Boers et al. 2009).
- **Cultural specificity.** An object or a symbol can mean different things in
  different cultures. A learner whose culture reads the object differently
  learns a wrong meaning. Rule 2 limits pictures to international objects.
- **Maintenance.** A picture is checked against the examples that exist on the
  day of the check. When an example changes, the check is no longer valid. Any
  PR that changes `examples` or `gloss` on an entry with `meaningPictureId`
  must remove the field or re-run gates 3, 4 and 7 for that entry in the same
  PR.
- **Inconsistency.** Most idiomatic entries have no picture. The learner sees
  pictures on some cards and not on others. We accept this. A forced picture is
  worse.
- **Looping motion.** The picture loops with no pause control. WCAG 2.2.2
  asks for a pause control on motion that lasts more than 5 s. The human
  accepted this cost for the motion glyph. It applies here too.

## Parameters, collected

| Parameter                 | Value                                                                   |
| ------------------------- | ----------------------------------------------------------------------- |
| Entries                   | `idiomatic`, `verified`, one sense, all seven gates                     |
| Default                   | no picture                                                              |
| Data field                | `meaningPictureId?: MeaningPictureId`, absent by default                |
| Approval flag             | `meaningPictureApproved?: true`, absent by default                      |
| `contrast` line           | not a gate for a meaning picture                                        |
| Pictures per entry        | exactly 1                                                               |
| Approval                  | human, per picture per entry                                            |
| Screens                   | introduction card and feedback card, above the lemma; never on a prompt |
| Timing                    | same constants as the motion glyph (700 ms motion, 2000 ms rest, loop)  |
| Reduced motion            | rest frame only, not a button, `aria-hidden="true"`                     |
| Replay button name        | `Replay picture`                                                        |
| viewBox                   | `0 0 24 24`                                                             |
| Drawn size / tap box      | 40 × 40 px / 44 × 44 px                                                 |
| Colours                   | `--primary` (mover or subject), `--muted-foreground` (support)          |
| Animated elements         | 1                                                                       |
| Net translation per cycle | 0; peak 2 viewBox units or less                                         |
| Rotation                  | 20° or less                                                             |
| Forbidden                 | people, faces, text, lone dot + chevron, arrows, axis path traces       |
| Pilot size                | 8 pictures drawn, 7 approved and shipped, 1 dropped (`slå in`)          |
| Style failure threshold   | 3 or more of the 7 shipped pictures in 14 days                          |

## What we will not claim

We can not measure whether the pictures improve meaning recall. There is no
backend, no cohort and no control group. We will not claim a gain. The only
check is the maintainer's check while using the app.

## How we would know this was wrong

The maintainer checks these points by hand, during normal practice, for 14 days
after the pilot ships.

- **Rest frame alone.** On a 360 × 640 phone with reduced motion on, look at
  each pilot picture. Cover the gloss. Can you name the meaning in a few words?
  If not, the picture fails. Remove both fields from that entry.
- **Every example.** Practise each pilot entry until you have seen each of its
  examples with the picture. If the picture feels wrong beside one example,
  remove the field from that entry.
- **Literal reading.** If a picture makes you think of the particle direction
  (up, down, in, out, away, back), remove the field. If this happens on 3 or
  more of the 7 shipped pictures, the style rules are too loose. Report it to the
  lead. (Amended by ORD-136. Before, the threshold was 2 of 5. See amendment
  A3.)
- **Attention.** If you look at the picture instead of the correct form on a
  wrong answer, the picture takes attention from the form (Boers et al. 2009).
  Report it to the lead. A possible fix is to show the picture on the
  introduction card only.
- **Distraction.** If the loop distracts you while you read the feedback,
  report it. This also applies to the motion glyph. Fix both together.
- **Stale picture.** If an entry with a picture has examples that changed
  since the picture was approved, the maintenance rule failed. Remove the field
  and report it.

The pilot expands to more entries only when the maintainer reports no failure
from this list after 14 days.

## Amendments, 2026-11-11 (ORD-136)

The pilot shipped on 2026-11-11 (ORD-134, PR #551). The code differs from the
first version of this note in three places, and the pilot gave drawing
lessons (A4). These rulings make the note agree
with the code. Where an earlier paragraph disagrees with this section, this
section applies.

### A1. Two fields: the id is data, the flag is the approval

The entry type has two optional fields (`src/data/particleVerbData.ts`):

- `meaningPictureId?: MeaningPictureId` names the drawing for the entry. It is
  data. It does not show a picture.
- `meaningPictureApproved?: true` records gate 7. The human approved that drawn
  picture for that entry.

The first version of this note put the id and the approval in one field. The
code uses two fields, because the approval comes after the drawing. Hand-off
steps 3 to 5 draw and review a picture for a named entry. In the pilot, the entry held
the id during those steps, before the human approves the drawing. One field can
not record "a drawing exists, and the human did not approve it yet". In the
pilot, eight entries held an id while no picture was approved.

The first version rejected two fields because two fields can disagree. The
code prevents the harm. `getMeaningPicture` in `src/lib/particleVerbs.ts` is
the only read path. It returns an id only when the flag is `true` and the id is
a known id. An id with no flag shows no picture. A flag with no id shows no
picture. Each disagreement fails to "no picture", which is the safe default.

Rules that follow from this:

- Where this note says "remove `meaningPictureId`" or "remove the field",
  remove both fields.
- Hand-off step 6 changes. The linguist sets the id when the human picks the
  pilot set. The linguist sets the flag after the approval of gate 7.
- A dropped picture leaves no id on the entry and no id in the
  `MeaningPictureId` union.

### A2. The `contrast` line is not a gate for a meaning picture

The motion glyph gate denies an entry that has a `contrast` line
(`getParticleGlyph`, gate 3). `getMeaningPicture` has no such check. This is
correct, and it stays.

Reason. A motion glyph shows the particle. The contrast reading uses the same
particle, so the glyph can attach to the two readings. A meaning picture shows
the meaning of the entry. The contrast reading has a different meaning, so a
true picture of the entry is false for the contrast reading. The picture then
helps the learner to keep the two readings apart.

Three pilot entries have a `contrast` line and an approved picture:

| Entry     | Picture            | Contrast reading in the data               |
| --------- | ------------------ | ------------------------------------------ |
| `se upp`  | `warning-triangle` | to admire someone; to raise one's gaze     |
| `gå av`   | `snapping-rod`     | to get off a vehicle                       |
| `köra på` | `car-collision`    | to drive on the road (unstressed particle) |

The three pictures stay. The linguist did not yet do the contrast check on
them. The `swedish-linguist` must confirm the contrast check for these three
entries (Linear follow-up). If one fails, remove both fields from that entry.

One condition applies to an entry with a `contrast` line. At gate 4, the
linguist also checks the picture against the contrast reading. The picture must
be false for that reading. If the picture is also true for the contrast
reading, the entry fails. Doubt = fail. This condition is a part of the native
check. It is not a code gate.

### A3. Pilot counts and the 14-day threshold

Pilot counts, from the approval record in `src/data/particleVerbData.ts`:

| Count                      | Value | Entries                                                                   |
| -------------------------- | ----- | ------------------------------------------------------------------------- |
| Pictures drawn             | 8     | the 7 below and `slå in`                                                  |
| Pictures approved, shipped | 7     | `ge upp`, `skriva ut`, `se upp`, `köra på`, `gå av`, `köra om`, `ta fast` |
| Pictures dropped           | 1     | `slå in` (`wrapping-parcel`, tried 3 times)                               |
| Approved after a redraw    | 1     | `ta fast` (`handcuffs`)                                                   |

The first version said "2 or more of the 5 pilot pictures" for the literal
reading check. That is 40 % of the pilot. The new threshold is **3 or more of
the 7 shipped pictures**.

Rationale:

- 40 % of 7 is 2.8. The threshold is a count of pictures, so it is 3 (43 %).
- A threshold of 2 of 7 is 29 %. That is more strict than the rate the note
  set. Nothing in the pilot is a reason to change the rate.
- The threshold counts shipped pictures only. `slå in` did not ship, so it is
  not in the 7. The human did not approve its drawing in three attempts. That
  is not a literal reading.
- The threshold controls one decision only: are the style rules too loose?
  Each picture that fails still loses its two fields immediately, at the first
  failure. The protection of the learner does not depend on the threshold.

Other numbers do not change. The window is 14 days. It starts on the ship date,
2026-11-11, and ends on 2026-11-25. The pilot expands only when the maintainer
reports no failure from the list in 14 days.

### A4. Drawing lessons from the pilot

These lessons add to rule 2. The `frontend-expert` applies them to each new
drawing. The `ui-ux-expert` checks them at the rest-frame review.

1. **Paper and cloth need a surface.** Outline strokes alone do not show paper
   or cloth. A picture that depends on such a surface needs a fill or a colour
   contrast between the surface and the object. Rule 2 permits a fill where it
   is necessary to recognize the object. If the two colour tokens can not show
   the surface, the entry gets no picture.
2. **Handcuffs need two cuffs and a visible chain.** Two cuffs with a visible
   chain between them read as handcuffs. The approved `handcuffs` drawing has
   two cuffs and a chain of three links.
3. **A single cuff reads as a key ring.** Do not draw one cuff.

Lessons 2 and 3 show a general point. An object with two joined parts needs the
two parts and the joint in the rest frame.

## Hand-off

In order:

1. **`swedish-linguist`: shortlist.** A linguist agent is preparing the
   shortlist of idiomatic candidates for ORD-130 in parallel with this note.
   That shortlist is the input; this note does not wait for it. For each
   candidate, the linguist applies gates 1–4 and writes, in the PR: the gate 3
   ruling (one sense or two, with a reason), the gate 4 result for each example,
   and a one-line description of the proposed picture. Doubt = fail.
2. **Human: pilot set.** The human picks about 5 entries from the shortlist.
3. **`frontend-expert`: drawings and component.** Draw the pilot pictures by
   rule 2. Recommendation: a new component, `src/components/MeaningPicture.tsx`,
   with a `Record<MeaningPictureId, …>` registry. Extract the shared tap box,
   loop timing and reduced-motion handling from `ParticleGlyph.tsx` into one
   shared wrapper, and use it in both components. Do not add meaning pictures
   to `ParticleGlyph.tsx` itself. Reason: the six glyphs are a closed set keyed
   by particle; meaning pictures are an open set keyed by entry. One component
   for both mixes the two gates. Runner-up: a `kind` prop on `ParticleGlyph`.
   It lost because it puts the literal gate and the idiomatic gate in one
   branch, and one bug can then show a literal glyph on an idiom.
4. **`ui-ux-expert`: rest-frame review, per picture.** For each picture: the
   rest frame at 40 px, in the light theme and the dark theme, beside the six
   glyph rest frames. Pass when the picture is readable and is not confusable
   with any glyph (gate 5). Record the result per picture in the PR.
5. **`swedish-linguist`: native check of the drawings.** Check each drawn
   picture against every example of its entry (gate 4 again, on the real
   drawing, not the description).
6. **Human: approval per picture** (gate 7). Then the linguist sets
   `meaningPictureApproved: true` on each approved entry. The linguist set
   `meaningPictureId` on the entry when the human picked the pilot set (step 2).
   See amendment A1.
7. **`qa`: tests.**
   - An entry with `meaningPictureId` is `idiomatic` and `verified`.
   - No entry has both `meaningPictureId` and `motionGlyphVerified`.
   - Every `MeaningPictureId` has a drawing (typecheck covers this; a runtime
     test also covers it).
   - No picture on a graded prompt before the answer.
   - The picture shows on the introduction card and the feedback card for a
     gated entry, and not for an ungated idiomatic entry.
   - No button under reduced motion.
   - The picture timing reads the same constants as the motion glyph.
8. **`srs-engine`: nothing.** The picture does not change a grade, an interval
   or the queue.

## Open questions for the human

1. **May the linguist replace an idiomatic example so that a picture fits?**
   This note says: no by default, yes only when the example does not match the
   entry's own gloss. `ge upp` depends on this. Its third example ("Hon ger upp
   sin plats i tävlingen", relinquish a place) does not match "abandon an
   effort; surrender". If the human says no, `ge upp` gets no picture, and the
   white flag does not ship.

## Sources

Paivio 1986, _Mental Representations: A Dual Coding Approach_. Clark & Paivio
1991, _Dual coding theory and education_, Educational Psychology Review 3(3).
Boers, F. 2000, _Metaphor awareness and vocabulary retention_, Applied
Linguistics 21(4): 553–571. Boers, Piquer Píriz, Stengers & Eyckmans 2009,
_Does pictorial elucidation foster recollection of idioms?_, Language Teaching
Research 13(4). Tversky, Morrison & Bétrancourt 2002, _Animation: can it
facilitate?_, International Journal of Human-Computer Studies 57. Ayres & Paas
2007, _Making instructional animations more effective: a cognitive load
approach_, Applied Cognitive Psychology 21.
