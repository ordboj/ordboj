# SVALex particle-verb extraction

`partikelverb_cefr_draft.csv` — 457 Swedish verb+particle combinations with
CEFR level evidence, extracted 2026-08-08 from SVALex and SweLLex (CEFRLex
project, UCLouvain / Språkbanken).

Columns: `verb, particle, svalex_first_level, svalex_total_freq,
swellex_first_level`.

## Method

"First level" = first CEFR level with nonzero frequency in the resource's
per-level distribution. This is **our derivation**, not a label the resource
assigns — CEFRLex deliberately publishes frequency distributions per level,
not single-level labels. Sparse entries (especially the C1 tail) may rest on
a single coursebook occurrence and need human review.

Known over-capture: 111 of the 457 rows use a form that is also a preposition
(om, på, av, till, över, med, åt, efter, för, ur, emot, undan). Some are
genuine particle verbs (`tycka om`, `titta på`), some are prepositional verbs
(`bero på`) that must not enter the dataset. Discriminator is stress (particle
carries it), verified against SO/SAOL (svenska.se). Adjudication is
swedish-linguist's task (spec F2).

## Sources

- SVALex v2 (15,681 entries from 12 CEFR-graded L2 coursebooks incl. Rivstart):
  <https://cental.uclouvain.be/cefrlex/static/resources/sv/SVALex_v2.tsv>
  — project page <https://cental.uclouvain.be/svalex/>, mirror at
  <https://spraakbanken.gu.se/en/resources/svalex>, paper
  <https://aclanthology.org/L16-1032/>
- SweLLex v2 (learner-production counterpart, cross-check):
  <https://cental.uclouvain.be/cefrlex/static/resources/sv/SweLLex_v2.tsv>

## License

SVALex and SweLLex are **CC BY-NC-SA 4.0**. This extraction is a derivative
and carries the same license: attribution required, non-commercial use only,
share-alike. Any Ordböj data derived from this file (CEFR bands in
`particleVerbData.ts`) inherits these terms. Human sign-off on this usage:
2026-08-08.
