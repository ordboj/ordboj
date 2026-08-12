# Fragment lemmas carry their obligatory preposition — 2026-08-12

Ticket #357. Owner: `product-manager`, with `learning-designer` input taken
from `docs/learning/particle-verb-practice.md`. Binding on
`src/data/particleVerbData.ts` (`swedish-linguist`) and on the qa-owned
dataset-integrity test (`src/data/particleVerbData.test.ts`). Research basis:
`docs/research/partikelverb/partikelverb-list.md`, section 3.6.

## 0. Decision

**Yes. An entry whose phrase never occurs without a trailing preposition
stores that preposition in a new `preposition?: string` field, and its
`lemma` carries the full phrase.** The cloze answer stays the particle
alone. The recall answer is the full phrase, preposition included. The
reference line shows the preposition on every form. The three blocked
entries (`pv:se-fram`, `pv:ga-miste`, `pv:ta-itu`) flip to `verified: true`
once a separate implementation ticket applies section 2 and section 4.

Concretely, for the three entries:

| id            | lemma (new)    | particle (cloze answer) | preposition | recall answer  |
| ------------- | -------------- | ----------------------- | ----------- | -------------- |
| `pv:se-fram`  | `se fram emot` | `fram`                  | `emot`      | `se fram emot` |
| `pv:ga-miste` | `gå miste om`  | `miste`                 | `om`        | `gå miste om`  |
| `pv:ta-itu`   | `ta itu med`   | `itu`                   | `med`       | `ta itu med`   |

**Runner-up: keep the fragment lemma and ship these entries as cloze-only,
the way reflexives are.** It lost because the recall card is the only place
the learner produces the whole unit, and for exactly these verbs the unit
includes the preposition. `hon ser fram semestern` is the error the card
exists to prevent. Cutting recall protects the app from an unfair prompt by
refusing to teach the hardest part of the phrase. Storing the real citation
form removes the unfairness instead.

**Second runner-up: fold the preposition into `particle`
(`particle: 'fram emot'`).** Rejected for the two reasons section 3.6 gives:
`acceptedParticles` would stop meaning one thing, and the particle is
stressed while the preposition is not, so one merged string misrepresents
the pronunciation contrast the mode teaches.

## 1. The two rulings the ticket asks for

**Lemma shape.** When `preposition` is set, `lemma` MUST equal
`` `${baseInfinitive} ${particle} ${preposition}` ``. The lemma is the
citation form; a citation form must be real Swedish, and `gå miste` alone is
not. This also keeps every existing mechanism working unchanged:

- `renderLemma` returns the full phrase, so the default recall answer
  (`getAcceptedRecallAnswers` in `src/lib/particleVerbs.ts`) is correct with
  no code change.
- The lemma-head assertion (`lemma.split(' ')[0] === baseInfinitive`) still
  holds.
- The forms-drift test derives the tail as
  `renderLemma(entry).slice(baseInfinitive.length)`, so it now expects
  `ser fram emot` / `såg fram emot` / `sett fram emot` automatically. The
  embedded `forms` therefore include the preposition too.

**Recall prompts.** The recall direction ships for these entries
(`hasRecallItem` stays reflexive-based and is not touched). The graded
recall answer includes the preposition, and only the full phrase is
accepted. `se fram` typed on the recall card is graded wrong: the
alternate-answers policy protects defensible answers, and a phrase that
never occurs in Swedish is not defensible. No partial credit, no second
accepted variant.

## 2. Data changes (`swedish-linguist` implements)

1. Add to `ParticleVerbData`:

   ```ts
   // Obligatory trailing preposition for the v+p+prep class (research list
   // section 3.6): the phrase never occurs without it. Displayed after the
   // particle everywhere the phrase renders, part of the recall answer,
   // never a cloze answer. Unset for every entry whose verb+particle string
   // stands on its own.
   preposition?: string;
   ```

2. For the three entries: set `preposition`, extend `lemma` per the table in
   section 0, add `forms` with the preposition included (checked against
   SO/SAOL like every shipped form), add a second example frame each (the
   two-frames rule applies to every verified entry), delete
   `unverifiedReason`, set `verified: true`. Keep the existing ids — ids are
   append-only and renaming one is a migration.

3. Drop the "(always with emot)"-style parentheticals from the three
   glosses. The lemma now states the fact; the gloss repeats it only as
   noise, and the recall card must not leak the answer through the prompt.
   The linguist words the final glosses.

## 3. Eligibility rule for the field

`preposition` is only for entries whose verb+particle string does not exist
as a standalone phrase. It is not for entries where a preposition merely
selects one sense: `hålla fast` (vid), `se ner` (på), `gå med` (i/på),
`ställa till` (med) all stand alone in at least one sense and stay exactly
as they are, with the prepositional sense named in the gloss or `contrast`.

Research section 3.6 states that `hålla fast` without `vid` means something
different. This decision keeps `pv:halla-fast` as it is, because the
dataset ships the concrete grip sense with three frames, and the `vid`
sense is named in the gloss. The field tracks phrases with no standalone
sense at all, not phrases with a second sense.
The research list counts 42 entries in the v+p+prep class. Two of the
blocked entries appear there as class rows (`se fram emot` row 594, `ta itu
med` row 639); `gå miste` sits in the ranked table (row 109) with the fact
stated in its gloss instead. Nine shipped entries already carry a
verb+particle string that a v+p+prep row also uses, and every one of them
ships a standalone sense: `pv:bli-av` (bli av med), `pv:halla-fast` (hålla
fast vid), `pv:halla-pa` (hålla på med), `pv:ga-ut` (gå ut på / gå ut över),
`pv:ga-upp` (gå upp i / gå upp för), `pv:se-ner` (se ner på), `pv:vara-med`
(vara med om / vara med på), `pv:saga-till` (säga till om), `pv:ta-in` (ta in
på). The eligibility rule above leaves all nine exactly as they are.

Scope limit: `preposition` requires `reflexive: 'none'` in v1. The one
known reflexive+preposition candidate (`sätta sig upp mot`) is not in the
dataset, and reflexives ship cloze-only anyway, so the combination is
deferred until an entry actually needs it.

## 4. The qa test (acceptance criterion 3)

Add one dataset-integrity block over every entry with `preposition` set:

1. **Format.** Non-empty, equals its own trim, NFC, lowercase, single token
   (no spaces), and `reflexive === 'none'`.
2. **Lemma shape.** `lemma === `` `${baseInfinitive} ${particle} ${preposition}` ``.
3. **Never the cloze answer.** `preposition` is not in `acceptedParticles`,
   and for every example, `sv.split(' ')[blankIndex]` is not the
   preposition token.
4. **Always present in the frame.** Every example sentence contains the
   preposition token at `blankIndex + 1` — the phrase never occurs without
   it, so no frame may show it detached from the particle.
5. **Renders in the reference line.** `getPhraseForms(entry)` returns four
   lines (`infinitive`, `presens`, `preteritum`, `supinum`) that each end
   with `` ` ${preposition}` ``.
6. **Graded recall includes it, the fragment does not pass.**
   `isAcceptedRecall(entry, renderLemma(entry))` is true and
   `isAcceptedRecall(entry, `` `${baseInfinitive} ${particle}` ``)` is
   false.

Plus one pin: the three ids `pv:se-fram`, `pv:ga-miste`, `pv:ta-itu` are
`verified: true` and carry `preposition` — the #262-style named-flip
assertion, so a regression is reported by name.

## 5. What this decision does not change

- `particle` stays the cloze answer and `acceptedParticles` keeps one
  meaning. No change to cloze grading or `blankIndex` semantics.
- No UI change is required. The preposition reaches the learner through
  `lemma` and `forms`, which every rendering path already reads. A future
  stress-styling pass (stressed particle, unstressed preposition) can use
  the structured field; it is not part of this ticket.
- No storage shape changes: item ids are unchanged, so no migration and no
  human approval beyond this note.
- `ta reda på` / `få reda på` stay excluded. Section 3.6 notes they carry a
  noun, not a particle, before the preposition; they need their own call.
