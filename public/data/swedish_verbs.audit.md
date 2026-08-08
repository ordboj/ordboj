# swedish_verbs.csv conjugation audit (2026-08-08)

Owner: swedish-linguist. Scope: GitHub issue #125.

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

## Result

- 292 rows corrected (163 initial dictionary matches + 129 found in the
  follow-up `-va/-pa/-ka/-ta/-da/-ja/-ma/-na/-la/-sa` sweep), plus the 2
  unrelated corruption fixes (`svara`, `sova`) = 294 changed lines total.
- Every corrected row: `presens`, `preteritum`, `supinum` replaced with the
  verb's real conjugation. `cefr`, `grammar`, `infinitive`, `imperativ`
  columns untouched (imperativ was already blank on every touched row
  except one, so it was left as-is rather than guessed in this pass).
- ~963 remaining naive-template-shaped rows reviewed and confirmed as
  genuine grupp 1 (no change) — these are the "hitta, titta, kalla"-type
  true positives the issue warned about.
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

The naive-template class of error is now closed: every row that matched
the detector has been individually audited (corrected or confirmed). The
13 rows above are the only known-uncertain rows left in the file; #21
should either exclude them from a bulk import or route them through a
second linguist review first. Everything else in the CSV was not touched
by this audit and should not be assumed correct by association — this
ticket only covers the naive-template failure mode described in #125, not
a full line-by-line audit of all 1537 rows.
