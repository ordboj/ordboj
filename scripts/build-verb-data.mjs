#!/usr/bin/env node
// Validating promotion pipeline for VERB_DATA (issue #41).
//
// Reads public/data/swedish_verbs.csv (source of record, ~1537 rows),
// classifies every row into a Swedish conjugation class (grupp 1 / 2a / 2b /
// 3 / 4, or "deponens" for -s verbs), and validates it:
//   - form-class contradictions (e.g. a 2a/2b voicing mismatch)
//   - characters outside the allowed Swedish verb-form alphabet
//   - empty imperativ on a non-modal verb, when no mechanical or curated
//     derivation is available
//
// Rows that fail validation are written to scripts/verb-data-review.csv and
// are NEVER included in the emitted src/data/verbData.ts.
//
// GROWTH IS INTENTIONALLY CAPPED in this run. Verb ids in this app are
// array-index-based (src/lib/verbs.ts) and stable ids are not yet in place
// (issue #8, hard blocker per issue #21: "NO table extension merges before
// #8"). Extending or reordering VERB_DATA before #8 lands would silently
// remap every stored SRS review to the wrong verb. So PROMOTED_INFINITIVES
// below is pinned to the verbs already shipped, in their existing order —
// this run only re-validates and (where missing) fills in mechanically or
// individually verified imperativ forms for those 50 rows; it never adds or
// reorders rows. Run with --all to audit (never ship) the full CSV so a
// future ticket has the data to promote more verbs once #8 lands.
//
// Usage:
//   node scripts/build-verb-data.mjs         # emit verbData.ts + review file
//   node scripts/build-verb-data.mjs --check # validate only, no writes
//   node scripts/build-verb-data.mjs --all   # also classify/validate every
//                                             # CSV row for the review file
//                                             # (still never promotes them)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const CSV_PATH = path.join(ROOT, 'public/data/swedish_verbs.csv');
const OUT_PATH = path.join(ROOT, 'src/data/verbData.ts');
const REVIEW_PATH = path.join(ROOT, 'scripts/verb-data-review.csv');

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const AUDIT_ALL = args.has('--all') || !CHECK_ONLY; // default run audits everything too

// ---------------------------------------------------------------------------
// Verbs with no natural imperativ (modal / auxiliary). An empty imperativ on
// one of these is correct, not a validation failure.
const MODAL_INFINITIVES = new Set(['kunna', 'få', 'vilja', 'skola', 'skall', 'måste', 'må', 'lär']);

// Individually verified imperativ forms for irregular (grupp 4) and
// reflexive verbs, where the form cannot be mechanically derived from the
// other CSV columns. Every entry has been checked against real Swedish
// usage by the swedish-linguist role — never guessed. "te sig" follows the
// standard reflexive imperativ rule (sig -> dig for singular address, cf.
// "skynda dig", "bete dig").
const IRREGULAR_IMPERATIV = {
  vara: 'var',
  ha: 'ha',
  bli: 'bli',
  komma: 'kom',
  göra: 'gör',
  finna: 'finn',
  ta: 'ta',
  se: 'se',
  gå: 'gå',
  säga: 'säg',
  ge: 'ge',
  skriva: 'skriv',
  'te sig': 'te dig',
  riva: 'riv',
  veta: 'vet',
  låta: 'låt',
  stå: 'stå',
  hålla: 'håll',
  ligga: 'ligg',
  lägga: 'lägg',
  anse: 'anse',
  bära: 'bär',
};

// Verbs already shipped in src/data/verbData.ts, in their existing order.
// See the growth-cap note above for why this list isn't just "every row
// that passes validation".
const PROMOTED_INFINITIVES = [
  'vara', 'ha', 'kunna', 'unna', 'få', 'bli', 'komma', 'vilja', 'göra', 'finna',
  'ta', 'se', 'gå', 'säga', 'äga', 'betyda', 'ge', 'skriva', 'te sig', 'riva',
  'börja', 'tro', 'tycka', 'veta', 'försöka', 'behöva', 'känna', 'läsa', 'ro', 'låta',
  'stå', 'visa', 'använda', 'vända', 'hålla', 'tänka', 'söka', 'ligga', 'lägga', 'anse',
  'öva', 'handla', 'öka', 'skapa', 'kapa', 'gälla', 'verka', 'tala', 'bära', 'höra',
];

// Per-row commentary preserved verbatim above the named row in the emitted
// file (currently only "lägga" carries one).
const ROW_COMMENTS = {
  lägga: [
    '  // "lägga" has two accepted preteritum forms, "la" and "lade" (SAOL). The',
    '  // short form is stored here for consistency with "säga" -> "sa" above.',
    '  // Until the app accepts alternate answers, a learner typing "lade" is',
    '  // marked wrong even though it is correct: a product gap, not a data error.',
  ],
};

const VOICELESS = new Set(['k', 'p', 't', 's', 'x']);

// Charset enforced on anything that actually ships in VERB_DATA. Matches
// src/data/verbData.test.ts's mojibake guard exactly (a-zA-ZåäöÅÄÖ, space,
// hyphen) — deliberately NOT the looser "a-zåäöé" the issue text mentions,
// because the shipped table must satisfy the existing pinned test too, and
// none of the promoted verbs need "é".
const SHIP_CHARSET = /^[a-zA-ZåäöÅÄÖ -]*$/;

// Looser charset used only for the full-CSV audit report: printable ASCII
// plus Swedish letters, still catching mojibake / stray characters without
// flagging every legitimate "(el. taga)" / "sa/sade" variant annotation as
// unreadable garbage (those get their own, more specific complaint).
const AUDIT_CHARSET = /^[\x20-\x7eåäöÅÄÖ]*$/;

// ---------------------------------------------------------------------------

function stem(inf) {
  return inf.endsWith('a') && inf.length > 1 ? inf.slice(0, -1) : inf;
}

// Particle/reflexive verbs ("te sig", "tycka om") carry a trailing particle
// on every form. Strip it before applying the mechanical grupp formulas
// (which only know about the conjugated verb itself), and reattach output
// separately where needed.
function splitParticle(inf) {
  const spaceIdx = inf.indexOf(' ');
  if (spaceIdx === -1) return { base: inf, particle: null };
  return { base: inf.slice(0, spaceIdx), particle: inf.slice(spaceIdx) }; // particle keeps its leading space
}

function stripParticle(form, particle) {
  if (particle && form.endsWith(particle)) return form.slice(0, -particle.length);
  return form;
}

function normalizeInfinitive(raw) {
  return raw.replace(/\s*\([^)]*\)\s*/g, '').trim();
}

function firstAlternative(raw) {
  return raw.split('/')[0].trim();
}

// Classifies a row into '1' | '2a' | '2b' | '3' | '4' | 'deponens'.
// Returns '4' for anything that doesn't mechanically fit a regular pattern
// -- per project convention, grupp 4 is also the bucket for "needs
// individual verification", never derived.
function classify(inf, pres, pret, sup) {
  if (/s$/.test(inf) && /s$/.test(pres) && /s$/.test(pret)) return 'deponens';

  if (/ar$/.test(pres) && /ade$/.test(pret) && /at$/.test(sup)) return '1';

  // Exact match (not a suffix heuristic): short vowel-final stems like
  // "bo"/"ro"/"te" already end in a vowel that can itself look like "-er"
  // (e.g. "te" -> "ter"), so a regex suffix check on presens alone is
  // unreliable. Require the whole word to match infinitive+r/+dde/+tt.
  if (pres === inf + 'r' && pret === inf + 'dde' && sup === inf + 'tt') return '3';

  const s = stem(inf);
  // r-final stems contract the presens ending (höra -> hör, not hörer;
  // bära -> bär, not bärer). This is a real, systematic Swedish pattern,
  // not a per-verb guess.
  const presOk = s.endsWith('r') ? pres === s : pres === s + 'er';
  if (presOk && /(de|te)$/.test(pret) && pret.startsWith(s.slice(0, -1))) {
    if (/te$/.test(pret)) return '2b';
    return '2a';
  }

  return '4';
}

// Form-class contradictions per the issue's rules. Returns a list of
// human-readable problem descriptions; empty means no contradiction found.
function findContradictions(inf, pres, pret, sup) {
  const issues = [];

  // The most common data error: 2a/2b voicing mismatch.
  if (/er$/.test(pres) && /(de|te)$/.test(pret) && !/dde$/.test(pret)) {
    const s = pres.slice(0, -2);
    const last = s.slice(-1);
    const voiceless = VOICELESS.has(last);
    if (voiceless && /de$/.test(pret) && !/te$/.test(pret)) {
      issues.push(`grupp 2b (voiceless stem '${s}') should take -te preteritum, found '${pret}'`);
    }
    if (!voiceless && /te$/.test(pret) && !/de$/.test(pret)) {
      issues.push(`grupp 2a (voiced stem '${s}') should take -de preteritum, found '${pret}'`);
    }
  }

  // grupp1 shape but internal parts disagree. Gated on inf.length >= 3 to
  // exclude the handful of very short irregular verbs (ha, ta, ...) whose
  // presens/preteritum coincidentally collide with the -ar/-ade shape
  // (e.g. "har"/"hade") while their supinum ("haft") is genuinely
  // irregular — a known, closed class, not a data error to flag.
  if (inf.length >= 3 && /ar$/.test(pres) && /ade$/.test(pret) && !/at$/.test(sup)) {
    issues.push(`grupp 1 preteritum '${pret}' (-ade) but supinum '${sup}' is not -at`);
  }
  if (inf.length >= 3 && /ar$/.test(pres) && !/ade$/.test(pret) && /at$/.test(sup)) {
    issues.push(`grupp 1 presens '${pres}' (-ar) but preteritum '${pret}' is not -ade`);
  }

  // weak-verb (2a/2b) preteritum without a matching -t supinum.
  if (/er$/.test(pres) && /(de|te)$/.test(pret) && !/dde$/.test(pret) && !/t$/.test(sup)) {
    issues.push(`preteritum '${pret}' implies a weak verb but supinum '${sup}' does not end in -t`);
  }

  // grupp1 pattern applied to a stem shape that's almost always grupp 2/4
  // in real Swedish (double/cluster consonant + a: vändA, liggA, väckA,
  // tänkA, glömmA, gällA, störrA). This is the exact bug class already
  // found and fixed for "vända", "söka" and "lägga" (issue #34/#37) — CSV
  // rows elsewhere with the same shape need the same human check, not a
  // silent grupp1 pass.
  if (pres === inf + 'r' && /(nd|gg|ck|nk|mm|ll|rr)a$/.test(inf)) {
    issues.push(`infinitive '${inf}' ends in a consonant cluster typical of grupp 2/4, but presens '${pres}' looks like grupp 1 — verify the pattern wasn't misapplied`);
  }

  return issues;
}

// fullInf carries the particle (e.g. "te sig"), baseInf/particle are the
// split form used for mechanical derivation. Reflexive "sig" is deliberately
// excluded from mechanical reattachment: the imperativ of a reflexive verb
// swaps "sig" -> "dig" (cf. "skynda dig"), which is not safe to auto-apply
// without a curated, per-verb check.
function deriveImperativ(fullInf, baseInf, particle, grupp, csvImperativ) {
  if (csvImperativ) return { value: csvImperativ, source: 'csv' };
  if (IRREGULAR_IMPERATIV[fullInf] !== undefined) return { value: IRREGULAR_IMPERATIV[fullInf], source: 'curated' };
  if (particle === ' sig') return { value: null, source: 'none' };

  let mechanical = null;
  if (grupp === '1' || grupp === '3') {
    mechanical = baseInf;
  } else if (grupp === '2a' || grupp === '2b') {
    const s = stem(baseInf);
    mechanical = s !== baseInf ? s : null;
  }
  if (!mechanical) return { value: null, source: 'none' }; // grupp 4 / deponens: cannot derive
  return { value: particle ? mechanical + particle : mechanical, source: 'mechanical' };
}

function badChars(value, charset) {
  return value !== '' && !charset.test(value);
}

// ---------------------------------------------------------------------------

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0];
  const rows = lines.slice(1).map((line, i) => {
    const cols = line.split(',');
    return {
      csvLine: i + 2,
      cefr: cols[0] ?? '',
      grammar: cols[1] ?? '',
      infinitive: cols[2] ?? '',
      imperativ: cols[3] ?? '',
      presens: cols[4] ?? '',
      preteritum: cols[5] ?? '',
      supinum: cols[6] ?? '',
    };
  });
  return { header, rows };
}

function validateRow(row, { shipCharset }) {
  const failures = [];
  const { particle } = splitParticle(row.infinitive);
  const baseInf = stripParticle(row.infinitive, particle);
  const basePres = stripParticle(row.presens, particle);
  const basePret = stripParticle(row.preteritum, particle);
  const baseSup = stripParticle(row.supinum, particle);
  const grupp = classify(baseInf, basePres, basePret, baseSup);
  const contradictions = findContradictions(baseInf, basePres, basePret, baseSup);
  failures.push(...contradictions);

  const charset = shipCharset ? SHIP_CHARSET : AUDIT_CHARSET;
  for (const [field, value] of Object.entries({
    infinitive: row.infinitive,
    presens: row.presens,
    preteritum: row.preteritum,
    supinum: row.supinum,
    imperativ: row.imperativ,
  })) {
    if (badChars(value, charset)) {
      failures.push(`${field} '${value}' contains a character outside the allowed alphabet`);
    }
  }

  const { value: imperativ, source } = deriveImperativ(row.infinitive, baseInf, particle, grupp, row.imperativ);
  const isModal = MODAL_INFINITIVES.has(row.infinitive);
  if (!imperativ && !isModal) {
    failures.push(`empty imperativ on non-modal verb (grupp ${grupp}, no mechanical or curated form available)`);
  }

  for (const field of ['presens', 'preteritum', 'supinum']) {
    if (!row[field]) failures.push(`empty ${field}`);
  }

  return { grupp, imperativ: imperativ ?? '', imperativSource: isModal && !imperativ ? 'modal' : source, failures };
}

// ---------------------------------------------------------------------------

function main() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const { rows } = parseCsv(csvText);

  const byInfinitive = new Map();
  for (const row of rows) {
    const norm = normalizeInfinitive(row.infinitive);
    if (!byInfinitive.has(norm)) byInfinitive.set(norm, row);
  }

  // --- Promoted rows: validate the currently-shipped 50, never grown/reordered.
  const promotedResults = [];
  const promotedFailures = [];
  for (const infinitive of PROMOTED_INFINITIVES) {
    const csvRow = byInfinitive.get(infinitive);
    if (!csvRow) {
      promotedFailures.push(`${infinitive}: not found in CSV`);
      continue;
    }
    const resolved = {
      cefr: csvRow.cefr,
      infinitive,
      imperativ: csvRow.imperativ,
      presens: firstAlternative(csvRow.presens),
      preteritum: firstAlternative(csvRow.preteritum),
      supinum: firstAlternative(csvRow.supinum),
    };
    const result = validateRow(resolved, { shipCharset: true });
    if (result.failures.length > 0) {
      promotedFailures.push(`${infinitive}: ${result.failures.join('; ')}`);
    }
    promotedResults.push({ ...resolved, grupp: result.grupp, imperativ: result.imperativ });
  }

  if (promotedFailures.length > 0) {
    console.error('Promoted rows failed validation — refusing to emit verbData.ts:');
    for (const f of promotedFailures) console.error('  ' + f);
    process.exitCode = 1;
    if (!AUDIT_ALL) return;
  }

  // --- Full-CSV audit (report only, never promoted here — see growth-cap note).
  const auditRows = [];
  if (AUDIT_ALL) {
    for (const row of rows) {
      const norm = normalizeInfinitive(row.infinitive);
      const promoted = PROMOTED_INFINITIVES.includes(norm);
      const resolved = {
        cefr: row.cefr,
        infinitive: row.infinitive,
        imperativ: row.imperativ,
        presens: firstAlternative(row.presens),
        preteritum: firstAlternative(row.preteritum),
        supinum: firstAlternative(row.supinum),
      };
      const result = validateRow(resolved, { shipCharset: false });
      auditRows.push({
        line: row.csvLine,
        cefr: row.cefr,
        infinitive: row.infinitive,
        grupp: result.grupp,
        promoted,
        status: result.failures.length === 0 ? 'pass' : 'fail',
        issues: result.failures.join(' | '),
      });
    }
  }

  if (CHECK_ONLY) {
    console.log(`Promoted rows: ${promotedResults.length}/${PROMOTED_INFINITIVES.length} validated, ${promotedFailures.length} failures.`);
    if (AUDIT_ALL) {
      const failing = auditRows.filter((r) => r.status === 'fail');
      console.log(`Full CSV audit: ${auditRows.length} rows, ${failing.length} failing validation.`);
    }
    return;
  }

  // --- Emit verbData.ts (only if promoted set is clean).
  if (promotedFailures.length === 0) {
    writeVerbData(promotedResults);
    console.log(`Wrote ${OUT_PATH} (${promotedResults.length} rows, 0 validator failures).`);
  }

  // --- Emit human-review file.
  if (AUDIT_ALL) {
    writeReview(auditRows);
    const failing = auditRows.filter((r) => r.status === 'fail');
    console.log(`Wrote ${REVIEW_PATH} (${auditRows.length} rows audited, ${failing.length} failing validation, none promoted from this run).`);
  }
}

const HEADER = `// Hardcoded Swedish verb conjugation data
// This data is extracted from the CSV to improve loading performance

// Conjugation classes as taught in Swedish grammar:
//   '1'  -ar                     tala/talar/talade/talat
//   '2a' -er, voiced stem        ringa/ringer/ringde/ringt
//   '2b' -er, voiceless stem     köpa/köper/köpte/köpt
//   '3'  short vowel-final stem  bo/bor/bodde/bott
//   '4'  starka och oregelbundna verb. This bucket deliberately covers BOTH
//        true strong verbs with vowel gradation (dricka/drack/druckit) AND
//        irregular verbs and auxiliaries that fit no other class
//        (vara, ha, kunna, vilja, veta, göra, säga, anse, lägga). Swedish
//        school grammar names this class "grupp 4 - starka och oregelbundna
//        verb", so the merge matches what a learner is taught. Consumers must
//        not assume every '4' row shows vowel gradation.
export type Grupp = '1' | '2a' | '2b' | '3' | '4';

export interface VerbData {
  cefr: string;
  infinitive: string;
  imperativ: string;
  presens: string;
  preteritum: string;
  supinum: string;
  // Conjugation class. Omitted (undefined) means the group could not be
  // human-verified against the stored forms and needs review — never guess.
  grupp?: Grupp;
}

export const VERB_DATA: VerbData[] = [
`;

function formatRow(row) {
  return `  { cefr: "${row.cefr}", infinitive: "${row.infinitive}", imperativ: "${row.imperativ}", presens: "${row.presens}", preteritum: "${row.preteritum}", supinum: "${row.supinum}", grupp: "${row.grupp}" },`;
}

function writeVerbData(rows) {
  const lines = [];
  for (const row of rows) {
    const comment = ROW_COMMENTS[row.infinitive];
    if (comment) lines.push(...comment);
    lines.push(formatRow(row));
  }
  const content = HEADER + lines.join('\n') + '\n];\n';
  fs.writeFileSync(OUT_PATH, content, 'utf-8');
}

function csvField(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeReview(rows) {
  const header = ['line', 'cefr', 'infinitive', 'grupp', 'promoted', 'status', 'issues'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.line, r.cefr, csvField(r.infinitive), r.grupp, r.promoted, r.status, csvField(r.issues)].join(','),
    );
  }
  fs.writeFileSync(REVIEW_PATH, lines.join('\n') + '\n', 'utf-8');
}

main();
