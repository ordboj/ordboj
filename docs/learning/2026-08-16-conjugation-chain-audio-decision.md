# Conjugation-chain audio: manual button ships, automatic playback is deferred

**Question (#416/#419, Linear ORD-61):** The human asked to hear the full
conjugation chain (_ta – tar – tog – tagit_) after each answer. Epic #416
ships a learner-initiated "Pronounce pattern" button and cuts automatic
playback pending a written learning decision. This note is that decision:
what `autoplayAudio` means, what ships, what is deferred, and exactly what
evidence would lift the deferral.

## Decision

**`autoplayAudio` keeps its current meaning: on a _correct_ answer, and only
then, the app speaks the _single_ correct form (`PracticeCard.tsx:213-215`).
Automatic full-chain playback after every answer — including after a wrong
answer — does not ship.** Not with a setting, not off-by-default, not as an
experiment. The deferral holds until the three questions below have written
answers in `docs/learning/` and the unblocking evidence listed at the end of
this note exists.

**Learner-initiated chain playback is permitted and in scope.** The
"Pronounce pattern" button defined in #416 may appear on **both** the
correct and the incorrect feedback screen. A tap speaks the card's on-screen
`patternParts` as one joined sv-SE utterance — four parts on a normal card,
two on an imperativ card (`verbs.ts:197-210`) — with the correct answer
substituted for the blank. That is the whole shipping scope. The distinction
this note draws is agency, not content: the learner choosing to hear the
chain is fine on any feedback screen; the app deciding for them is what is
deferred.

Two standing rules are unchanged and bound the button too:

- The learner's typed answer is never passed to `speakSwedish` — pronounce
  controls attach only to real stored forms (red line P4, condition 3,
  [[2026-08-08-ux-pedagogy-red-lines]]).
- Wrong Swedish is worse than missing Swedish: with no sv voice available,
  the app stays silent rather than speaking the chain in a wrong-language
  voice (#417's guard).

## Why automatic playback is deferred, not refused

The pedagogy behind the request is plausible: hearing the paradigm as one
prosodic contour is how Swedish classrooms drill strong verbs, and paired
auditory-plus-visual presentation of the same string is a reasonable
encoding aid. The deferral is not a judgment that the idea is wrong. It is a
judgment that three questions it raises are open, that each has a failure
mode which costs the learner real time or teaches something false, and that
none of them can be answered from the armchair. Engineers do not resolve
these mid-implementation; each needs its own written decision here first.

### Open question 1 — chain on every answer

A four-form chain at rate 0.85 runs roughly 3–4 seconds. The current
autoplay speaks one word (~1 second) and only on a correct answer. A
20-card session with chain-on-every-answer adds 60–80 seconds of forced
listening per session, attached to the exact moment the learner wants to
read the feedback and move on. Feedback dismissal is an explicit tap, never
a timer (red line P5) precisely because the feedback screen belongs to the
learner's own pacing; a mandatory 4-second utterance is a timer wearing an
audio costume unless Enter/Next cancels it — and if Enter cancels it, fast
learners never hear past the second form, so the "full chain" promise is
false in exactly the sessions it was meant to serve. Whether the chain
should ever play unbidden, on which answers, and what cancellation
semantics preserve both pacing and the pedagogical payload: undecided.

### Open question 2 — audio after a wrong answer

The wrong-answer feedback screen is governed by the P4 asymmetry: the
correct form dominates, the error is visually muted, and the evidence that
makes showing errors safe (Metcalfe 2017; Butterfield & Metcalfe 2001)
concerns _corrective_ feedback the learner attends to. Auto-playing a
four-form chain at that moment is different from auto-playing the one
corrected form, and we have no basis for either: does hearing the correct
form immediately after an error strengthen the correction, or does the
chain's three other forms dilute attention from the one form the learner
just got wrong? The current behavior (silence after a wrong answer unless
the learner taps) has never been evaluated against any alternative. Until
someone writes the decision — including whether wrong-answer autoplay would
speak one form or the chain — no automatic audio of any kind attaches to an
incorrect answer.

### Open question 3 — massed paradigm exposure vs. one-item-per-form scheduling

The SRS schedules each conjugation form of a verb as its own item
(`srs.ts:279-281`): _tar_ and _tog_ have independent intervals, and the mix
of due items is the scheduler's whole mechanism. Automatic chain playback
gives the learner a massed re-exposure to all four forms on every single
card. That is not neutral: if hearing _tog_ on a _tar_ card meaningfully
refreshes _tog_, the scheduler's model of _tog_'s retention is now wrong,
and its next interval is mis-set — the app would be silently studying items
behind the scheduler's back. Or the exposure is too shallow to matter, in
which case it costs 3–4 seconds for nothing. Which of these is true, and
whether chain exposures should be recorded as SRS events (the epic
explicitly cut "No SRS exposure recording"), is a scheduling-model question
for `learning-designer` and `srs-engine` jointly. Note the button has the
same property in principle; the difference is dose. A learner taps the
button occasionally and deliberately; autoplay fires on all ~20 cards of
every session, which is where an un-modeled exposure starts to bend the
schedule.

## Evidence that would unblock automatic playback

All of the following, not a subset. Someone proposing autoplay again starts
by producing these; the proposal is otherwise returned unread.

1. **A verified mobile Safari and mobile Chrome Swedish-TTS quality check.**
   A named human listens to the joined chain utterance on a physical iPhone
   (mobile Safari, iOS with a downloaded sv-SE voice) and a physical Android
   phone (mobile Chrome), for 12 verbs covering all four verb groups and at
   least 4 strong verbs with vowel change (e.g. _ta, gå, dricka, skriva_),
   plus 2 imperativ cards. Pass means: every form audibly distinct, no form
   swallowed at the joins, no non-Swedish phonology. The result is recorded
   in `docs/learning/` with device, OS version, and voice name. Desktop
   checks do not count; the browsers named here are the ones learners hold.
2. **Written decisions on questions 1–3 above**, each in this directory,
   each naming the chosen behavior (which answers trigger audio, chain or
   single form per case, cancellation semantics, and whether chain exposure
   is recorded in the SRS or shown to be ignorable).
3. **A measured session-time cost**, not an estimate: median added seconds
   per card with the chosen utterance on the devices from item 1, so the
   pacing decision in question 1 is made against a real number.
4. **Staff-engineer sign-off on the cancellation path** — the
   cancel-then-speak ordering issue #416 flags on Chrome — since autoplay
   multiplies the audio-bleed surface that #417/#420 exist to close.

## What implementers change

Nothing, from this note. This note authorizes no code. The shipping scope
is #416's, implemented under #417/#418/#420–#422: cancellable speech, the
sv-voice guard, and the manual "Pronounce pattern" button on both feedback
screens. The one instruction this note adds for `frontend-expert` is
negative: do not gate the chain button on `isCorrect`, and do not wire
`autoplayAudio` to anything beyond its current single-form, correct-only
call site.

## How we would know this was wrong

- Learners report tapping the chain button on nearly every card — that is
  revealed demand for autoplay and justifies prioritizing the evidence list
  above.
- The TTS check in item 1 fails — then even the manual button's value is in
  doubt on mobile, and the button's presence should be revisited, not just
  autoplay.
- A future per-answer review log (see
  [[2026-08-13-per-answer-review-log-decision]]) shows no interval
  distortion despite heavy chain use — that would retire question 3 cheaply.

## Sources

`src/components/PracticeCard.tsx:213-215, 270-289` (current autoplay and
pronounce paths); `src/hooks/useSettings.ts:10,31,71` (`autoplayAudio`);
`src/lib/speech.ts`; `src/lib/verbs.ts:186-210` (`generateVerbPattern`);
`src/lib/srs.ts:279-281` (per-form items). Epic #416 (settled scope and
critic's cut). [[2026-08-08-ux-pedagogy-red-lines]] P4 and P5. Metcalfe
2017, _Learning from Errors_, Annu. Rev. Psychol.; Butterfield & Metcalfe
2001 (hypercorrection), both as already applied in the red-lines note.

## Routed to

`frontend-expert` — the negative instruction above; otherwise #416 scope
unchanged.
`srs-engine` — co-owner of any future answer to question 3; no action now.
Lead — set ORD-61 to Done when this note merges; keep the three open
questions out of any ticket until their decisions exist here.
