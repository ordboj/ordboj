# UI/UX red lines for the practice experience

**Question:** Which UI properties of a verb-conjugation SRS must survive a
visual/UX redesign, and which plausible-sounding improvements would damage
retention?

## Decision

Everything below is a numbered position. The ui-ux-expert and the critic may
redesign anything not named here; the positions marked **RED LINE** may not be
traded away for visual polish, delight, or engagement metrics, and a ticket that
violates one comes back to `learning-designer` before it goes to
`frontend-expert`. Three things in the current card are already wrong on
pedagogy grounds and any redesign must fix rather than preserve them: the letter
tiles (P4), the confetti on every correct answer (P8), and the full
pattern shown during recall (P2).

The single sentence that governs the rest: **the screen during retrieval must
contain the question and nothing that could answer it; the screen after
retrieval must contain everything.** Ordböj's current card inverts part of this.

---

## A. Feedback presentation

**P1 — Feedback is immediate, on the same screen, and always shows the correct
form in full. RED LINE.**
Corrective feedback after an errorful retrieval attempt is what fixes the
correct form in memory (Butler & Roediger 2008; Kornell, Hays & Bjork 2009), and
delaying it behind an animation, a modal transition, or a "reveal" tap costs the
learner the moment when the correction lands.

The current card gets this right (`PracticeCard.tsx:280-353`): the feedback panel
shows the complete conjugation pattern with the answered form highlighted, per-form
pronounce buttons, and the example sentence. Keep that content. It is the most
pedagogically sound part of the app.

**P2 — During recall, show the infinitive and the requested form label only. Do
not show the other conjugated forms. RED LINE.**
`getPatternWithHints()` (`PracticeCard.tsx:124-142`) renders the whole pattern
with the target blanked, so the question for `gå` reads roughly
`gå – går – _ _ _ _ – gått`; for any regular verb the surrounding forms make the
answer derivable by pattern-matching without retrieving anything, and for strong
verbs they still supply a strong cue. Pattern completion and form recall are
different tasks, and the app currently schedules one while testing the other.
Move the full pattern to the feedback panel, where it already appears.

**P3 — Wrong answers are marked wrong, plainly, with no softening. RED LINE.**
Error visibility is not discouragement: a learner who cannot tell that they were
wrong will re-encode the wrong form, which is the one outcome this project has
already declared unacceptable ("wrong Swedish is worse than missing Swedish").
"Not quite" plus the red `XCircle` (`PracticeCard.tsx:292-297`) is the right
register — honest, not punitive. Do not replace it with "almost!", do not hide
the marker behind a colour-only cue, and do not shrink it relative to the correct
state.

**P4 — Remove the letter tiles. They convert recall into anagram-solving. RED
LINE.**
`shuffledLetters` (`PracticeCard.tsx:53-54`) is the set of unique letters in the
correct answer, so the tile row tells the learner exactly which letters the answer
contains — combined with the underscore blanks in P2 that discloses the letter
inventory and the length before a single character is typed. The desirable
difficulty of production is the whole reason typed mode exists (Bjork's desirable
difficulties; Roediger & Karpicke 2006 on retrieval as the learning event), and
this row removes it. Whatever replaces it must not be derived from the answer.
The legitimate need it accidentally serves — å/ä/ö entry — is addressed in P11.

**P21 — Show the learner's own wrong answer in the feedback panel, visually
subordinate to the correct form, and never speak it. RED LINE on the "never
speak it" half.**
Added 2026-08-08 at `ui-ux-expert`'s request; approved. The fear behind the
question — that seeing your own error re-encodes it — is the one part of this
area where the evidence is actually good and points the other way: errors
followed by corrective feedback are learned _better_ than items never attempted,
and high-confidence errors are corrected most reliably of all (Metcalfe 2017,
_Learning from Errors_, Annu. Rev. Psychol.; Butterfield & Metcalfe 2001 on the
hypercorrection effect). Error perseveration after immediate corrective feedback
is largely not observed. The card already satisfies the precondition, since the
correct form appears in full on the same screen.

What makes it safe is the asymmetry, so these are conditions of the ticket, not
suggestions:

1. The correct form keeps its current prominence (`bg-primary`, largest type);
   the learner's answer is muted, smaller, struck through, and labelled
   `you typed`.
2. They are never rendered at equal weight side by side — a symmetric two-column
   layout invites the learner to study both strings as a pair, which is exactly
   the arrangement the re-encoding worry describes.
3. **The learner's answer is never passed to `speakSwedish`.** Pronounce buttons
   attach only to real forms. A wrong conjugation spoken aloud in a Swedish voice
   encodes wrong phonology on top of wrong morphology, and that is the project's
   stated red line rather than a style preference.
4. Nothing is shown when the submission was empty, or when the learner uncovered
   the answer via hints — there is no error to see there, only a blank to feel
   bad about.
5. It lives on the card only: never persisted, never surfaced in Progress, never
   shown again when the item is re-queued later in the sitting.

Character-level diffing of the two strings is a plausible extension — Swedish
conjugation errors concentrate in the suffix, so `pratad` against `pratade` is a
one-character story — but it is not part of this decision. If it is built,
highlight within the _correct_ form only, never within the wrong one.

**P5 — Feedback dismissal is an explicit tap, never a timer.**
The learner reads the correct form at their own pace; an auto-advance after N
seconds means the one card they most needed to study is the one they had least
time to look at.

**P6 — The hint must remain available and must remain visibly costly.**
[[lapse-handling]] sets the price (half interval, ease −0.05); the UI's job is to
state it near the button in one short line, because a hint whose cost is invisible
reads as free and gets used as an answer reveal.

---

## B. Cognitive load on the card

**P7 — At most four elements compete for attention during recall: the prompt, the
form label, the input, the submit control.**
Everything else on screen during retrieval is extraneous load in Sweller's sense
and, worse, is a candidate cue; the current card is close to this already, and the
redesign's temptation will be to add streak chips, timers, mascots or per-card
stats to the recall screen. None of those belong there.

**P8 — Confetti fires on lapse recovery and end-of-goal, not on every correct
answer.**
`setShowConfetti(true)` on every correct answer (`PracticeCard.tsx:91-92`) means a
mature collection celebrates roughly nine cards in ten, which costs the signal any
meaning and costs the learner half a second of animation on every single item —
about 25 interruptions per default session. Reserve it for the two moments that
are actually informative: getting right a verb you failed earlier in the sitting,
and finishing the day's goal.

**P9 — Keep the form label and the form hint on the recall screen.**
`getFormLabel` / `getFormHint` (`verbs.ts:108-129`) tell the learner _which_
retrieval is being asked for; that is task definition, not a cue, and removing it
turns a failed retrieval into an ambiguity about what was wanted.

**P10 — One card fills the viewport on a phone with no scrolling required to
answer.**
If the learner must scroll to see the input or the submit button, the two-minute
phone sitting that [[session-shape-and-daily-goal]] is built around stops
happening.

---

## C. Typing vs multiple choice, and å/ä/ö

**P11 — Typed mode is the default and gets a dedicated å/ä/ö affordance that is
not derived from the answer. RED LINE on the "not derived from the answer" half.**
Production recall beats recognition for retention even when both get feedback
(Kang, McDermott & Roediger 2007), so typing stays the default
(`useSettings.ts:14`, `practiceMode: 'typing'` — keep it). The mobile friction is
real: on an English keyboard å/ä/ö need a long-press, which is slow enough to
discourage typed mode entirely. The fix is a fixed three-key row — `å ä ö`, always
those three, always in that order, present on every card regardless of the answer
— which leaks nothing because it is constant. Also set `lang="sv"` and
`autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"` on the input, or
the phone will silently correct Swedish into English.

**P12 — Remove `caret-transparent` from the typed input (`PracticeCard.tsx:221`).**
Hiding the text cursor was presumably cosmetic support for the tile keyboard;
with real typing it makes the field feel dead and costs the learner the basic
feedback that their keypress registered.

**P13 — Drop the auto-submit-on-correct behaviour
(`PracticeCard.tsx:99-108`).**
Submitting the instant the typed string matches means the learner never presses
"Check Answer" when they are right, so the button becomes a de-facto "I am about
to be told I am wrong" control — and it removes the commit moment, which is the
point at which the learner's confidence in their answer is actually tested.

**P14 — Multiple-choice distractors must come from the same or an adjacent
conjugation group as the target, and must be the same form. RED LINE.**
`generateOptions` (`PracticeCard.tsx:64-84`) draws from a hardcoded list of eight
high-frequency irregulars (`vara, ha, gå, komma, skriva, läsa, säga, få`), so a
grupp 1 target such as `pratade` sits among `var`, `gick`, `fick` and is
identifiable by shape alone with zero Swedish knowledge; the item then reports a
success to the scheduler that the learner did not earn. Distractor selection is a
scheduling-quality problem, not a UI problem, and belongs in a shared helper that
`swedish-linguist` can validate. Additional constraint: a distractor must not be a
correct form of the _target verb_ in any other slot, or the card marks a learner
wrong for a defensible answer.

**P15 — Multiple choice is offered as an accessibility/low-friction fallback, not
as the easier tier of a difficulty ladder.**
Framing it as "easy mode" invites learners to sit in it permanently and get
recognition-level practice with recall-level scheduling; framing it as "when you
cannot type" keeps the default honest.

---

## D. Session, progress and pressure

**P16 — The Home screen shows what the learner will do today, not the size of the
backlog. RED LINE.**
`dueCount` today is the raw due list — around 175 items on a fresh install
(`Home.tsx:96-104`) — and the number that greets a returning learner after a week
away is precisely the number that ends the habit. Show `min(remainingGoal,
dueCount)` as the primary figure; if a backlog indicator exists at all it is
secondary, small, and phrased as capacity rather than debt.

**P17 — The practice progress bar tracks progress toward the sitting or the daily
goal, never toward the full due queue.**
`progressPercent` is currently `(currentIndex + 1) / dueItems.length`
(`Practice.tsx:44`), so on a 175-item queue the bar moves half a percent per card
and communicates only futility.

**P18 — Streak UI is opt-out-able and never uses loss-aversion pressure. RED
LINE.**
[[streak-mechanics]] settles the mechanic (weekly by default, `none` available);
the UI constraint is that there is no "your streak is at risk" prompt, no repair
offer, no countdown, and the streak never appears during a card. The evidence that
streaks raise return rates is decent; the evidence that streak-loss prompts help
anyone but the vendor is not, and post-break abandonment is a documented failure
mode of the Duolingo pattern.

**P19 — "No cards due" must never be a dead end.**
The Start button is currently disabled at `dueCount === 0` (`Home.tsx:145`) with
"Come back later"; the learner who opened the app wanting to study and was told no
learns that opening the app is unreliable. Route them to the non-recording free
practice defined in [[session-shape-and-daily-goal]].

**P20 — The stop point is offered, not enforced by a lock.**
The 15-item sitting cap is a door, not a wall: one tap continues, one tap stops,
and neither is styled as the failure.

---

## Red lines, collected

A ticket that does any of these is rejected regardless of how it looks:

1. Showing any part of the answer during recall — sibling forms (P2), derived
   letter tiles (P4), length indicators, or first-letter reveals not requested via
   the hint.
2. Softening or hiding the wrong-answer signal (P3).
3. Auto-advancing past feedback on a timer (P5).
4. Random or cross-group multiple-choice distractors (P14).
5. Putting the backlog count, a streak, or a countdown on the recall screen
   (P7, P16, P18).
6. Any streak-loss or streak-repair prompt (P18).
7. Making multiple choice the default, or presenting it as an easier difficulty
   tier that schedules identically (P11, P15).
8. Adding a per-card countdown timer in any form — it trades effortful retrieval
   for fast recognition, which is the opposite of what produces retention.
9. Speaking, replaying or persisting a learner-produced wrong form (P21).

## Where the evidence is thin

The retrieval-practice, feedback-timing and recognition-vs-production claims above
are well replicated in the lab, mostly on word pairs and prose, mostly with
university students; the transfer to phone-sized inflection drills is a reasonable
inference, not a measured result. The claims about streaks and confetti are
weaker still — engagement mechanics are studied almost entirely by the companies
that profit from them, and I am arguing from mechanism (signal devaluation, loss
aversion) rather than from evidence. P8 and P18 are the two positions I would give
up first if the human disagrees. P2, P4 and P14 are not opinions: each one lets
the learner answer correctly without knowing the answer, and each one therefore
feeds the scheduler a lie.

## How we would know this was wrong

- Typed-mode accuracy collapses after the letter tiles are removed (P4) and stays
  below roughly 50%: the tiles were carrying more scaffolding than assumed, and
  the replacement should be a first-letter hint rather than nothing.
- Learners switch to multiple choice and stay there after P14 tightens the
  distractors: the typed path is too costly on mobile and P11's key row did not
  fix it.
- Session starts drop after the Home screen stops showing the true backlog (P16):
  the backlog was functioning as motivation for this learner, not as dread.
- Hint usage spikes once P2 removes the sibling forms: the pattern context was
  doing legitimate teaching work for irregular verbs, and the recall screen may
  need the infinitive plus one anchoring form rather than the infinitive alone.
- The same wrong form is produced repeatedly on an item after P21 ships, where it
  previously varied: the displayed error is being studied rather than corrected;
  drop it back to the correct form alone and revisit.

## Routed to

`ui-ux-expert` — audit and ticket authoring within these constraints.
`frontend-expert` — P2, P4, P5, P6, P8, P9, P10, P11, P12, P13, P17, P19, P20,
P21.
`srs-engine` — P14 distractor selection lives next to item construction, not in
the card; P16/P17 need `remainingGoal` and `answeredToday` from
[[session-shape-and-daily-goal]].
`swedish-linguist` — validation that P14's distractor pool never contains a form
that is correct for the prompted verb.
