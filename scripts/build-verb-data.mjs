// Validating promotion pipeline for VERB_DATA (issue #41).
//
// Two data sources exist and have drifted:
//   public/data/swedish_verbs.csv  — ~1537 rows, source of record, ~35% error rate
//   src/data/verbData.ts           — the small hand-curated table that ships
//
// This script does three things, all deterministic and pure functions of
// the files on disk (no clock, no random, no network):
//
//   1. Classifies every CSV row into grupp 1 / 2a / 2b / 3 / 4 / deponens
//      using morphological pattern matching, and validates it (charset,
//      form-class self-consistency, empty imperativ on a non-modal verb).
//      Every row's verdict is written to scripts/verb-data-review.csv —
//      this is a human-review artifact, never consumed at runtime.
//   2. Re-runs the same validator against the CURRENTLY SHIPPED rows in
//      src/data/verbData.ts (using their own stored forms, not the CSV) and
//      fails the build (non-zero exit) if any shipped row does not pass.
//      This is what "the shipped table has zero validator failures" means
//      in practice: an enforced invariant, not an aspiration.
//   3. Classifies and validates a candidate promotion list the same way,
//      then writes only the PASSING candidates as ready-to-paste row lines
//      to docs/verb-data/proposed-rows.txt, and the REJECTED candidates to
//      the same file as commented-out lines with their reasons.
//
// This script NEVER writes src/data/verbData.ts, in any mode, for any
// input. Per docs/product/2026-08-08-verb-source-of-truth-decision.md R1
// ("Applies to build scripts too: no codegen writes verbData.ts") and
// section 4b (which supersedes ticket #41's original "emits verbData.ts in
// exact current format" acceptance clause), the shipped table has exactly
// one writer: a human, editing it by hand in a reviewed PR. This script's
// job stops at producing a validated, human-reviewable proposal. Per R3,
// promotion is manual and batched (at most 50 rows per PR); per R4, no PR
// that extends VERB_DATA merges before issue #8 (stable SRS ids +
// migration) is resolved — that gate is enforced on the board today and
// will become CI-enforced per R4/R5 once #8 closes.
//
// `readFileSync(VERB_DATA_PATH)` / `parseVerbDataTs()` below are still
// used — for the shipped-row validation gate (step 2) and to know which
// infinitives are already shipped (so a promotion candidate already present
// is skipped, never duplicated) — but the parsed result is read-only. There
// is no reconstruction step and nothing is ever written back to that path.
//
// Classifier design note (read before adding to the promotion list): several
// real Swedish spelling-simplification rules apply at the stem/suffix
// boundary and are NOT modelled here on purpose:
//   - stem ending "-nd" + preteritum "-de" simplifies ("vänd" -> "vände",
//     not "vändde"); stem "-nd" + supinum "-t" drops the d ("vänd" -> "vänt")
//   - stem ending "-d" + supinum "-t" assimilates to "-tt" ("betyd" -> "betytt")
//   - word-final double consonants after some stems simplify in the
//     imperativ ("glömma" -> "glöm", not "glömm") while others don't
//     ("ställa" -> "ställ", keeps the double l)
// A previous attempt at this pipeline (PR #165, closed) mechanically
// derived forms with a formula that got these wrong and shipped fabricated
// Swedish. This script does the opposite: it never derives a form. It only
// classifies and cross-checks forms that are ALREADY present in the data,
// and any row whose regular forms don't line up with one of the four
// mechanical patterns below — including every case above — falls through
// to the residual grupp 4 bucket ("starka och oregelbundna verb", the same
// definition as the `Grupp` doc comment in src/data/verbData.ts), with
// status 'needs-check' — never a guessed pass.
// 'needs-check' is not a validator failure; CLAUDE.md requires grupp 4
// verbs to be verified individually against a reference, never derived, so
// a human confirming the grupp by hand (as all shipped grupp-4 rows already
// are) is the correct and expected path, not a gap in the script.
// Because grupp 4 here means "matched nothing mechanical", it is evidence
// of absence, not evidence of a wrong grupp: a residual '4' never
// contradicts a row's own declared grupp (see classifyAndValidate), or
// every shipped row that relies on an unmodelled spelling simplification
// ("vända" -> "vände", "betyda" -> "betytt") would fail the shipped-table
// gate for being correct Swedish.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CSV_PATH = join(ROOT, 'public/data/swedish_verbs.csv');
const VERB_DATA_PATH = join(ROOT, 'src/data/verbData.ts');
const REVIEW_PATH = join(ROOT, 'scripts/verb-data-review.csv');
const PROMOTIONS_LIST_PATH = join(ROOT, 'scripts/verb-data-promotions.txt');
const PROPOSED_ROWS_PATH = join(ROOT, 'docs/verb-data/proposed-rows.txt');

// Candidate infinitives to classify/validate for promotion this run, beyond
// what is already shipped. Configurable two ways (checked in this order),
// so the promotion path has a real input surface instead of a hardcoded
// constant nothing can populate:
//   --promote=inf1,inf2   comma-separated infinitives on the command line
//   scripts/verb-data-promotions.txt   one infinitive per line, blank lines
//                                       and lines starting with "#" ignored
// Neither present -> empty list (today's default: this ticket builds the
// pipeline, growing VERB_DATA past 50 is the next one). Passing candidates
// are written to docs/verb-data/proposed-rows.txt for a human to paste into
// verbData.ts by hand in a reviewed PR (R3); nothing here ever writes
// verbData.ts itself.
function resolvePromotions() {
  const cliArg = process.argv.find((a) => a.startsWith('--promote='));
  if (cliArg) {
    return cliArg
      .slice('--promote='.length)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (existsSync(PROMOTIONS_LIST_PATH)) {
    return readFileSync(PROMOTIONS_LIST_PATH, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
  }
  return [];
}

// ---------------------------------------------------------------------
// Charset
// ---------------------------------------------------------------------
// Ticket #41: reject a verb-form field containing anything outside
// lowercase a-zåäöé. Space is additionally allowed — the app already
// ships one two-word entry ("te sig") and the particle-verb rule
// (CLAUDE.md) requires the particle to stay in the stored infinitive, so a
// hard "no space" rule would reject data the product already treats as
// correct. No other punctuation is allowed: hyphen, slash, parentheses and
// period are exactly how the CSV encodes dirty rows today — an annotation
// stuffed into the field ("ta (el. taga)", "jämföra (förk. jfr)") or an
// alternate form crammed into one field with a slash ("sa/sade",
// "betalat/betalt") instead of the dedicated `alternates` mechanism
// verbData.ts already has. Both classes are routed to the review file,
// never silently accepted.
const CHARSET = /^[a-zåäöé ]*$/;
const FORM_FIELDS = ['infinitive', 'imperativ', 'presens', 'preteritum', 'supinum'];

function charsetFailures(row) {
  const failures = [];
  for (const field of FORM_FIELDS) {
    const value = row[field] ?? '';
    if (value !== '' && !CHARSET.test(value)) {
      failures.push(`charset: ${field}="${value}"`);
    }
  }
  return failures;
}

// ---------------------------------------------------------------------
// Modal / auxiliary verbs — grammatically have no imperativ (CLAUDE.md).
// Curated, closed list; anything else with an empty imperativ is a data
// bug, not a deliberate gap.
// ---------------------------------------------------------------------
const MODAL_VERBS = new Set(['kunna', 'få', 'vilja', 'skola', 'måste', 'böra', 'lär']);

// f/k/p/s/t/x are the voiceless consonants that can end a grupp-2 stem;
// CLAUDE.md's k/p/t/s/x list omitted "f" (e.g. a stem like "skif-" would
// have been mis-flagged as a false 2a/2b contradiction — real Swedish
// correctly rejected as a data error, the failure class that sank #165).
// No CSV row exercises this today (confirmed: zero contradictions fire
// across all 1538 rows either way), so this is a latent-defect fix, not an
// observed regression.
const VOICELESS_FINAL = new Set(['f', 'k', 'p', 't', 's', 'x']);

// ---------------------------------------------------------------------
// Particle stripping — classify the verb, not the particle (CLAUDE.md:
// "Particle verbs conjugate the verb only; the particle stays put.").
// ---------------------------------------------------------------------
function splitParticle(inf, pres, pret, sup) {
  const sp = inf.indexOf(' ');
  if (sp === -1) return { inf, pres, pret, sup, particleConfirmed: true };
  const particle = inf.slice(sp); // e.g. " sig"
  if (pres.endsWith(particle) && pret.endsWith(particle) && sup.endsWith(particle)) {
    return {
      inf: inf.slice(0, sp),
      pres: pres.slice(0, pres.length - particle.length),
      pret: pret.slice(0, pret.length - particle.length),
      sup: sup.slice(0, sup.length - particle.length),
      particleConfirmed: true,
    };
  }
  // Couldn't confirm a shared particle across all forms — classify as-is.
  // This will almost certainly fail to match any mechanical pattern below,
  // and `particleConfirmed: false` keeps it out of the residual grupp 4
  // bucket as well: a row whose particle appears in the infinitive but not
  // in every conjugated form is a structural data defect, not evidence of a
  // strong verb. It gets an empty grupp cell and 'needs-check'.
  return { inf, pres, pret, sup, particleConfirmed: false };
}

// ---------------------------------------------------------------------
// Deponens (CLAUDE.md: "hoppas / hoppas / hoppades / hoppats" — the -s
// belongs to the verb in every form; these are not passives).
//
// Ending in "s" is necessary but nowhere near sufficient: four unrelated
// s-final stems satisfy it. A real deponens is a grupp 1/2 verb wearing an
// -s, so its stripped forms must still agree on ONE stem:
//   grupp 1   hoppas  / hoppas / hoppades / hoppats   (stem "hopp")
//   grupp 2a  trivas  / trivs  / trivdes  / trivts    (stem "triv")
//   grupp 2b  tyckas  / tycks  / tycktes  / tyckts    (stem "tyck")
// Anything else — including genuinely irregular deponens verbs (finnas /
// finns / fanns / funnits) and the stem-boundary simplifications this
// script deliberately doesn't model (skämmas / skäms, not "skämms") —
// returns false and goes to a human, never to 'pass'.
// ---------------------------------------------------------------------
function isCoherentDeponens({ inf, pres, pret, sup }) {
  const infStem = inf.slice(0, -1); // "hoppas" -> "hoppa"
  if (infStem.length < 2 || !infStem.endsWith('a')) return false;
  const stem = infStem.slice(0, -1); // -> "hopp"
  const grupp1 = pres === stem + 'as' && pret === stem + 'ades' && sup === stem + 'ats';
  const grupp2a = pres === stem + 's' && pret === stem + 'des' && sup === stem + 'ts';
  const grupp2b = pres === stem + 's' && pret === stem + 'tes' && sup === stem + 'ts';
  return grupp1 || grupp2a || grupp2b;
}

// ---------------------------------------------------------------------
// Classifier. Returns { grupp, contradiction, note } where grupp is one of
// '1' | '2a' | '2b' | '3' | '4' | 'deponens' | null. '4' is the residual
// strong/irregular bucket: the forms are structurally sound but match no
// mechanical pattern, so the row is reported as grupp 4 and still gets
// status 'needs-check' — a human verifies it, the script never claims it.
// null means the grupp is not reportable at all (a cross-field
// contradiction, or an unconfirmed particle).
// `contradiction` is a human-readable reason string, present only when two
// fields disagree about the SAME row (a real data bug), never merely
// because a form doesn't match a regular pattern. `note` explains a
// needs-check verdict without being a validator failure.
// ---------------------------------------------------------------------
const DEPONENS_NOTE =
  'deponens-shaped (infinitive and all three forms end in "s") but the s-forms do not agree on one stem the way a regular grupp 1/2 deponens does; grupp needs human verification';

function classifyCore({ inf, pres, pret, sup }) {
  if (
    inf.length > 1 &&
    inf.endsWith('s') &&
    pres.endsWith('s') &&
    pret.endsWith('s') &&
    sup.endsWith('s')
  ) {
    return isCoherentDeponens({ inf, pres, pret, sup })
      ? { grupp: 'deponens', contradiction: null, note: null }
      : { grupp: '4', contradiction: null, note: DEPONENS_NOTE };
  }

  if (inf.endsWith('a')) {
    const stem = inf.slice(0, -1);
    const presSignal = pres === stem + 'ar' ? '1' : pres === stem + 'er' ? '2' : null;
    const pretSupSignal =
      pret === stem + 'ade' && sup === stem + 'at'
        ? '1'
        : pret === stem + 'de' && sup === stem + 't'
          ? '2a'
          : pret === stem + 'te' && sup === stem + 't'
            ? '2b'
            : null;

    if (presSignal && pretSupSignal) {
      const presFamily = presSignal === '1' ? '1' : '2';
      const pretSupFamily = pretSupSignal === '1' ? '1' : '2';
      if (presFamily !== pretSupFamily) {
        return {
          grupp: null,
          contradiction: `presens "${pres}" implies grupp ${presSignal === '1' ? '1' : '2'} but preteritum/supinum imply grupp ${pretSupSignal}`,
          note: null,
        };
      }
      if (pretSupSignal === '2a' || pretSupSignal === '2b') {
        const finalConsonant = stem.slice(-1);
        const isVoiceless = VOICELESS_FINAL.has(finalConsonant);
        if (pretSupSignal === '2a' && isVoiceless) {
          return {
            grupp: null,
            contradiction: `stem "${stem}" ends in voiceless "${finalConsonant}" (k/p/t/s/x) but preteritum "${pret}" is the grupp 2a (voiced) -de pattern; expected grupp 2b -te`,
            note: null,
          };
        }
        if (pretSupSignal === '2b' && !isVoiceless) {
          return {
            grupp: null,
            contradiction: `stem "${stem}" ends in voiced "${finalConsonant}" but preteritum "${pret}" is the grupp 2b (voiceless) -te pattern; expected grupp 2a -de`,
            note: null,
          };
        }
      }
      return { grupp: pretSupSignal, contradiction: null, note: null };
    }
    // Neither a full regular match nor an unambiguous cross-field
    // disagreement — either a genuine strong/irregular verb (vara, komma,
    // sätta, ...) or a stem-boundary spelling simplification this script
    // deliberately does not model (see header note). Both belong in the
    // residual grupp 4 bucket, reported but never claimed: status stays
    // 'needs-check' so a human verifies the class against a reference.
    return { grupp: '4', contradiction: null, note: null };
  }

  // Infinitive doesn't end in "a": grupp 3 candidate (bo/tro/ro-style short
  // stem) if presens/preteritum/supinum all agree with the grupp 3 pattern;
  // otherwise an irregular verb whose infinitive happens to be short
  // (se, ge, gå, stå, bli, ...) — residual grupp 4, needs-check.
  if (pres === inf + 'r' && pret === inf + 'dde' && sup === inf + 'tt') {
    return { grupp: '3', contradiction: null, note: null };
  }
  return { grupp: '4', contradiction: null, note: null };
}

function classifyAndValidate(infinitive, imperativ, presens, preteritum, supinum, declaredGrupp) {
  const reasons = [];
  const row = { infinitive, imperativ, presens, preteritum, supinum };
  reasons.push(...charsetFailures(row));

  const baseInf = infinitive.split(' ')[0] ?? infinitive;
  const isModal = MODAL_VERBS.has(infinitive) || MODAL_VERBS.has(baseInf);
  const emptyImperativ = (imperativ ?? '').trim() === '';

  const core = splitParticle(infinitive, presens, preteritum, supinum);
  const classified = classifyCore(core);
  const { contradiction, note } = classified;
  // An unconfirmed particle means the forms were never reduced to one verb,
  // so nothing about them is reportable — not even the residual grupp 4.
  const grupp = core.particleConfirmed ? classified.grupp : null;
  if (contradiction) reasons.push(`contradiction: ${contradiction}`);

  // Residual '4' means "matched no mechanical pattern", which is not
  // evidence that a declared grupp is wrong — every shipped row relying on
  // an unmodelled spelling simplification lands there. Only a positive
  // grupp 1/2a/2b/3 match can contradict a declared grupp.
  if (
    declaredGrupp !== undefined &&
    grupp !== null &&
    grupp !== 'deponens' &&
    grupp !== '4' &&
    declaredGrupp !== grupp
  ) {
    reasons.push(
      `contradiction: row declares grupp "${declaredGrupp}" but forms match grupp "${grupp}"`,
    );
  }

  const mechanicallyConfirmed = grupp !== null && grupp !== '4';

  // Reflexive "X sig" lemmas (docs/learning/2026-08-08-verb-data-conventions.md
  // C3): the command form swaps the pronoun to "dig" — never the bare
  // infinitive's "sig" — so even a mechanically-confirmed reflexive row's
  // imperativ cannot be derived by this classifier; a human decides it
  // per verb, same as the modal/deponens carve-out below.
  const particle =
    core.particleConfirmed && core.inf.length < infinitive.length
      ? infinitive.slice(core.inf.length)
      : '';
  const isReflexive = particle === ' sig';

  let status;
  if (reasons.length > 0) {
    status = 'fail';
  } else if (!mechanicallyConfirmed) {
    // Issue #299: this branch now runs BEFORE the empty-imperativ check
    // (previously last). Under the old order, every grupp-4/deponens/
    // particle-unconfirmed row with an empty imperativ was reported as
    // 'fail' with reason "empty imperativ on non-modal verb", even though
    // its imperativ was never automatically derivable in the first place
    // (the row still needs a human to confirm its grupp regardless of
    // imperativ). That buried the real fail signal — genuine data bugs on
    // mechanically-regular rows — under ~1500 false positives. Now an
    // unconfirmed/irregular/deponens row always reports 'needs-check',
    // whether or not its imperativ happens to be empty.
    status = 'needs-check';
    if (note) reasons.push(note);
  } else if (emptyImperativ && (grupp === 'deponens' || isReflexive) && !isModal) {
    // Deponens and reflexive imperativ forms are per-verb human judgment
    // calls (deponens: no blanket "keep the -s" rule is documented for
    // imperativ specifically; reflexive: sig -> dig swap), never mechanically
    // derived here. An empty cell on these rows is the same deliberate,
    // explicitly-marked gap as a modal's, not a data bug — same convention
    // as verbData.ts's noNaturalImperativ, made explicit via the grupp/
    // reflexive classification itself rather than a curated name list.
    status = 'needs-check';
    reasons.push(
      grupp === 'deponens'
        ? 'deponens: imperativ is a per-verb judgment call, not mechanically derived; empty is not a failure'
        : 'reflexive ("X sig"): imperativ needs sig -> dig and is a per-verb judgment call, not mechanically derived; empty is not a failure',
    );
  } else if (emptyImperativ && !isModal) {
    status = 'fail';
    reasons.push('empty imperativ on non-modal verb');
  } else {
    status = 'pass';
  }

  return { grupp: grupp ?? '', status, reasons };
}

// ---------------------------------------------------------------------
// CSV parsing (RFC 4180-lite: handles quoted fields; the data has none
// today, but a bare comma-split would silently mis-column the day one
// appears). Ported from the existing scripts/validate-verb-forms.mjs.
// ---------------------------------------------------------------------
function splitCsvLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const headerLine = lines.findIndex((l) => l.trim().length > 0);
  if (headerLine === -1) return [];
  const header = splitCsvLine(lines[headerLine]).map((h) => h.trim());
  const rows = [];
  for (let i = headerLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const fields = splitCsvLine(line);
    const row = { line: i + 1 };
    header.forEach((key, idx) => {
      row[key] = fields[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------
// verbData.ts parsing — regex-based, mirrors scripts/validate-verb-forms.mjs.
// Read-only: captures parsed field values (for the shipped-row validation
// gate) and per-row comment text (for the noNaturalImperativ / NEEDS HUMAN
// REVIEW escape hatches). Nothing derived from this parse is ever written
// back to VERB_DATA_PATH.
// ---------------------------------------------------------------------
const START_MARKER = 'export const VERB_DATA: VerbData[] = [';
const FIELD_RE = /(cefr|infinitive|imperativ|presens|preteritum|supinum|grupp)\s*:\s*"([^"]*)"/g;

// The file on disk may use CRLF (Windows checkout) or LF line endings.
// Detecting it (rather than assuming '\n') keeps line splitting/joining
// correct for both checkout styles during parsing.
function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function parseVerbDataTs(text) {
  const eol = detectEol(text);
  const startIdx = text.indexOf(START_MARKER);
  if (startIdx === -1) {
    throw new Error(`could not find "${START_MARKER}" in ${VERB_DATA_PATH}`);
  }
  const headerEnd = startIdx + START_MARKER.length;
  const header = text.slice(0, headerEnd) + eol;

  const rest = text.slice(headerEnd);
  const lines = rest.split(eol);
  const closeIdx = lines.findIndex((l) => l.trim().startsWith(']'));
  if (closeIdx === -1) {
    throw new Error('could not find closing "];" of VERB_DATA array');
  }

  // lines[0] is empty (the newline right after the marker); drop it, the
  // header above already ends with the detected EOL.
  const bodyLines = lines.slice(1, closeIdx);
  const footer = lines.slice(closeIdx).join(eol);

  const blocks = [];
  let pending = [];
  for (const line of bodyLines) {
    pending.push(line);
    if (/infinitive\s*:\s*"/.test(line)) {
      const fields = {};
      for (const m of line.matchAll(FIELD_RE)) fields[m[1]] = m[2];
      const noNaturalImperativ = /noNaturalImperativ\s*:\s*true/.test(line);
      const hasGrupp = /\bgrupp\s*:\s*"/.test(line);
      blocks.push({ lines: pending, fields, noNaturalImperativ, hasGrupp });
      pending = [];
    }
  }
  // Any trailing lines that never hit an `infinitive:` (shouldn't happen in
  // well-formed input) belong to the footer instead of being silently
  // dropped.
  const trailingFooter = pending.length > 0 ? pending.join(eol) + eol : '';

  return { header, blocks, footer: trailingFooter + footer, eol };
}

// `grupp` is optional: `src/data/verbData.ts`'s `Grupp` type has no
// 'deponens' member, so a deponens promotion candidate must be emitted
// WITHOUT a `grupp` field (see the deponens branch in main() below) —
// pasting `grupp: "deponens"` verbatim would break `npm run typecheck`.
// `comment` (optional) is appended as a trailing `//` comment, e.g. the
// NEEDS HUMAN REVIEW marker the shipped-table gate treats as an escape
// hatch for a missing `grupp`.
function formatNewRow({
  cefr,
  infinitive,
  imperativ,
  presens,
  preteritum,
  supinum,
  grupp,
  comment,
}) {
  const grouppField = grupp !== undefined ? `, grupp: "${grupp}"` : '';
  const commentSuffix = comment ? ` // ${comment}` : '';
  return `  { cefr: "${cefr}", infinitive: "${infinitive}", imperativ: "${imperativ}", presens: "${presens}", preteritum: "${preteritum}", supinum: "${supinum}"${grouppField} },${commentSuffix}`;
}

// ---------------------------------------------------------------------
// Required-file reads. A raw ENOENT stack is not actionable for whoever
// sees the CI job go red; name the path and point at the decision doc that
// governs where these files are allowed to live.
// ---------------------------------------------------------------------
function readRequiredFile(path, hint) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`missing ${path}${hint ? ' — ' + hint : ''}`);
      process.exit(1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
function main() {
  const checkOnly = process.argv.includes('--check');
  const promotions = resolvePromotions();

  // --- Step 1: classify + validate every CSV row, write the review file ---
  const csvText = readRequiredFile(
    CSV_PATH,
    'see docs/product/2026-08-08-verb-source-of-truth-decision.md R2 if the CSV has moved',
  );
  const csvRows = parseCsv(csvText);

  const reviewRows = csvRows.map((row) => {
    const infinitive = row.infinitive ?? '';
    const result = classifyAndValidate(
      infinitive,
      row.imperativ ?? '',
      row.presens ?? '',
      row.preteritum ?? '',
      row.supinum ?? '',
      undefined,
    );
    return {
      line: row.line,
      cefr: row['cefr levels'] ?? '',
      infinitive,
      grupp: result.grupp,
      status: result.status,
      reasons: result.reasons.join('; '),
    };
  });

  const csvCounts = { pass: 0, 'needs-check': 0, fail: 0 };
  for (const r of reviewRows) csvCounts[r.status]++;

  const reviewCsv = [
    'line,cefr,infinitive,grupp,status,reasons',
    ...reviewRows.map(
      (r) =>
        `${r.line},"${r.cefr}","${r.infinitive.replace(/"/g, '""')}",${r.grupp},${r.status},"${r.reasons.replace(/"/g, '""')}"`,
    ),
  ].join('\n');

  // --- Step 2: re-validate the currently shipped rows against their own
  // stored forms; this is the "zero validator failures" gate. Read-only:
  // parsed.blocks / parsed.header / parsed.footer are used for the gate
  // below and for existingInfinitives dedup in step 3, never written back. ---
  const verbDataText = readRequiredFile(VERB_DATA_PATH);
  const parsed = parseVerbDataTs(verbDataText);

  const shippedFailures = [];
  for (const block of parsed.blocks) {
    const f = block.fields;
    const commentBlock = block.lines.join('\n');
    const explainedEmpty =
      block.noNaturalImperativ ||
      MODAL_VERBS.has(f.infinitive) ||
      /modal verb/i.test(commentBlock) ||
      /NEEDS HUMAN CHECK/i.test(commentBlock);

    const result = classifyAndValidate(
      f.infinitive,
      f.imperativ ?? '',
      f.presens ?? '',
      f.preteritum ?? '',
      f.supinum ?? '',
      f.grupp,
    );

    // The missing-grupp gate runs BEFORE the explained-empty-imperativ
    // early-continue below, on purpose: a shipped row with
    // noNaturalImperativ: true (or a 'modal verb' / 'NEEDS HUMAN CHECK'
    // comment) must still declare a grupp or carry its own NEEDS HUMAN
    // REVIEW marker. Checking this first closes the hole where an
    // explained-empty row could skip the missing-grupp check entirely.
    if (!block.hasGrupp && !/NEEDS HUMAN REVIEW/i.test(commentBlock)) {
      shippedFailures.push({
        infinitive: f.infinitive,
        reasons: ['grupp omitted without a NEEDS HUMAN REVIEW comment'],
      });
      continue;
    }
    // classifyAndValidate already fails empty-imperativ-on-non-modal using
    // the CSV-only MODAL_VERBS heuristic; the shipped table additionally
    // carries noNaturalImperativ / review comments as first-class evidence,
    // so an empty imperativ backed by either is accepted here even though
    // classifyAndValidate alone flagged it.
    if (
      result.status === 'fail' &&
      result.reasons.length === 1 &&
      result.reasons[0] === 'empty imperativ on non-modal verb' &&
      explainedEmpty
    ) {
      continue;
    }
    if (result.status === 'fail') {
      shippedFailures.push({ infinitive: f.infinitive, reasons: result.reasons });
    }
  }

  if (shippedFailures.length > 0) {
    console.error(
      `FAIL: ${shippedFailures.length} shipped row(s) in verbData.ts do not pass validation:`,
    );
    for (const f of shippedFailures) {
      console.error(`  ${f.infinitive}: ${f.reasons.join('; ')}`);
    }
    process.exit(1);
  }

  // --- Step 3: classify/validate the requested promotion candidates (see
  // resolvePromotions above) and write the result to a human-review file.
  // This NEVER touches verbData.ts — a human pastes approved rows in by
  // hand in a reviewed PR (R3). Candidates already shipped are skipped
  // (not duplicated, not reported as a failure). ---
  const promotionFailures = [];
  const promotedRows = [];
  const existingInfinitives = new Set(parsed.blocks.map((b) => b.fields.infinitive));

  for (const candidate of promotions) {
    if (existingInfinitives.has(candidate)) continue;
    const csvRow = csvRows.find((r) => r.infinitive === candidate);
    if (!csvRow) {
      promotionFailures.push({ infinitive: candidate, reasons: ['not found in CSV'] });
      continue;
    }
    const result = classifyAndValidate(
      candidate,
      csvRow.imperativ ?? '',
      csvRow.presens ?? '',
      csvRow.preteritum ?? '',
      csvRow.supinum ?? '',
      undefined,
    );
    if (result.status !== 'pass') {
      promotionFailures.push({
        infinitive: candidate,
        reasons: result.reasons.length ? result.reasons : [`status: ${result.status}`],
      });
      continue;
    }
    const rowFields = {
      cefr: csvRow['cefr levels'] ?? '',
      infinitive: candidate,
      imperativ: csvRow.imperativ ?? '',
      presens: csvRow.presens ?? '',
      preteritum: csvRow.preteritum ?? '',
      supinum: csvRow.supinum ?? '',
    };
    // `Grupp` (src/data/verbData.ts) has no 'deponens' member. Emit a
    // deponens candidate WITHOUT a `grupp` field, plus a NEEDS HUMAN REVIEW
    // comment — the marker the shipped-table gate already treats as the
    // escape hatch for an omitted `grupp` — so the pasted row stays
    // gate-clean and typecheck-clean. The review CSV (step 1 above) still
    // reports 'deponens' in its grupp column; that's a report, not a paste
    // target, and the AC asks for the deponens bucket there.
    promotedRows.push(
      result.grupp === 'deponens'
        ? formatNewRow({
            ...rowFields,
            comment:
              "NEEDS HUMAN REVIEW: deponens verb — Grupp has no 'deponens' member; a human must pick the underlying conjugation grupp before pasting",
          })
        : formatNewRow({ ...rowFields, grupp: result.grupp }),
    );
  }

  if (!checkOnly) {
    writeFileSync(REVIEW_PATH, reviewCsv + '\n', 'utf8');

    mkdirSync(dirname(PROPOSED_ROWS_PATH), { recursive: true });
    const proposedLines = [
      '// Generated by scripts/build-verb-data.mjs from public/data/swedish_verbs.csv.',
      '// NOT consumed by the app and NOT auto-merged into src/data/verbData.ts.',
      '// Per docs/product/2026-08-08-verb-source-of-truth-decision.md R3, a human',
      '// pastes the PASSING lines below into VERB_DATA by hand in a reviewed PR,',
      '// at most 50 rows per PR, gated on issue #8 per R4. REJECTED lines are kept',
      '// commented out with their reasons for reference; do not paste those in.',
      '',
      ...promotedRows,
      ...promotionFailures.map((f) => `// REJECTED "${f.infinitive}": ${f.reasons.join('; ')}`),
    ];
    writeFileSync(PROPOSED_ROWS_PATH, proposedLines.join('\n') + '\n', 'utf8');
  }

  console.log(
    `CSV audit: ${csvRows.length} rows — ${csvCounts.pass} pass, ${csvCounts['needs-check']} needs-check, ${csvCounts.fail} fail.` +
      ` Review file: ${REVIEW_PATH}${checkOnly ? ' (not written, --check)' : ''}`,
  );
  console.log(
    `Shipped table: ${parsed.blocks.length} rows, 0 validator failures. Promotion candidates: ${promotions.length} requested, ${promotedRows.length} passed, ${promotionFailures.length} rejected.`,
  );
  if (promotionFailures.length > 0) {
    console.log('Rejected promotion candidates:');
    for (const f of promotionFailures) {
      console.log(`  ${f.infinitive}: ${f.reasons.join('; ')}`);
    }
  }
  console.log(
    checkOnly
      ? 'verbData.ts unchanged (--check mode; proposed-rows.txt not written).'
      : promotedRows.length > 0
        ? `verbData.ts unchanged. ${promotedRows.length} candidate row(s) written to ${PROPOSED_ROWS_PATH} for human review.`
        : 'verbData.ts unchanged. No promotion candidates passed this run.',
  );
}

main();
