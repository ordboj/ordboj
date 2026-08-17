# Spoken paradigm: frozen rules and the expected-utterance fixture table

**Question (#454, Linear ORD-77, part of epic ORD-75):** The verb details
modal gains a "Pronounce all forms" button and an opt-in auto-read. Before
any code exists, freeze the linguistic rules for the spoken paradigm and
publish the fixture table of exact expected utterance strings. Owner:
`swedish-linguist`. `docs/learning/**` is `learning-designer`'s directory
(CLAUDE.md file-ownership table); this note is filed there as a
linguistic ruling. `learning-designer` has not co-signed it. The lead
confirms the placement or moves the file. This note is the ruling; it edits no
production file.

## The frozen rules

1. **Canonical order.** Infinitiv, presens, preteritum, supinum,
   imperativ — imperativ last and only when it is speakable. This is the
   order a Swedish learner recites a paradigm in, and it matches the
   modal's own display order (`VerbDetailsModal.tsx:21` plus the
   infinitive header).
2. **Filter first, then join.** A form is excluded from the utterance
   when it is empty, when it is the `'(not available)'` sentinel, or when
   it is an imperativ on a verb flagged `imperativNotApplicable`. The
   sentinel is English; sending it through a Swedish voice would speak
   "not available" with Swedish phonology, which is exactly the wrong
   Swedish this app refuses to teach. The same three-way filter already
   exists in the modal's render guard (`VerbDetailsModal.tsx:124-129`)
   and in PracticeCard's `speakablePatternParts`.
3. **Join with `', '` exactly.** Ruling on the prosody question: yes,
   `', '` at rate 0.85 reads as a paradigm list, not as a sentence. A
   comma makes every mainstream sv-SE voice insert a pause with
   list-continuation intonation, and the string contains no subject and
   no finite clause frame, so no parse as a sentence is available to the
   listener. This is also the separator PracticeCard's shipped
   "Pronounce pattern" utterance already uses
   (`PracticeCard.tsx:144`), so the two surfaces stay identical. Do not
   substitute the on-screen `' – '`: some voices read the dash aloud
   ("tankstreck") and others drop it silently, which is unverifiable per
   voice. Do not use `'. '`: sentence-final falling intonation after
   every form slows the chain without adding list clarity. This ruling
   rests on the separator's grammar, not on a device listening test; the
   mobile sv-SE check in
   [[2026-08-16-conjugation-chain-audio-decision]] (unblocking evidence,
   item 1) has not been run, and a failing check returns this rule to
   `swedish-linguist`.
4. **Speak the stored strings verbatim.** For deponent s-verbs the `-s`
   belongs to every form and is not a passive ending (`verbData.ts:806`);
   stripping it would speak a verb that does not exist ("färda"). For
   multi-word and reflexive entries the pronoun or particle is part of
   the lemma ("te sig", `verbData.ts:87`); splitting or dropping it
   would speak a different verb ("te" alone is not the stored lemma). No
   `-s` stripping, no particle splitting, no reordering, ever.
5. **No deduplication.** Swedish paradigms legitimately repeat forms:
   grupp 1 imperativ equals the infinitive (tala – tala), and a deponent
   repeats the s-form three times (färdas). Every surviving slot is
   spoken, repeats included — the repetition is the paradigm, not a bug.
6. **Particle verbs.** Entries from `particleVerbData.ts` do not reach
   `VerbDetailsModal` today: both modal openers in `Progress.tsx`
   (lines 397/413 and 514/518) pass only `ConjugatedVerb` rows built by
   `getAllConjugatedVerbs()` over `VERB_DATA`. "Particle verbs are
   spoken as the full phrase" is therefore satisfied by rule 4 —
   verbatim speaking of whatever string the modal is given — with no
   extra code. If particle entries ever reach the modal, rule 4 already
   covers them.
7. **Silence over a wrong-language voice.** When no Swedish voice is
   installed, staying silent is preferred over any non-Swedish fallback.
   A Swedish paradigm read with English or German phonology teaches
   false sound-form mappings, which is worse than teaching nothing
   (project rule: wrong Swedish is worse than missing Swedish).
   `speech.ts` already implements this guard; it must not be weakened
   for the pronounce-all path.

## Expected-utterance fixture table

Exact strings under canonical order and `', '` join. These are the frozen
fixtures for qa's tests; every string below derives verbatim from the
current `verbData.ts` fields.

| Case | Verb   | Why this verb                                                | Expected utterance                          |
| ---- | ------ | ------------------------------------------------------------ | ------------------------------------------- |
| (a)  | skriva | Fully populated, all five forms audibly distinct             | `skriva, skriver, skrev, skrivit, skriv`    |
| (a)  | tala   | Fully populated, imperativ repeats the infinitive (rule 5)   | `tala, talar, talade, talat, tala`          |
| (b)  | färdas | Deponent s-verb; `-s` kept in every form (`verbData.ts:806`) | `färdas, färdas, färdades, färdats, färdas` |
| (c)  | te sig | Multi-word reflexive; imperativ empty pending human review   | `te sig, ter sig, tedde sig, tett sig`      |
| (d)  | kunna  | Modal, `noNaturalImperativ: true`; imperativ excluded        | `kunna, kan, kunde, kunnat`                 |
| (e)  | anse   | Imperativ empty pending human review, not flagged            | `anse, anser, ansåg, ansett`                |

Notes on the four-part rows: (c), (d) and (e) all end after the supinum.
The listener cannot tell "grammatically has no imperativ" from "imperativ
not yet reviewed" by ear, and must not be able to — speaking a guessed
imperativ in either case would be fabricated Swedish. The distinction
stays visual (the modal's render guard) and in the data
(`noNaturalImperativ`), never audible.

## Defect check

**One conflict to raise, not a data defect.** Issue #453 (ORD-76, the
utterance builder) pins the deponent case as
`färdas, färdas, färdades, färdats` — four parts. That string is wrong.
`verbData.ts:806` stores `imperativ: "färdas"`, a non-empty value on a
row that is not flagged `noNaturalImperativ`, so no filter in rule 2
removes it. The correct builder output is the five-part
`färdas, färdas, färdades, färdats, färdas`. Rule 5 (no deduplication)
keeps the third repeat. The fixture table in this note wins; the lead
corrects the #453 / ORD-76 acceptance text before that ticket's
implementation merges. No verbData.ts row needs a change, so batch 3 is
not blocked on data.

Every expected string above is producible verbatim from
the current `verbData.ts` rows (skriva:86, tala:120, färdas:806,
te sig:87, kunna:66, anse:112 — line numbers as of this note). Batch 3
is not blocked on any data fix.

## What implementers change

Nothing, from this note, beyond conformance: the pronounce-all utterance
builder (`frontend-expert`, batch 2+) filters per rule 2, orders per
rule 1, joins per rule 3, and passes the result to `speakSwedish`
unchanged. `qa` pins the six fixture strings above as test expectations.
Any future request to strip `-s`, split a phrase, dedupe repeats, or add
a voice fallback is a change to this ruling and comes back to
`swedish-linguist` first.

## Sources

`src/data/verbData.ts:66,86,87,112,120,806`;
`src/components/VerbDetailsModal.tsx:21,124-129`;
`src/components/PracticeCard.tsx:125-144` (shipped `', '` recipe);
`src/lib/verbs.ts` (`getAllConjugatedVerbs`, `'(not available)'`
sentinel); `src/lib/speech.ts` (sv-voice guard, rate 0.85);
`src/pages/Progress.tsx:397,413,514,518` (modal openers); epic ORD-75;
[[2026-08-16-conjugation-chain-audio-decision]] (the practice-card
deferral this note does not touch).

## Routed to

`frontend-expert` — rules 1–3 and 7 bind the utterance builder.
`qa` — the fixture table is the test contract for the utterance builder.
`learning-designer` — the modal's opt-in auto-read (#455 / #457) is a new
surface, not the practice-card autoplay this note leaves alone; confirm
in writing that the deferral in
[[2026-08-16-conjugation-chain-audio-decision]] does not reach it before
batch 3 starts.
Lead — no verbData.ts defects to route, so batch 3 is unblocked on data.
Batch 3 still waits for the `learning-designer` confirmation above and for
the #453 / ORD-76 acceptance-text correction.
