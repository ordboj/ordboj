# Spoken paradigm sign-off: shipped strings match the frozen fixtures — approve

**Question (#459, Linear ORD-82, part of epic ORD-75):** Sign off the
shipped spoken-paradigm implementation against the frozen fixture table
in [[2026-08-17-spoken-paradigm-rules]] (#454, PR #461). Owner:
`swedish-linguist`. This note is the sign-off record; it edits no
production file. It is filed in `docs/learning/` next to its twin, the
#454 freeze note; the lead confirms the placement or moves the file.

## Verdict

**Approve.** Every string the modal hands to `speakSwedish` matches the
frozen expectation character for character. The `', '` join at rate 0.85
is confirmed as a paradigm list. The #455 Settings copy contains no
Swedish-language or grammatical-terminology error. No defect is filed.

## What was examined

The #453/#455/#456/#457 stack is not yet merged to `main`, so this
sign-off binds to the exact commits below. If any of them changes before
merge, the approval is void and the sign-off returns to
`swedish-linguist`.

- Implementation: `e7a3c7b` (tip of `ticket/457-verbdetails-pronounce-all`,
  on top of `main` at `085f772`). This commit carries the whole stack:
  `buildConjugationUtterance` and the settle callback in
  `src/lib/speech.ts` (#453), the `autoReadAllForms` setting and its
  Settings row (#455), and the modal wiring in
  `src/components/VerbDetailsModal.tsx` (#457).
- Test contract: `bb51074` (tip of
  `ticket/456-utterance-builder-settle-callback`), which pins the fixture
  strings in `src/lib/speech.test.ts`.
- Frozen fixtures: `df85848` (tip of `docs/454-spoken-paradigm-freeze`,
  PR #461), the [[2026-08-17-spoken-paradigm-rules]] table.

Method: the exact pipeline the modal runs — `getAllConjugatedVerbs()`
from `src/lib/verbs.ts` into `buildConjugationUtterance()` from
`src/lib/speech.ts`, both taken verbatim from commit `e7a3c7b` with no
hand transcription — was compiled and executed over the full `VERB_DATA`
table. This is the same string the modal passes to `speakSwedish`: both
the "Pronounce all forms" click handler and the auto-play effect pass
`buildConjugationUtterance(verb)` unchanged, and `Progress.tsx` feeds the
modal `ConjugatedVerb` rows from `getAllConjugatedVerbs()`.

## Check 1 — fixture strings, character for character

All six frozen expectations reproduce exactly:

| Case | Verb   | Produced utterance                          | Match |
| ---- | ------ | ------------------------------------------- | ----- |
| (a)  | skriva | `skriva, skriver, skrev, skrivit, skriv`    | PASS  |
| (a)  | tala   | `tala, talar, talade, talat, tala`          | PASS  |
| (b)  | färdas | `färdas, färdas, färdades, färdats, färdas` | PASS  |
| (c)  | te sig | `te sig, ter sig, tedde sig, tett sig`      | PASS  |
| (d)  | kunna  | `kunna, kan, kunde, kunnat`                 | PASS  |
| (e)  | anse   | `anse, anser, ansåg, ansett`                | PASS  |

Point by point against the frozen rules:

- **Canonical order** holds structurally: `CONJUGATION_FORM_ORDER` in
  `speech.ts` is infinitive, presens, preteritum, supinum, imperativ,
  and the join is literally `.join(', ')`.
- **Deponent `-s`** is present in all five parts of the färdas utterance,
  including the third repeat that rule 5 (no deduplication) requires.
  This also confirms the #454 defect item is resolved in code: #453's
  original four-part deponent acceptance text was wrong, and the shipped
  builder produces the correct five-part string.
- **Multi-word phrase whole**: every part of the te sig utterance keeps
  its `sig`. No splitting, no reordering.
- **Suppressed imperativ absent**: kunna ends at the supinum
  (`imperativNotApplicable`), and the builder excludes it even when a
  stray non-empty value is present (pinned by qa in `speech.test.ts`).
  te sig and anse, whose imperativ is empty pending human review, also
  end at the supinum — the unreviewed gap stays inaudible, exactly as
  the freeze note requires.
- **No sentinel anywhere**: a sweep of every row in `VERB_DATA`
  (600+ utterances) found no `(not available)` in any produced string.
  The `getAllConjugatedVerbs()` substitution of the sentinel for empty
  forms is caught by the builder's `isFormUnavailable` check in every
  case.

## Check 2 — `', '` at rate 0.85 is a paradigm list

Confirmed; no separator change is filed. Grounds:

- Grammar: the utterance has no subject and no finite clause frame, so
  no sentence parse is available to a listener. Comma-separated bare
  forms produce list-continuation intonation in mainstream sv-SE voices.
- Field corroboration: `PracticeCard.tsx` has shipped the identical
  recipe — `', '` join at rate 0.85 — as the "Pronounce pattern"
  utterance, with no report of it reading as a sentence.
- Rate confirmed in code: `speech.ts` sets `utterance.rate = 0.85` and
  `lang = 'sv-SE'`, and stays silent when no Swedish voice is installed
  (rule 7); the pronounce-all path reuses that guard unweakened.

The residual caveat from the freeze note stands unchanged: this ruling
rests on the separator's grammar plus the shipped PracticeCard recipe,
not on a new device listening test. If the on-device sv-SE check in
[[2026-08-16-conjugation-chain-audio-decision]] ever contradicts it, the
separator question returns to `swedish-linguist`. That caveat does not
block this sign-off, because #454 froze the rule on exactly this basis.

## Check 3 — #455 Settings copy

Approved. The label ("Read all forms automatically") and help text are
English-only, so no Swedish-language error is possible, and no Swedish
grammatical term appears, so no terminology error is possible. The three
behavior claims in the help text were verified against code:

- "opening a verb's details reads every form aloud by itself" — the
  auto-play effect in `VerbDetailsModal.tsx`, keyed on the opened verb.
- "different from tapping a form to hear just it" — the per-form
  pronounce buttons, unchanged.
- "Autoplay pronunciation above, which only plays audio after you answer
  a practice question correctly" — accurate: `PracticeCard.tsx` speaks
  only on `correct && autoplayAudio`, and the Autoplay row sits directly
  above the new one.

One reading nit, recorded and dismissed: "reads every form" means every
form the details view shows. A suppressed or unreviewed imperativ is not
shown and not read, so copy and behavior agree. No change requested.

## Observations for the lead (informational, no block)

- qa's deponent fixture in `speech.test.ts` is misslyckas
  (`misslyckas, misslyckas, misslyckades, misslyckats, misslyckas`),
  not färdas from the #454 table. The two are linguistically equivalent
  — five parts, `-s` in every part — so the test contract is satisfied.
  Adding färdas as a second pinned deponent is optional hardening and
  qa's call; this sign-off ran färdas directly regardless.
- This sign-off is the pre-merge linguistic gate for the stack. It says
  nothing about the React wiring itself (effect keying, stop control,
  unmount safety) — that remains `staff-engineer` and qa territory.

## Sources

Commits `e7a3c7b` (`ticket/457-verbdetails-pronounce-all`), `bb51074`
(`ticket/456-utterance-builder-settle-callback`), `df85848`
(`docs/454-spoken-paradigm-freeze`, PR #461), `085f772` (`main`);
`src/lib/speech.ts` (`buildConjugationUtterance`, rate 0.85, sv-voice
guard); `src/lib/verbs.ts` (`getAllConjugatedVerbs`, sentinel);
`src/data/verbData.ts:66,86,87,112,120,806` (fixture rows);
`src/components/VerbDetailsModal.tsx` (both `speakSwedish` call sites);
`src/pages/Settings.tsx` (#455 copy); `src/components/PracticeCard.tsx`
(shipped `', '` recipe, autoplay-on-correct);
[[2026-08-17-spoken-paradigm-rules]];
[[2026-08-16-conjugation-chain-audio-decision]].

## Routed to

Lead — verdict is approve; the linguistic merge gate for the
#453/#455/#456/#457 stack is satisfied at the commits named above.
`qa` — optional: pin färdas alongside misslyckas as a second deponent
fixture.
`frontend-expert` — no changes requested.
