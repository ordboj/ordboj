# swedish_verbs.csv conjugation audit (2026-08-08)

Owner: swedish-linguist. Scope: GitHub issue #125.

Lives in `docs/`, not `public/`: anything under `public/` is copied verbatim
into the production bundle by Vite, and this is an internal working note.
Line numbers below refer to `public/data/swedish_verbs.csv` as of this
commit (1-based, header is line 1).

The file moved to `docs/verb-data/candidates.csv` (issue #280, `git mv`, same
content and line numbers) after this audit was written; the line numbers
above still apply at the new path.

## Why

`swedish_verbs.csv` was generated in a way that applied a naive grupp-1
template — `presens = infinitiv + "r"`, `preteritum = infinitiv + "de"`,
`supinum = infinitiv + "t"` — to every `-a`-infinitive row, regardless of
the verb's real conjugation class. For genuine grupp-1 verbs (`prata`,
`hitta`, `titta`, `kalla`, …) this template is correct by construction.
For grupp 2a/2b weak verbs and grupp 4 strong/irregular verbs whose
infinitive also happens to end in `-a` (`ställa`, `byta`, `sätta`,
`komma`-compounds, …), it produces forms nobody would say. The bug is
high-recall/low-precision by nature: the template can't be told apart from
a correct grupp-1 conjugation by shape alone, only by knowing the verb.

## Method

1. Wrote a detector (`scratchpad`, not checked in) that flags every CSV row
   where `presens/preteritum/supinum` exactly equal the naive template
   applied to the infinitive. This is a superset of the ~256 rows quoted in
   #125 (1255 of 1537 rows match the shape — most of those are genuine
   grupp-1 verbs, which is expected given the template's construction).
2. Built a curated table of Swedish base verbs that are **not** grupp 1
   (grupp 2a, 2b, 3, 4) together with their correct forms, keyed either by
   exact infinitive or by a compound suffix (e.g. `-sätta` inherits
   `sätta`'s `sätter/satte/satt`, because in Swedish a prefixed compound
   verb (`ersätta`, `utsätta`, `omsätta`, …) always inherits the base
   verb's conjugation class — this is a hard morphological rule, not a
   guess). Suffix rules were only added after checking that no unrelated
   grupp-1 word in the CSV ends in that suffix by coincidence (spot-checked
   with substring search over the full candidate list, e.g. confirmed
   `ändra`/`hindra`/`vandra`/`beundra` are genuine grupp 1 despite
   containing `dra`, so `dra` itself was deliberately never added as a
   general suffix rule — only whitelisted per exact compound word).
3. Cross-referenced every candidate row against the table; matches were
   corrected, everything else was left as confirmed grupp 1. Two entries
   that would have matched a suffix rule (`befalla`, `bönfalla`, both via
   the `falla` family) were excluded and left for human review instead,
   because their modern conjugation has plausibly drifted from the strong
   `falla` pattern and I do not have high confidence either way.
4. Swept remaining `-va/-pa/-ka/-ta/-da/-ja/-ma/-na/-la/-sa` candidates by
   hand, verb by verb, against known Swedish conjugation classes (not
   pattern-derived — grupp 1 vs. grupp 2 for a consonant-final stem is
   lexically determined in Swedish, e.g. `tacka` is grupp 1 but `täcka` is
   grupp 2b despite an identical shape).
5. While reviewing the diff, also caught two unrelated data-corruption
   rows outside the naive-template pattern: `svara` (A1) had `svära`'s
   forms pasted in with a stray uppercase (`svär,SVor,svurit`) instead of
   its own `svarar,svarade,svarat`; `sova` had `SOV` instead of `sov` in
   preteritum. Both fixed.
6. Ran a mojibake/typo scan (non-ASCII/non-Swedish-letter characters,
   stray uppercase mid-word) over the whole file: clean except the two
   rows above. The dotless-i typos fixed in PR #85 remain fixed.
7. **Second pass (review follow-up).** Code review of the first pass found
   that the sweep in step 4 was organised by infinitive _ending_
   (`-va/-pa/-ka/…`) and therefore skipped whole compound families whose
   ending was not on that list. A second detector was run: for a curated
   list of ~70 base verbs known not to be grupp 1, flag every still-naive
   row whose infinitive is that base or a prefixed compound of it. This
   found 24 more wrong rows, all corrected in this pass — the `-lägga`
   family (9), `-föra` (5), `-röra` (3), plus `styra`, `spränga`,
   `upplysa`, `överräcka`, `förebygga`, `förutsäga` and `inneha`
   (supinum only: `innehat` → `innehaft`). Every one was checked against
   the base verb's own row already present in the CSV
   (`lägga,,lägger,la,lagt`; `föra,,för,förde,fört`;
   `röra,,rör,rörde,rört`; `räcka,,räcker,räckte,räckt`;
   `lysa,,lyser,lyste,lyst`; `bygga,,bygger,byggde,byggt`;
   `säga,,säger,sa/sade,sagt`; `ha,ha,har,hade,haft`), so the corrections
   are consistent with data already in the file rather than derived from
   memory alone. Compounds of `lägga` take `-lade` in preteritum
   (`anlade`, `kartlade`), not the base's colloquial `la`.
   Three rows the detector flagged were rejected as false positives and
   left alone: `matcha`, `duscha` and `ledsaga` are genuine grupp 1 and
   only matched because they happen to end in `-ha`/`-saga`.

## Result

- 316 rows corrected (163 initial dictionary matches, 129 from the
  ending-based sweep in step 4, 24 from the family-based sweep in step 7),
  plus the 2 unrelated corruption fixes (`svara`, `sova`) = 318 changed
  lines total.
- Every corrected row: `presens`, `preteritum`, `supinum` replaced with the
  verb's real conjugation. `cefr`, `grammar`, `infinitive`, `imperativ`
  columns untouched. `imperativ` was blank on all 318 touched rows and was
  left blank — filling it is issue #124's job, not this audit's, and
  guessing it here would have been out of scope.
- ~940 remaining naive-template-shaped rows were left unchanged as
  presumed-genuine grupp 1 — these are the "hitta, titta, kalla"-type
  true positives the issue warned about. See the honesty note under
  "For #21" for what that presumption is and is not worth.
- 13 rows deliberately **not** corrected — flagged below for human
  confirmation because I do not have high confidence in the standard
  modern form. Their naive-template forms are almost certainly still
  wrong; leaving them as-is until a human confirms is safer than guessing.

### Needs human check (not modified)

| infinitive | csv line | concern                                                                                                                                                                                                       |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| befalla    | 1189     | weak (`befaller/befallde/befallt`) vs. strong `falla`-pattern (`befaller/beföll/befallit`) — genuinely unsure which is standard modern usage                                                                  |
| bönfalla   | 1500     | same ambiguity as befalla, rarer word                                                                                                                                                                         |
| smälta     | 794      | modern Swedish mixes weak (`smälter/smälte/smält`) and strong/archaic (`smälter/smalt/smultit`) forms depending on transitivity                                                                               |
| svälla     | 1432     | same weak/strong ambiguity as smälta                                                                                                                                                                          |
| välta      | 992      | unsure of standard presens/preteritum shape                                                                                                                                                                   |
| ryka       | 576      | unsure whether standard is strong (`ryker/rök/rukit`) or weak                                                                                                                                                 |
| ådra       | 1394     | "ådra sig" (to incur/sustain) — unsure of exact reflexive conjugation                                                                                                                                         |
| bräda      | 1533     | unclear this is a real verb infinitive vs. the noun "bräda" (board/plank); possible data error                                                                                                                |
| planta     | 1539     | unclear this is a real verb infinitive vs. a truncation of "plantera"; possible data error                                                                                                                    |
| vädja      | 995      | plausibly grupp 1 (`vädjar/vädjade/vädjat`) but not fully confident given -ja compounds split lexically between grupp 1 and 2a                                                                                |
| breda      | 842      | presens may be irregular (`brer`, not `breder`) — needs confirmation before touching                                                                                                                          |
| återgälda  | 1532     | rare/archaic; unsure of standard modern conjugation                                                                                                                                                           |
| förknippa  | 834      | plausibly grupp 1 (`förknippar/förknippade/förknippat`, derived from the noun "knippa") but flagged for a second opinion since it looks superficially like `knäppa`/`knipa`-class verbs which are not grupp 1 |

## For #21 (bulk CSV → VERB_DATA import)

**The naive-template class of error is not closed, and this document does
not claim it is.** An earlier revision of this note did claim it; that
claim was wrong and the step-7 second pass is the proof — it found 24
more bad rows in families the first pass never looked at.

What is actually true:

- 316 rows were positively identified as non-grupp-1 and corrected.
- 13 rows are known-uncertain and are listed below, untouched.
- The remaining ~940 naive-template-shaped rows were **not** individually
  verified against a reference. They were left unchanged because nothing
  flagged them, which is a much weaker statement than "confirmed correct".
  The detector is shape-based, and a naive grupp-1 template is
  indistinguishable by shape from a correct grupp-1 conjugation — that is
  the whole difficulty of #125. A row survives only if no curated base
  verb or suffix rule matched it, so any non-grupp-1 verb missing from
  the curated list is still wrong in the file today.
- Expected residual error rate is therefore low but not zero, and it is
  concentrated in low-frequency B2/C1/C2 verbs, since the curated list
  was built from common vocabulary first.

Recommended handling in #21: bulk-import A1/A2/B1 rows, exclude the 13
below, and route B2–C2 rows through a reference check (SAOL/Svenska.se or
a native speaker) before they reach learners. Everything else in the CSV
outside the naive-template failure mode was not examined at all by this
audit — this ticket is not a full line-by-line audit of all 1537 rows.
