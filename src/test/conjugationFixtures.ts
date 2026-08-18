import type { ConjugatedVerb } from '@/lib/verbs';

// Fixture verbs transcribed from real rows in src/data/verbData.ts
// (swedish-linguist-owned) as literal ConjugatedVerb objects — the exact
// shape conjugateVerb() in src/lib/verbs.ts produces (raw form or its
// "(not available)" fallback, imperativNotApplicable carried through as-is).
// Shared by src/lib/speech.test.ts (buildConjugationUtterance, #453) and
// src/lib/speechConjugationParity.test.tsx (PracticeCard parity, #456) so
// both suites exercise the same fixture verbs rather than two copies that
// can drift apart.

// verbData.ts:86 - full regular paradigm, grupp 4. Every form is a
// distinct string, which the parity suite relies on (see that file's header
// comment for why).
export const SKRIVA: ConjugatedVerb = {
  id: 'skriva',
  infinitive: 'skriva',
  presens: 'skriver',
  preteritum: 'skrev',
  supinum: 'skrivit',
  imperativ: 'skriv',
};

// verbData.ts:432 - deponent verb (grupp 1): every form ends in "-s".
// Not used by the parity suite (infinitive/presens/imperativ all happen to
// share the literal string "misslyckas", which collapses a set-of-values
// comparison — see that file's header comment).
export const MISSLYCKAS: ConjugatedVerb = {
  id: 'misslyckas',
  infinitive: 'misslyckas',
  presens: 'misslyckas',
  preteritum: 'misslyckades',
  supinum: 'misslyckats',
  imperativ: 'misslyckas',
};

// verbData.ts:87 - multi-word reflexive phrase (grupp 3). imperativ is
// stored empty in VERB_DATA but is NOT flagged imperativNotApplicable (see
// the isFormUnavailable comment in src/components/PracticeCard.tsx:30-42:
// intentionally empty pending human review, not grammatically absent), so
// conjugateVerb() falls back to the "(not available)" sentinel for it — the
// generic empty/sentinel exclusion rule, not the imperativNotApplicable one.
export const TE_SIG: ConjugatedVerb = {
  id: 'te sig',
  infinitive: 'te sig',
  presens: 'ter sig',
  preteritum: 'tedde sig',
  supinum: 'tett sig',
  imperativ: '(not available)',
};

// verbData.ts:66 - modal verb (grupp 4): imperativ grammatically does not
// exist in Swedish, per noNaturalImperativ / imperativNotApplicable.
export const KUNNA: ConjugatedVerb = {
  id: 'kunna',
  infinitive: 'kunna',
  presens: 'kan',
  preteritum: 'kunde',
  supinum: 'kunnat',
  imperativ: '(not available)',
  imperativNotApplicable: true,
};

// verbData.ts:120 - full regular paradigm, grupp 1. imperativ equals the
// infinitive verbatim (a grupp-1 pattern, not a sentinel or fallback).
export const TALA: ConjugatedVerb = {
  id: 'tala',
  infinitive: 'tala',
  presens: 'talar',
  preteritum: 'talade',
  supinum: 'talat',
  imperativ: 'tala',
};

// verbData.ts:806 - deponent verb (grupp 1), same "-s" pattern as
// MISSLYCKAS. Not used by the parity suite for the same duplicate-string
// reason: infinitive, presens and imperativ all share the literal string
// "färdas", which collapses a set-of-values comparison.
export const FARDAS: ConjugatedVerb = {
  id: 'färdas',
  infinitive: 'färdas',
  presens: 'färdas',
  preteritum: 'färdades',
  supinum: 'färdats',
  imperativ: 'färdas',
};

// verbData.ts:112 - stative verb (grupp 4). imperativ is stored empty in
// VERB_DATA but is NOT flagged imperativNotApplicable (see the
// isFormUnavailable comment in src/components/PracticeCard.tsx:30-42),
// so conjugateVerb() falls back to the "(not available)" sentinel for it —
// a second sentinel-excluded-imperativ case alongside TE_SIG, with every
// available form a distinct string.
export const ANSE: ConjugatedVerb = {
  id: 'anse',
  infinitive: 'anse',
  presens: 'anser',
  preteritum: 'ansåg',
  supinum: 'ansett',
  imperativ: '(not available)',
};

// Every frozen fixture row, for the drift guard in speech.test.ts: each
// fixture's forms must match what conjugateVerb() derives from the live
// src/data/verbData.ts row, so a hand-transcription error or an upstream
// data edit fails loudly instead of drifting silently.
export const ALL_FIXTURES = [SKRIVA, TALA, FARDAS, MISSLYCKAS, TE_SIG, KUNNA, ANSE];
