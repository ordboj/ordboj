# Lemma, reflexive and alternative-form conventions in verb data — 2026-08-08

Ticket #43. Owner of this ruling: `learning-designer`. Implementer:
`swedish-linguist`. This decision blocks #8 (infinitive-as-id): the lemma
column becomes the identity key, so it must be clean before #8 starts.

## 0. Decision

Three rulings, stated fully in sections 2–4, plus C2b for the one
orthographic doublet:

1. **One clean lemma per row.** The infinitive column carries exactly one
   citation form: no parentheses, no slashes, no editorial prose. The seven
   annotated rows (`ta (el. taga)` and friends) move their annotation to a
   new optional `note` field. Variants named in a note are
   **recognition-only**: they are never accepted answers.
2. **Reflexive lemmas keep `sig`.** The 15 multi-word reflexives (`bry sig`,
   `närma sig`, …) keep the pronoun in the lemma and in every stored form.
   An answer without `sig` is incorrect.
3. **`/`-separated cells are accepted sets, graded full credit.** A slash in
   a conjugation cell is the CSV encoding of the accepted-answer list from
   the #123 decision (`docs/product/2026-08-08-alternate-answers-decision.md`):
   first token is the primary, the rest are alternates, and **every form in
   the accepted set earns full credit (grade 5)** — including pairs the
   linguist classifies as sense-conditioned (transitive/intransitive or
   meaning splits). Sense-conditioned pairs stay on one row and get a
   per-form disclosure note instead of the generic "Both X and Y are
   correct." line.

Nothing here changes `localStorage`. All three rulings touch shipped verb
data only, and the cleanup must not insert, delete or reorder rows in
`VERB_DATA`, so today's index-based ids stay stable until #8 replaces them.

## 1. The data as it stands

Counted directly from `public/data/swedish_verbs.csv` (1538 data rows) and
`src/data/verbData.ts` (~50 rows, the only table that ships — the CSV is
read by tests, not by the app):

- **7 annotated lemmas, plus one further parenthetical lemma handled
  separately** (CSV lines 12, 18, 78, 133, 217, 679, 799):
  `ta (el. taga)`, `ge (formellt giva)`, `fungera (vardagl. funka)`,
  `be (el. bedja)`, `jämföra (förk. jfr)`, `klä (el. kläda)`,
  `fotografera (vardagl. fota)`. `verbData.ts` already stripped two of them
  silently (`ta`, `ge`), so CSV and TS disagree on the exact string #8 wants
  as the id. An eighth row carries parentheses in the lemma without being an
  annotation: CSV line 1482, `betyg(s)sätta`. It is handled by C2b, not by
  the note rule.
- **15 reflexive lemmas** (CSV lines 20, 82, 286, 393, 509, 524, 566, 577,
  579, 640, 668, 854, 914, 924, 926): `te sig`, `åta sig`, `bry sig`,
  `närma sig`, `lämpa sig`, `bege sig`, `förhålla sig`, `bete sig`,
  `nöja sig`, `motsätta sig`, `utspela sig`, `löna sig`, `bosätta sig`,
  `infinna sig`, `förlita sig`.
- **9 slash rows** (CSV lines 15, 87, 105, 129, 193, 220, 444, 945, 991):
  `säga` (sa/sade), `betala` (betalat/betalt), `tvinga` (tvang/tvingade,
  tvungit/tvingat), `växa` (växt/vuxit), `sprida` (spred/spridde,
  spridit/spritt), `vika` (vikit/vikt), `lyda` (löd/lydde, lydit/lytt),
  `begrava` (begravde/begrov), `svälta` (svalt/svälte, svultit/svält).
  `mala` (CSV line 1326) carries no slash today but belongs to the same
  family; if the linguist adds its documented alternates, the same rules
  apply.
- **One shipped accepted set the CSV does not encode:** `lägga` (CSV
  line 40) stores preteritum `la` with no slash, while
  `src/data/verbData.ts` ships `alternates: { preteritum: ["lade"] }`.
  Under C4 the CSV cell must become `la/lade`. The sync is therefore
  two-way, not CSV-to-TS only.

The machinery for alternates already exists and is not re-decided here:
`alternates` on `VerbData`, `getAcceptedAnswers` / `isAcceptedAnswer` /
`getAlternatesDisclosure` in `src/lib/verbs.ts`, and policies P1–P9 in the
#123 decision doc. `säga` (sa/sade) and `lägga` (la/lade) already ship under
it. This ruling extends that mechanism to the remaining rows and settles the
questions #123 left open.

## 2. C1–C2 — Lemma column and the `note` field

**C1 — Lemma contract.** The infinitive column (CSV) and the `infinitive`
field (TS) contain exactly the citation form the learner sees and types:
lowercase, single spelling, no parentheses, no slashes, no abbreviations.
Multi-word lemmas are allowed only for the reflexive `X sig` pattern in this
table. This exact string becomes the #8 id, byte for byte, so CSV and TS
must agree on it after this cleanup. The linguist audits the TS table for
any remaining annotated lemma at the same time.

**C2 — `note` field.** The CSV gains one final column, `note`, empty for
nearly every row. `VerbData` gains `note?: string`. Content is free text
owned by `swedish-linguist` (e.g. for `ta`: a note naming `taga` as the
archaic infinitive — exact Swedish/English wording is the linguist's).
Rules:

- **Recognition-only.** A note may be shown after the answer is graded
  (feedback panel or a future detail view). It must never appear during
  retrieval — the red-lines doc
  (`docs/learning/2026-08-08-ux-pedagogy-red-lines.md`) governs: the screen
  during retrieval contains the question and nothing that could answer it.
- **Never an accepted answer.** `taga`, `giva`, `bedja`, `kläda` and the
  colloquial lexemes `funka`/`fota` (and their conjugations) do not join any
  accepted set. The app teaches production of modern standard Swedish; the
  archaic and colloquial variants are recognition knowledge. This keeps the
  existing exclusion in `AlternateFormField` (no alternates for
  `infinitive`) intact.
- **`jämföra (förk. jfr)` is the exception: drop the annotation entirely.**
  `jfr` is a dictionary abbreviation ("compare"), not a form of the verb.
  Nothing moves to `note`; the annotation simply goes. (That row's
  conjugation cells also look template-generated; that defect belongs to the
  #125 audit family, not to this ticket — the linguist should report it to
  the lead, not fix it here.)

**C2b — Orthographic doublets in the lemma (`betyg(s)sätta`).** The `(s)` is
not editorial prose; it marks an orthographic variation, not necessarily an
archaic one. C1 still holds — the cell carries one spelling with no
parentheses. `swedish-linguist` checks both `betygssätta` and `betygsätta`
against SAOL. **Only if both are listed as current standard spellings** does
the linguist pick the primary and record the rejected spelling in `note` for
display only, with an explicit source comment stating that the note marks a
spelling doublet and not an archaism — the ordinary C2 recognition-only rule
must not be applied in that case. **If SAOL lists one spelling as archaic or
non-standard**, that spelling is not a doublet at all, and the ordinary C2
rule applies instead: the non-standard form goes to `note` as a recognition-
only archaic variant, same as `taga`/`giva`/`bedja`/`kläda`. The chosen lemma
spelling must match the row's own conjugation cells (line 1482 stores
`betygsätter`/`betygsatte`/`betygsatt` today); if the linguist makes the
double-s spelling primary, the paradigm cells change with it. The app cannot
accept both spellings as answers either way, because `getAcceptedAnswers` and
`getAlternateForms` in `src/lib/verbs.ts` both return early for
`form === 'infinitive'` and alternates are not modeled for the dictionary
form (#123). Widening the accepted set to cover infinitive doublets is out
of scope here and belongs to #257 if it is ever wanted.

## 3. C3 — Reflexives

- The 15 lemmas keep `sig`: lemma `bry sig`, presens `bryr sig`, and so on
  through every stored form, exactly as `te sig` is stored today. Under #8
  the id is the full string including the space and `sig`.
- **Grading:** `sig` is part of every accepted answer. An answer missing
  `sig` is incorrect — it is a different or incomplete lexeme, and P2
  normalization (`.toLowerCase().trim()`, nothing more) already gives this
  for free. An answer with no space at all (`brysig`) is wrong because it is
  not the lemma — it has merged two words into one that does not exist.
  Whether runs of internal whitespace should collapse (`bry  sig` with a
  double space) is a separate question that #123 P2 did not settle, and this
  ruling does not change it either way; do not read the `brysig` example as
  settling it, since collapsing `\s+` to a single space would still reject
  `brysig`.
- **Imperativ:** the reflexive pronoun shifts to the second person in
  commands, so a stored imperativ for these verbs uses `dig`, never `sig`.
  Whether a given reflexive has a natural imperative at all is a per-verb
  judgment the linguist verifies; where it is unnatural or unverifiable, the
  cell stays empty, and empty means "not practiced" — the same convention
  the modal verbs already use. No code may template-generate a reflexive
  imperative.

## 4. C4–C6 — Alternative forms: encoding, grading, primary

**C4 — Encoding.** A `/` in a CSV conjugation cell is machine-readable
structure, not prose: `first/second[/third]`, no spaces around the slash,
first token is the primary. The TS importer (and the linguist's manual sync
for the ~50 shipped rows) maps the first token to the plain field and the
rest into `alternates`. The infinitive column never carries a slash (C1).
Prose in any cell — `(el. …)`, `(vardagl. …)` — is banned everywhere; only
the `note` column holds prose. Parentheses that mark an optional letter
rather than prose (CSV line 691 `gläd(i)er`, CSV line 1300 `anförtro(r)`)
have no encoding under C4 and must not be invented here. Both rows are
unshipped. `swedish-linguist` reports them to the lead for the #125 audit
family; if a row like this is ever promoted into `VERB_DATA`, it must first
be rewritten as either a single form or a `/` accepted set under C4.
`gläd(i)er` in particular looks like a typo for the glädjer/gläder doublet
and must be verified against SAOL, never guessed.

**C5 — Grading rule (the acceptance criterion of #43).** Every form in a
row's accepted set earns **full credit, grade 5**, indistinguishable from
the primary. This holds for both kinds of alternates:

- _Free variants_ (the `sa`/`sade` kind): both are standard modern Swedish
  for the same sense. #123 already ruled these full credit; unchanged.
- _Sense-conditioned pairs_ (the splits the ticket names in `sprida`,
  `lyda`, `svälta`, `begrava`, `tvinga`, `vika`, `mala`): where the strong
  and weak form belong to different senses (e.g. transitive vs
  intransitive), **both still earn full credit**, because the card shows a
  bare paradigm with no sentence context — the learner cannot know which
  sense is being asked, so marking either correct form wrong would punish
  correct Swedish. Wrong Swedish is worse than missing Swedish, and so is
  wrongly-rejected Swedish.

Consequences an engineer needs, all already implied by #123 and restated
here so nobody re-derives them: one SRS item per (verb, form) — no
per-sense items, no duplicate rows for one infinitive (two rows with the
same lemma would collide on the #8 id and double-schedule the learner);
multiple-choice distractors exclude the whole accepted set (P7), which is
precisely what prevents a card from offering two forms that are both
correct; hints, blanks, tiles and TTS follow the primary (P5, P8).

**Classification is the linguist's, against SAOL/SO — never guessed.** For
each non-primary token in the nine rows (and `mala`), the linguist assigns
one of exactly three categories:

1. **Accepted alternate** — listed in current SAOL as a valid form of this
   lemma → stays in the cell, joins `alternates`, full credit.
2. **Sense-conditioned alternate** — valid but tied to a distinct sense →
   same as (1) **plus** a per-form disclosure note (C6a below).
3. **Archaic/historical only** — no longer a current standard form → leaves
   the cell, may be named in `note`, recognition-only, not accepted.

This ruling deliberately does not pre-assign categories: whether e.g.
`tvang` is current or archaic is a Swedish fact to verify, not to decide by
policy. Any form the linguist cannot verify is dropped to `note` with a
NEEDS HUMAN CHECK comment, per the standing rule.

**C6 — Primary selection.** The primary (index 0) is the form the app
teaches for production: the most common form in contemporary standard
Swedish by the linguist's judgment against SAOL/SO. For sense-conditioned
pairs, the primary is the form of the sense most useful at the row's CEFR
level. Where frequency is judged roughly equal, prefer the form that is
regular for the verb's `grupp` (one less exception to memorize). Precedent:
`sa` primary over `sade` in shipped data. Each choice gets a source comment
in `verbData.ts`, as the `säga` row has today.

**C6a — Disclosure for sense-conditioned pairs.** The generic P6 line
("Both X and Y are correct.") asserts interchangeability, which is false
Swedish for a sense split. `VerbData` gains
`alternatesNote?: Partial<Record<AlternateFormField, string>>`; when a note
exists for the graded form, `getAlternatesDisclosure` returns it **instead
of** the generic sentence. The note states the conditioning in one line
(English frame, Swedish forms inline, matching the existing disclosure
style); `swedish-linguist` composes it, `frontend-expert` renders it
verbatim. Free variants keep the generic line and need no note.
`alternatesNote` is TS-only for now; it gets a CSV column only when the CSV
becomes the shipping source under #257.

## 5. Sequencing and ownership

1. This ruling merges (learning-designer, this doc).
2. `swedish-linguist` implements #43 in `public/data/swedish_verbs.csv`,
   `src/data/verbData.ts`, `src/lib/verbs.ts`: C1 lemma cleanup (7 annotated
   rows + `betyg(s)sätta` under C2b + TS audit), `note` column/field, C3
   reflexive audit, C5 classification of the 9 slash rows + `mala`, C6
   primaries, C6a notes. No row insert/delete/reorder in `VERB_DATA`.
   (tracked as #279)
3. `qa` updates the CSV-reading tests for the new column; `swedish-linguist`
   confirms `scripts/validate-verb-forms.mjs` still passes (`note` is not in
   `FORM_FIELDS`, so it is not char-validated, and the header-derived
   field-count check absorbs the extra column). A `note` containing a comma
   must be double-quoted per RFC 4180; the validator's splitter handles
   quotes, the bare-comma parser in `src/data/verbData.test.ts` does not.
   `qa` also adds the checks in section 6.
4. Only then does #8 flip ids to the (now clean and CSV/TS-agreed) lemma
   strings.

## 6. Acceptance checks for the implementing PR

1. No cell in the infinitive column of CSV or TS contains `(`, `)` or `/`.
   This includes CSV line 1482 (`betyg(s)sätta`), resolved under C2b.
2. The 15 reflexive lemmas are unchanged and carry `sig` in every non-empty
   stored form; any stored reflexive imperativ uses `dig`.
3. Every slash cell parses as `form(/form)+` with no spaces; the TS row for
   each shipped slash verb has the first token as its field value and the
   verified remainder in `alternates`; and, in the other direction, every
   `alternates` entry in `VERB_DATA` has a matching `/` cell in the CSV row
   for that lemma (today `lägga` preteritum fails this).
4. For each of the 9 rows + `mala`: a source comment naming the category
   (free variant / sense-conditioned / archaic-dropped) per form.
5. Typing any accepted alternate for a shipped row grades correct with
   grade 5 (extends existing #123 tests).
6. A sense-conditioned form's feedback panel shows the `alternatesNote`
   line and not the generic "Both … are correct." line.
7. `taga`, `giva`, `funka`-forms and other note-only variants grade
   incorrect.
8. `VERB_DATA` row order and length are unchanged (id stability until #8).
9. Line 1482's lemma spelling and its presens/preteritum/supinum cells use
   the same compound form.
10. After the C1 cleanup, every lemma in the CSV infinitive column is
    unique, and every `VERB_DATA.infinitive` is unique — the #8 id depends
    on it.

## 7. Out of scope

- Fixing suspect conjugations in unshipped CSV rows (`jämförar`,
  `gläd(i)er`, `anförtro(r)`) — #125 audit family.
- CSV→TS sync and content growth — #257.
- Sense-discrimination exercises (a card that _does_ give sentence context
  and grades the sense-appropriate form) — a real future idea; file it as
  its own ticket if wanted. Nothing in this ruling precludes it.
- Particle-verb lemma conventions — #247 owns its own data shape.
- Typo tolerance, diacritic folding — rejected in #123, still rejected.
