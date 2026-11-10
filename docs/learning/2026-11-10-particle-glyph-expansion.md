# Particle glyph expansion: which new particles get a glyph

Linear ORD-132, epic ORD-130. Extends
[[2026-11-10-particle-motion-glyphs]] (the base note). Every rule of the base
note stays in force. This note adds particles. It changes no rule of the base
note.

## Decision

Six new particles are candidates for a motion glyph: `på`, `av`, `ihop`,
`fram`, `hem` and `undan`. Each candidate has a fixed picture in this note. A
candidate particle gets its glyph only when **3 or more** of its entries pass
gates 1–5 of the base note (rule 9), after the splits and rewrites of human
decisions A and E. Below 3, nobody draws the glyph, and the particle has no
glyph. The design stays in this note for a later recount. The human still
approves every `motionGlyphVerified` flag in one batch (human decision C). A
new glyph also ships only when two more checks pass: the `ui-ux-expert`
confirms that its rest frame is distinct from every other glyph at 44 px
(rule E4), and its sense line names the drawn sense (rule E5). Placement, play
once, tap to replay, never loop, reduced motion, no text, two theme tokens,
CSS only and "the rest frame carries the meaning" do not change. All other
particles get no glyph. An abstract particle never gets a glyph. On my reading
of the current data (not the linguist's ruling), `hem` and `ihop` are likely to
reach 3, `fram` is likely to reach 3, and `på`, `av` and `undan` are likely to
stay below 3.

## Question

The human wants a glyph on as many particle verbs as possible. Which
particles beyond the six get a glyph, what does each glyph show, and how many
passing entries must a particle have before we draw it?

## What the app does today

**Stale-copy warning.** This note was written against a working copy that
does not yet contain `ParticleGlyph.tsx`, `ParticleGlyphId`,
`getParticleGlyph` or the `motionGlyphVerified` field. These are on
`origin/main` (ORD-116 and its follow-ups). The line numbers below are from
the working copy of `src/data/particleVerbData.ts`. They can be different on
`origin/main`. The entry ids, glosses and example sentences are what this note
depends on. Recheck them against `origin/main` before the pass list.

The six glyphs today: `upp`, `ut`, `in`, `ner` (alias `ned`), `bort`,
`tillbaka`. The lead reports that 27 of 285 entries have a glyph.

Literal entries with a particle that has no glyph (counts from the lead, which
agree with the working copy for every particle that this note checked): `på`
8, `av` 7, `ihop` 7, `fram` 4, `hem` 4, `om` 4, `undan` 3, `med` 3, `kvar` 2,
`sönder` 2, `fast` 2, `till` 2, `över` 1, `igen` 1, `samman` 1, `emot` 1, `ur`
1, `i` 1, `iväg` 1. The 141 idiomatic entries get no glyph. A literal picture
of an idiom teaches a false meaning.

The sense lines in `PARTICLE_CORE_SENSE` (`src/lib/particleVerbs.ts`) for the
six candidates:

| Particle | Sense line today                                     |
| -------- | ---------------------------------------------------- |
| `på`     | often switching something on, or keeping at it       |
| `av`     | often separation, or switching something off         |
| `ihop`   | together, into one whole                             |
| `fram`   | often bringing something forward, into view or reach |
| `hem`    | movement home — towards where one lives or belongs   |
| `undan`  | often out of the way, or kept at a distance          |

The `på` line names no spatial sense. Rule E5 applies to it.

## Evidence

The base note gives the evidence for a glyph at all (dual coding, Paivio 1986;
pictures help meaning recall, Boers et al. 2009; a good still is as good as an
animation, Tversky et al. 2002). This note adds two points.

**A picture seen once does not generalise.** The value of a particle glyph is
that the learner sees the same picture beside several verbs with the same
particle. Then the picture attaches to the particle, not to one verb. Boers &
Lindstromberg (2008) describe this as the purpose of a cognitive-linguistic
approach to particles: one motivated core meaning, seen across many phrasal
verbs. A glyph on 1 or 2 entries does not give that repetition.

**Each new picture adds a discrimination.** The learner must tell every glyph
from every other glyph at 44 px. Each new glyph adds a possible confusion
with each existing glyph. There is no study of how many abstract motion
pictures a learner can keep apart at this size.

The threshold of 3 is a judgement, not a finding. No study gives a minimum
number of examples for a particle picture. 3 is the smallest number that gives
the learner the same picture beside more than two different verbs.

## Options and their cost to the learner

**Threshold of 3 passing entries per particle (chosen).** Cost: some literal
entries stay without a glyph, because their particle has only 1 or 2 drawable
entries. The human wants more glyphs. This option gives fewer.

**Draw a glyph for every particle with 1 or more passing entry.** Rejected. A
learner sees a picture beside one verb only. The picture then works as a
picture of that verb, not of the particle, and it still adds one more picture
to tell apart.

**Threshold of 5.** Rejected. On the current data only `på`, `av` and `ihop`
have 5 or more literal entries, and most of the `på` and `av` entries fail the
spatial test (see the worked checks). A threshold of 5 gives almost no new
glyph. The human asked for more.

**Reuse an existing glyph for a near particle** (`iväg` as `bort`, `samman`
as `ihop`, `ur` as `ut`). Rejected. One picture for two particles tells the
learner that the particles are interchangeable. They are not. The
`pv:vika-ihop` entry already records that `samman` "is a different,
register-marked particle, not the ner/ned kind of spelling variant". An alias
is for a spelling variant only (`ned` → `ner`).

## Rules

### E1. Candidates and the inclusion rule

1. The candidate particles are `på`, `av`, `ihop`, `fram`, `hem` and `undan`.
2. For each candidate, the `swedish-linguist` counts the entries that pass
   gates 1–5 of the base note (rule 9), with the direction definitions and
   hard classes of rule E3. Count after the splits and rewrites of human
   decisions A and E.
3. A candidate with **3 or more** passing entries is **in**. The
   `frontend-expert` draws its glyph. The pass list goes to the human for one
   batch approval.
4. A candidate with **2 or fewer** passing entries is **out**. Nobody draws it,
   nobody adds it to `ParticleGlyphId`, and no entry gets a flag for it. The
   design stays in this note.
5. Count per particle. Aliases count with their main particle (`ned` with
   `ner`). There are no new aliases.
6. Recount when the data changes. A particle that reaches 3 later is drawn
   then. A particle that drops below 3 after it shipped keeps its glyph only
   on entries that still pass. The linguist reports the drop to the lead.
7. An "in" particle also needs rule E4 and rule E5 to pass before it ships.

Gate 6 of the base note does not change. Every flag needs the human's batch
approval. The count only decides whether a glyph is drawn.

### E2. The glyph grammar (unchanged from the six)

Every new glyph follows the grammar of the six existing glyphs:

- viewBox `0 0 24 24`, shown in the 44 × 44 CSS px box of the base note.
- One fixed **landmark**. One **mover**: a filled circle, `r = 2.5`.
- The meaning is the path of the mover relative to the landmark.
- The rest frame shows the mover at its end position, a trail of tapered dots
  along the path behind it, and a chevron in front of the mover that points in
  the travel direction.
- Use the same two theme tokens as the six glyphs: one for the landmark, one
  for the mover, dots and chevron. Use the same stroke width, dot count, dot
  radii and chevron size as the six. If a value here conflicts with the six,
  follow the six and report the conflict to the lead.
- The base style is the complete rest frame. The keyframes define only the
  start state. In the start state the mover is at its start position and the
  chevron is not visible.
- 700 ms, `ease-out`, 0 ms delay, 1 iteration, tap to replay, never loop. The
  timing table of base rule 4 applies.
- No text, no letter shape, no arrowhead other than the chevron.

New landmark types (the six use a room bracket, a ground line and a ring
point):

| Landmark | Shape in the 24 × 24 viewBox                                                                                                                               | Used by         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Block    | outline rectangle, x 6–18, y 15–20, corner radius 1                                                                                                        | `på`, `av`      |
| Partner  | outline circle, centre (15, 12), r 2.5, stroke 2 (outer radius 3.5, hole radius 1.5), landmark token. The same ring as the ring point in bort and tillbaka | `ihop`          |
| Cover    | filled rectangle, x 2–8, y 6–18, corner radius 1, landmark token, drawn **above** the mover                                                                | `fram`, `undan` |
| House    | roof lines (11, 12)–(16.5, 5)–(22, 12); right wall x 21, y 12–20; floor y 20, x 12–21; no left wall below the eave                                         | `hem`           |

Each pair of opposites shares one landmark, as `in`/`ut`, `upp`/`ner` and
`bort`/`tillbaka` do.

### E3. The glyphs

Coordinates are mover centres. "Rest frame alone" is what a reduced-motion
learner sees. It must carry the meaning without the motion.

**`på` — onto a surface or body.**

- Landmark: block.
- Mover start (4, 4). Rest (9, 12.5): the mover sits on the top edge of the
  block, on the left half.
- Travel: diagonal, down and to the right. Chevron points down-right.
- Rest frame alone: a disc in contact with the top of an object, with a trail
  from the upper left. "Came to rest on it."

**`av` — off a surface or body.**

- Landmark: block.
- Mover start (15, 12.5): on the top edge of the block, on the right half.
  Rest (20, 5): clear of the block.
- Travel: diagonal, up and to the right. Chevron points up-right.
- Rest frame alone: an object with a disc above and to the right of it, a
  visible gap, and a trail that starts on the top of the object. "Came off
  it."

**`ihop` — together, into one.**

- Landmark: partner (an outline ring, the same ring as the bort/tillbaka ring point: r 2.5, stroke 2, outer radius 3.5).
- Mover start (4, 12). Rest (11, 12): it overlaps the partner by 2 units.
  The stroke is 2 units wide, so the ring's outer edge is at x 11.5 and the
  mover's right edge is at x 13.5.
- A true twin (an outline circle the same size as the mover) was tried and
  rejected: at 40 px its hole disappears, so it reads as a second filled disc.
- Travel: horizontal, to the right. Chevron points right, at the partner.
- Rest frame alone: two discs, one filled and one outline, that overlap, with
  a trail from the left. "Joined."

**`fram` — out of a hidden or stored place, into view or reach.**

- Landmark: cover.
- Mover start (5, 12): the centre of the cover, fully behind it, not
  visible. Rest (20, 12): fully visible, in the open, right of the cover.
  Animation offset from rest: (-15, 0).
- Redrawn once after `ui-ux-expert` review (2026-11-10). In the first
  drawing the trail dots were hidden under the cover, and the chevron
  fused with the slab. The fix was a narrower cover (x 2–8) and a rest
  further right. This uses the one redraw that rule E4 allows. A second
  failure means `fram` gets no glyph.
- Travel: horizontal, to the right. Chevron points right.
- Rest frame alone: a solid cover, a full disc in the open beside it, and a
  trail from the edge of the cover to the disc. "Came out where you can see
  and reach it."

**`hem` — to home.**

- Landmark: house.
- Mover start (3, 16.5): outside, left of the house. Rest (16.5, 16.5): inside
  the house, under the roof.
- Travel: horizontal, to the right, through the open left side. Chevron points
  right.
- Rest frame alone: a disc inside a house shape, with a trail from outside.
  "Arrived home."

**`undan` — out of the way, tucked behind something.**

- Landmark: cover.
- Mover start (21, 12): fully visible, in the open. Rest (9, 12): behind the
  cover. Only a sliver of about 1.5 units shows at the right edge of the
  cover.
- Travel: horizontal, to the left. Chevron points left, at the cover.
- Rest frame alone: a solid cover, a sliver of a disc at its edge, and a trail
  from the open space into the cover. "Put out of sight, out of the way."

### E4. Opposite pairs and distinctness

**Pair rule.** For each pair X and Y of opposites, the rest frame of X must
differ from the start frame of Y, and the rest frame of Y must differ from the
start frame of X. Reason: the end position of "onto" is the start position of
"off". If the two frames are the same, a reduced-motion learner who sees X
cannot tell it from the first moment of Y. Two measures make the frames
differ:

1. The mover position in the rest frame of X and in the start frame of Y
   differs by **4 viewBox units or more**, or the mover is hidden in one of the
   two frames.
2. The rest frame shows the trail and the chevron. The start frame shows no
   chevron.

| Pair                | Rest of X vs start of Y                                                                                                                      | Rest of Y vs start of X                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `på` / `av`         | `på` rest (9, 12.5) vs `av` start (15, 12.5): 6 units                                                                                        | `av` rest (20, 5) vs `på` start (4, 4): 16 units          |
| `fram` / `undan`    | `fram` rest (20, 12), full disc, vs `undan` start (21, 12): 1 unit. **Fails measure 1.** See the note below the table.                       | `undan` rest: sliver at the cover vs `fram` start: hidden |
| `fram` / `tillbaka` | different landmarks (cover vs ring point)                                                                                                    | different landmarks                                       |
| `hem` / `bort`      | different landmarks (house vs ring point)                                                                                                    | different landmarks                                       |
| `ihop` / `isär`     | no `isär` glyph and no `isär` entry. If one is added, it starts at (11, 12) only with no chevron, or it starts 4 units or more from (11, 12) | —                                                         |
| `ihop` / `sönder`   | `sönder` gets no glyph (rule E6)                                                                                                             | —                                                         |

**`fram` / `undan` after the `fram` redraw.** Moving the `fram` rest to
(20, 12) brings it 1 unit from the `undan` start (21, 12), so this row
fails the pair rule as written. Nothing breaks today, because `undan` is
out and is not drawn. If `undan` is ever drawn:

- its rest moves to (7, 12), so a sliver of about 1.5 units still shows
  past the new cover edge at x 8, and
- the `fram` rest against the `undan` start needs a new check before
  `undan` ships. The old numbers do not carry over.

The rest frames of the two members of a pair also differ: the mover is in a
different place and the trail runs the other way.

**Cross-set distinctness.** The `ui-ux-expert` compares the rest frame of each
new glyph with the rest frame of every other glyph, at 44 × 44 CSS px, in the
light theme and the dark theme. These pairs have the highest risk and need an
explicit verdict:

| New glyph | Check against | Risk                                                |
| --------- | ------------- | --------------------------------------------------- |
| `hem`     | `in`          | both end inside an enclosure; only the roof differs |
| `på`      | `ner`         | both end low, on a horizontal edge                  |
| `av`      | `upp`         | both leave a horizontal edge upwards                |
| `av`      | `bort`        | both end clear of the landmark                      |
| `fram`    | `ut`          | both come out of something                          |
| `undan`   | `in`          | both end inside or behind something                 |
| `ihop`    | `tillbaka`    | both end in contact with a round landmark           |

A glyph that fails one check does not ship. The `frontend-expert` may change
the drawing once to fix it, inside the grammar of rule E2. A second failure
means the particle gets no glyph. The reviewer records the verdict for each
row in the PR.

**Dark theme check is blocked.** The repo has no dark palette. The
`.dark` palette was removed and no theme toggle ships
(`docs/product/2026-08-08-dark-mode-decision.md`). So the review covered
the light theme only. The dark half of this check is open, not passed.
Run it if a dark palette is ever added.

### E5. Sense line agrees with the picture

The base note (rule 10) blocks `upp` until its sense line names upward
movement. The same rule applies to each new glyph: **a new glyph ships only
when its `PARTICLE_CORE_SENSE` line names the drawn sense.**

| Particle | Drawn sense               | Line names it today?                                  |
| -------- | ------------------------- | ----------------------------------------------------- |
| `på`     | onto a surface or body    | **No.** The line names switching on and continuation. |
| `av`     | off a surface, separation | Yes ("separation")                                    |
| `ihop`   | together, into one        | Yes                                                   |
| `fram`   | out into view or reach    | Yes                                                   |
| `hem`    | to home                   | Yes                                                   |
| `undan`  | out of the way            | Yes ("out of the way")                                |

If `på` reaches 3, the `swedish-linguist` rewords the `på` line to name
"onto" before the `på` glyph ships. The wording is the linguist's call.

### E6. Particles that get no glyph

**Rule: an abstract particle gets nothing.** A particle is abstract when its
literal entries describe a state, a relation, a repetition, an addition or a
transfer, and no physical thing moves along one path relative to one
landmark. Such a particle gets no glyph at any count.

| Particle | Literal entries (working copy)           | Reason for no glyph                                                                                                          |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `om`     | `ta om`, `se om`, `bygga om`, `vända om` | Repetition or remaking in three of four. Only `vända om` moves, and 1 is below 3. A U-turn picture also overlaps `tillbaka`. |
| `med`    | `ta med`, `följa med`, `ha med sig`      | Accompaniment is a relation between two moving things. The grammar has one mover. `ha med sig` is a held state.              |
| `till`   | `lägga till`, `laga till`                | Addition and preparation. Nothing moves along a path (fails (a)).                                                            |
| `igen`   | `komma igen`                             | Repetition and recurrence. The physical return overlaps `tillbaka`.                                                          |
| `fast`   | `sätta fast`, `hålla fast`               | A fixed state. State change fails (a) (base hard-class table).                                                               |
| `över`   | `stryka över`                            | Drawing a line through text. Nothing changes location.                                                                       |
| `emot`   | `ta emot`                                | Receiving. Transfer of ownership fails (a).                                                                                  |
| `i`      | `fylla i`                                | Writing in a form. Nothing changes location.                                                                                 |
| `kvar`   | `bli kvar`, `hålla kvar`                 | Staying. The meaning is the absence of motion. A still mover cannot show it, and "others leave, one stays" needs two movers. |
| `sönder` | `riva sönder`, `slå sönder`              | A result state (broken). State change fails (a). A picture of breaking needs more than one mover.                            |
| `samman` | `sätta samman`                           | 1 entry, and all three examples are abstract (förslag, grupp, rapport). Not an alias of `ihop` (see Options).                |
| `ur`     | `dricka ur`                              | 1 entry. Completion (empty the glass) fails (a). The entry has a `contrast` (gate 3). "Out of a container" overlaps `ut`.    |
| `iväg`   | `gå iväg`                                | 1 entry. At 24 × 24, "set off" cannot be drawn apart from `bort`. Not an alias of `bort` (see Options).                      |

`ur` and `iväg` are not abstract. They are below 3 and they overlap an
existing glyph. If either reaches 3, this note is reopened for that particle.
The others stay out at any count.

## Spatial test additions

Add these to base rule 9. Questions (a), (b) and (c) do not change. Doubt =
fail.

**Direction definitions for question (b):**

- `på`: from off a surface or a body to in contact with it, on it.
- `av`: from in contact with a surface or a body to off it, with a gap.
- `ihop`: two or more things move toward each other and end in contact or in
  one place.
- `fram`: from a stored or hidden place into view or reach. The sentence does
  not need to name the stored place.
- `hem`: toward the home of the figure, or of the person the sentence names.
  The sentence does not need to state the arrival.
- `undan`: into a hidden place, or behind or under something, out of sight or
  out of the way.

**Hard classes, additions to the base table:**

| Class                              | Example                                                | Ruling                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Device on or off                   | `sätta på radion`, `slå av lampan`, `stänga av datorn` | **Fail (a).** A change of state. Nothing moves along the path. A switch that moves is part of the device (base class "state change").       |
| Garment put on or taken off, named | `ta på sig jackan`, `ta av sig skorna`                 | **Pass.** The garment is the figure. The body is the landmark.                                                                              |
| Garment not named                  | `klä på sig`, `klä av sig`                             | **Fail (a).** The figure is not named (same reason as an unnamed fluid in the base table).                                                  |
| Garment worn                       | `ha på sig en jacka`                                   | **Fail (a).** A held state, like a held posture.                                                                                            |
| Board or leave a vehicle           | `stiga på tåget`, `stiga av bussen`                    | **Pass** gate 5. The person is the figure, the vehicle is the landmark. Both entries in the working copy have a `contrast` and fail gate 3. |
| Lid or cover removed               | `ta av locket`                                         | **Pass.**                                                                                                                                   |
| Top up a container                 | `fylla på vatten i flaskan`                            | **Fail (c).** The liquid goes into a container. That is the `in` path, not "onto".                                                          |
| Wipe or clean a surface            | `torka av bordet`                                      | **Fail (a).** The dirt is not named. The main event is cleaning.                                                                            |
| Abstract or social grouping        | `sätta ihop en grupp`, `sätta samman en rapport`       | **Fail (a).** People form a group, or a text is composed. No physical convergence.                                                          |
| Assembly                           | `sätta ihop bokhyllan` / `sätta ihop delarna`          | **Pass** only when the sentence names the parts. **Fail (a)** when it names only the finished whole.                                        |
| Gather scattered things            | `plocka ihop leksakerna`, `samla ihop grenarna`        | **Pass.**                                                                                                                                   |
| Fold, collapse or connect          | `vika ihop`, `falla ihop`, `koppla ihop`               | **Fail (a).** A change of shape or a connected state.                                                                                       |
| Pack up                            | `packa ihop tältet`, `packa ihop våra saker`           | **Fail** unless the sentence clearly describes separate things gathered into one place. Doubt = fail.                                       |
| Forward to a goal                  | `springa fram till dörren`                             | **Fail (c)** for the `fram` glyph. The glyph shows coming out of a hidden place, not approaching a goal.                                    |
| Win                                | `ta hem segern`                                        | **Fail (a).**                                                                                                                               |
| Move aside, not hidden             | `hålla undan grenarna`                                 | **Fail (c)** for the `undan` glyph. Nothing goes out of sight.                                                                              |
| Keep at a distance                 | `hålla undan` (sport), `hålla undan hunden`            | **Fail (a)** or (c). No movement to a hidden place.                                                                                         |
| Tidy up, no object                 | `plocka undan i köket`                                 | **Fail (a).** The figure is not named.                                                                                                      |

## Worked checks

**These are my readings, not the linguist's ruling.** The linguist's pass list
replaces them. For each candidate, the first three literal entries in file
order in the working copy. Gates 1, 2 and 4 pass for all of them (verified,
literal, one accepted particle) unless the text says otherwise.

### `på`

- `pv:satta-pa` (line 1113), "to start a device running". "Hon sätter på
  radion…" and "Han sätter på kaffebryggaren…": device on. Fail (a). **Fails.**
- `pv:ha-pa-sig` (line 2674), "to be wearing something". All three examples
  ("har på mig en varm jacka", "har på sig en röd klänning", "har på sig
  mössor") are a worn garment, a held state. Fail (a). **Fails.**
- `pv:ta-pa-sig` (line 2693), "to dress oneself in a piece of clothing".
  Gate 5: "tar på mig skorna", "tar på sig jackan", "tar på oss regnkläder"
  all name the garment and the act. Pass. Gate 3: the entry has a `contrast`
  ("ta på — to touch something"). **Fails gate 3.**

The other five `på` entries: `slå på`, `skynda på`, `stiga på` and `fylla på`
have a `contrast` (gate 3); `klä på sig` does not name the garment. My
reading: **0 of 8 pass. `på` stays out.**

### `av`

- `pv:stanga-av` (line 1094), "to power down a device". "stänger av datorn",
  "stänger av mobilen": device off. Fail (a). **Fails.**
- `pv:ta-av` (line ~1904), "to leave a road and turn onto another; to lift a
  lid or cover". "Vi tar av till höger…" and "Du tar av vid nästa avfart…": a
  vehicle turns off a road. The figure moves, but the drawing (a disc lifted
  off an object) is not true. Fail (c). "Han tar av locket…": pass. **Fails
  today.** Two co-equal senses, one not drawable: the split rule applies. The
  road sense has 2 of 3 examples, so the existing id keeps it and gets no
  glyph. The lid sense becomes a new entry, and is a candidate after it is
  verified.
- `pv:ta-av-sig` (line 2713), "to remove a piece of clothing from oneself".
  "tar av mig skorna vid dörren", "tar av sig jackan när han kommer in", "tar
  av sig mössorna inomhus": the garment is named and moves off the body. Pass.
  No `contrast`. **Passes.**

The other four: `stiga av` and `slå av` have a `contrast`; `torka av` fails
(a); `klä av sig` does not name the garment. My reading: **1 of 7 pass now,
2 after the `ta av` split. `av` stays out.**

### `ihop`

- `pv:satta-ihop` (line 2144), "to assemble something from parts". "sätter
  ihop bokhyllan": the finished whole only. Fail (a). "sätter ihop en grupp
  inför projektet": social grouping. Fail (a); this example also does not
  match the gloss. "sätter ihop delarna enligt instruktionen": the parts are
  named. Pass. **Fails today.** Single sense, physical: a rewrite candidate
  (human decision A).
- `pv:plocka-ihop` (line 3879), "to gather scattered items into one place".
  "plockar ihop mina saker", "plockar ihop leksakerna på golvet", "plockar
  ihop utrustningen efter matchen": scattered things move into one place.
  **Passes.**
- `pv:samla-ihop` (line ~4563), "to bring scattered things together into one
  pile". "samlar ihop de utspridda legobitarna", "samlar ihop mina saker",
  "samlar ihop grenarna i en stor hög". **Passes.**

The other four: `koppla ihop`, `falla ihop` and `vika ihop` fail (a); `packa
ihop` is doubt, so fail. My reading: **2 of 7 pass now, 3 after the `sätta
ihop` rewrite. `ihop` is in only if the rewrite passes.**

### `fram`

- `pv:ta-fram` (line 640), "to get something out and ready to use". "tar fram
  tallrikarna", "tar fram sin dator", "tar fram kartan": each object comes out
  of a stored place into reach. The stored place is not named; the direction
  definition allows that. **Passes.**
- `pv:springa-fram` (line 5172), "to run right to someone or something". All
  three examples are "springer fram till" a goal. Fail (c) for this glyph.
  **Fails.**
- `pv:plocka-fram` (line ~5354), "to collect several stored things one at a
  time so they are ready". "plockar fram alla ingredienser", "plockar fram
  sina pussel", "plockar fram varma kläder". **Passes.**

The fourth, `pv:stalla-fram` ("ställer fram tallrikar och bestick på bordet",
"ställer fram frukosten", "ställer fram stolar"), passes on my reading. **3 of
4 pass. `fram` is in.**

### `hem`

- `pv:komma-hem` (line 2026), "to arrive at one's own home". "kommer hem från
  jobbet", "kommer hem från skolan", "kommer hem sent på söndag kväll".
  **Passes.**
- `pv:ga-hem` (line 2045), "to set off for one's own home". "går hem efter
  middagen", "går hem tidigt", "går hem och lagar mat". The movement is toward
  home. The arrival is not stated; the direction definition allows that.
  **Passes.**
- `pv:ta-hem` (line 2064), "to bring something to one's home; to win a
  victory". "tar hem maten från restaurangen" and "tar hem böcker från
  biblioteket": pass. "Laget tar hem segern": fail (a). **Fails today.** Split:
  the physical sense has 2 of 3 examples, so the existing id keeps it and
  becomes a candidate. The victory sense becomes a new entry with no glyph.

The fourth, `pv:kora-hem` ("kör hem dig", "kör hem barnen", "kör hem
grannen"), passes: the person driven is the figure. **3 of 4 pass now, 4 after
the split. `hem` is in.**

### `undan`

- `pv:halla-undan` (line 2223), "to hold something aside; to keep a pursuer at
  a distance". "håller undan grenarna": aside, not hidden. Fail (c). "Laget
  håller undan": sport. Fail (a). "håller undan hunden": kept at a distance.
  Fail (c). **Fails.**
- `pv:gomma-undan` (line 4689), "to put something out of sight for later".
  "gömmer undan presenterna", "gömmer undan godiset", "gömmer undan nyckeln
  under en sten". **Passes.**
- `pv:plocka-undan` (line 4842), "to put loose things back in their places".
  All three examples have no object ("plockar undan i vardagsrummet"). Fail
  (a). **Fails.**

My reading: **1 of 3 pass. `undan` stays out.** Its design stays in this note.
`fram` does not depend on it.

### Summary of my reading

| Particle | Pass now | Pass after known splits/rewrites | Result on my reading |
| -------- | -------- | -------------------------------- | -------------------- |
| `på`     | 0        | 0                                | out                  |
| `av`     | 1        | 2                                | out                  |
| `ihop`   | 2        | 3 if `sätta ihop` is rewritten   | in, conditional      |
| `fram`   | 3        | 3                                | in                   |
| `hem`    | 3        | 4                                | in                   |
| `undan`  | 1        | 1                                | out                  |

Expected gain on my reading: about 10 entries with a new glyph, from `ihop`,
`fram` and `hem`. That is fewer than the human wants. The reason is that most
literal `på` and `av` entries describe a device switch or a held state, and a
picture of a disc landing on an object would teach a false meaning for them.

## Parameters, collected

| Parameter                         | Value                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Candidate particles               | `på`, `av`, `ihop`, `fram`, `hem`, `undan`                                                    |
| Inclusion threshold               | 3 or more entries that pass gates 1–5, per particle, after splits/rewrites                    |
| New aliases                       | none                                                                                          |
| viewBox                           | `0 0 24 24`                                                                                   |
| Mover                             | filled circle, r 2.5                                                                          |
| Landmarks                         | block, partner, cover, house (rule E2 table)                                                  |
| Pair rule                         | rest of X vs start of Y: mover 4 units or more apart, or hidden in one                        |
| Distinctness review               | 44 × 44 CSS px, light theme; dark theme blocked (no dark palette, see rule E4), rule E4 table |
| Redraw attempts after a failure   | 1; a second failure means no glyph                                                            |
| Sense line                        | must name the drawn sense (rule E5); `på` needs a new line                                    |
| Placement, timing, reduced motion | unchanged (base rules 1–5)                                                                    |
| Implementation                    | CSS keyframes only; no new dependency                                                         |

## How we would know this was wrong

The maintainer checks these points by hand.

- The maintainer confuses a new glyph with an existing one during practice
  (for example reads `hem` as `in`). The ui-ux check was too loose. Remove the
  new glyph and reopen this note for that pair.
- A new glyph appears so rarely that the maintainer does not recognise it on
  the third verb. 3 is too low. Raise the threshold to 5 and remove the glyphs
  below it.
- The maintainer sees a glyph beside an example where the picture is false.
  Remove the flag from that entry (base note). If this happens on 3 or more
  entries of one new particle, the direction definition for that particle is
  too loose.
- The human finds that too few entries get a glyph and asks for more. Do not
  lower the spatial test. The way to more glyphs is more literal entries with
  drawable examples. That is a scope question for `product-manager`.

## Hand-off

Order of work:

1. **`swedish-linguist`.** Apply gates 1–5 with the additions in "Spatial test
   additions" to every literal entry of the six candidate particles, after the
   ORD-123 splits and rewrites. Include the `ta av` split and the `ta hem`
   split if ORD-123 did not already do them, and the `sätta ihop` rewrite.
   Produce the pass list with a one-line reason per entry, and a count per
   particle. For each particle with 3 or more passes, extend `ParticleGlyphId`
   and the particle → glyph map in `getParticleGlyph`. Add no alias. If `på`
   is in, reword `PARTICLE_CORE_SENSE.på` to name "onto" (rule E5). Report any
   case outside the hard-class table to the lead for the human.
2. **Human.** One batch approval of the pass list (human decision C).
3. **`frontend-expert`.** Draw the glyphs of the "in" particles only, in
   `ParticleGlyph.tsx`, by rules E2 and E3. CSS keyframes only. No new
   dependency. No change to placement, timing, play once, tap to replay or
   reduced motion. Expose durations as the six do (base rule 4).
4. **`ui-ux-expert`.** Review the rest frame of each new glyph against its
   opposite and against the rule E4 cross-set table, at 44 × 44 CSS px, in
   both themes. Record a verdict per row in the PR. One redraw is allowed
   after a failure.
5. **`swedish-linguist`.** After the human's approval and the ui-ux pass, set
   `motionGlyphVerified: true` on the approved entries only.
6. **`qa`.** Extend the gate tests: each new `ParticleGlyphId` has 3 or more
   flagged entries; no flagged entry has a `contrast`; no particle in rule E6
   maps to a glyph; `samman`, `iväg` and `ur` do not map to `ihop`, `bort` or
   `ut`; the 1500 ms cap holds for each new glyph; under reduced motion each
   new glyph is not a button.

`srs-engine`: nothing. A glyph does not change a grade or an interval.

## UI/UX review, 2026-11-10

`ui-ux-expert` reviewed the drawn glyphs for `fram`, `hem` and `ihop`.

- `fram`: failed once (trail dots under the cover, chevron fused with the
  slab). Redrawn, see rule E3. The one redraw is used.
- `ihop`: the drawing is fine. The note's wording was wrong and is fixed in
  rules E2 and E3: the partner is the bort/tillbaka ring, and the overlap is
  2 units.
- `hem`: two nits, both accepted and not blocking. The mover touches the
  floor line. The eave end of the roof line shows a small knob, because
  there is no left wall below it.
- Dark theme: not checked. There is no dark palette (rule E4).

## Sources

Boers, F. & Lindstromberg, S. (eds.) 2008, _Cognitive Linguistic Approaches to
Teaching Vocabulary and Phraseology_, Mouton de Gruyter. The other sources are
in the base note: Paivio 1986; Boers, Piquer Píriz, Stengers & Eyckmans 2009;
Tversky, Morrison & Bétrancourt 2002; Ayres & Paas 2007.
