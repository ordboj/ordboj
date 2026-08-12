// Verb-form validator (owner: swedish-linguist).
//
// Checks the conjugation form fields (infinitive, imperativ, presens,
// preteritum, supinum) of BOTH verb data sources for characters that cannot
// occur in a Swedish verb form:
//
//   docs/verb-data/candidates.csv  — promotion queue, not shipped (issue #21)
//   src/data/verbData.ts           — the single source of truth; ships to users
//
// verbData.ts is checked because it is what the app reads at runtime; a
// corrupt form there reaches a learner immediately. candidates.csv is
// checked too because a corrupt queue row becomes a corrupt learner-facing
// row one promotion later.
//
// This catches two defect classes seen in the real data:
//
//   1. Mojibake / foreign-script substitution — issue #45 (Turkish dotless
//      "ı" for "i", Vietnamese "ắ" for "å").
//   2. Casing corruption — "SVor", "SOV" (both fixed in #158). Uppercase is
//      never correct inside a stored verb form: the app renders these strings
//      as-is, and Swedish verbs are not capitalised. Allowing A-Z is what let
//      those two rows sit in the file undetected, so A-Z is NOT allowed here.
//
// Beyond the charset check, this script also enforces the structural rules
// from the #21 decision note (docs/product/2026-08-08-verb-source-of-truth-decision.md,
// R4/R5): no CSV under public/, no non-test src/ reference to either CSV
// filename, no duplicate infinitive inside VERB_DATA, and the VERB_DATA
// row-count pin. See checkNoPublicCsv, checkNoSrcCsvReferences and
// checkVerbDataInvariants below.
//
// Run:  node scripts/validate-verb-forms.mjs [file ...]
// With no arguments it checks both default files above, plus the
// structural checks, which always run regardless of arguments.
// Exits non-zero and prints every offending row/field if it finds anything
// outside the allowed set.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Lowercase Swedish letters plus é (loanwords such as "idé"), and the
// punctuation the data legitimately uses: space (particle and reflexive verbs,
// "te sig", "stiga upp"), hyphen (compounds), forward slash (attested
// alternate forms, "växt/vuxit"), parentheses and period (annotations,
// "ta (el. taga)"). Deliberately no A-Z — see the header note.
const ALLOWED = /^[a-zåäöé \/\-.()]*$/;

const FORM_FIELDS = ['infinitive', 'imperativ', 'presens', 'preteritum', 'supinum'];

const DEFAULT_FILES = ['docs/verb-data/candidates.csv', 'src/data/verbData.ts'];

// R4 (decision note section 4, hard gate on #8): VERB_DATA's row count is
// pinned so no PR can silently extend the table before issue #8 (stable
// SRS ids) resolves the index-based-id corruption risk. The decision note
// (written 2026-08-08) recorded 51 rows at drafting time, but PR #265 had
// already appended six rows to 56 by the time this check landed (#280) —
// the gate was convention-only until now and did not stop that merge. The
// pin below reflects the actual row count as of #280, not the stale 51
// figure, so it fails on any FURTHER growth rather than failing
// permanently on rows that already shipped.
// Remove this assertion (and VERB_DATA_ROW_COUNT_PIN) in the same PR that
// closes #8.
const VERB_DATA_ROW_COUNT_PIN = 56;

// Files that are allowed to reference a verb-data CSV filename by name:
// this script itself, and any test file (qa owns fixtures that legitimately
// read the CSV to check it, e.g. src/data/verbData.test.ts).
const CSV_FILENAMES = ['swedish_verbs.csv', 'candidates.csv'];

function isTestPath(path) {
  const segments = path.split(/[\\/]/);
  return /\.test\.(ts|tsx|js|jsx)$/.test(path) || segments.includes('test');
}

// Lists every regular file under dir, recursively. Returns [] if dir does
// not exist (public/data/ is expected to be gone after #280).
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    const full = join(dir, entry);
    if (statSync(full).isFile()) out.push(full.split('\\').join('/'));
  }
  return out;
}

// R5.1 — a *.csv reappearing under public/ would ship again in the bundle;
// public/data/swedish_verbs.csv moved to docs/verb-data/candidates.csv (#280)
// and must never come back.
function checkNoPublicCsv() {
  return listFiles('public')
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .map(
      (f) =>
        `${f}: a CSV file exists under public/ — verb data must not ship in the bundle (issue #21 R1/R2, #280)`,
    );
}

// R5.2 — no non-test file under src/ may reference either CSV filename;
// verbData.ts is the only source of truth the app may read (R1).
function checkNoSrcCsvReferences() {
  const violations = [];
  for (const file of listFiles('src')) {
    if (isTestPath(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const name of CSV_FILENAMES) {
      if (text.includes(name)) {
        violations.push(
          `${file}: references "${name}" — src/ (non-test) code must not read the verb-data CSV; verbData.ts is the only source of truth (issue #21 R1)`,
        );
      }
    }
  }
  return violations;
}

// R5.3 + R4 — duplicate infinitives inside VERB_DATA silently shadow each
// other at every find()-by-infinitive lookup in src/lib/verbs.ts, and the
// row-count pin blocks table growth until #8 closes.
function checkVerbDataInvariants(records) {
  const violations = [];
  const seenAt = new Map();
  for (const { line, infinitive } of records) {
    if (!infinitive) continue;
    if (seenAt.has(infinitive)) {
      violations.push(
        `src/data/verbData.ts:${line}: duplicate infinitive "${infinitive}" (first seen at line ${seenAt.get(infinitive)}) — every lookup in src/lib/verbs.ts is find() by infinitive`,
      );
    } else {
      seenAt.set(infinitive, line);
    }
  }
  if (records.length !== VERB_DATA_ROW_COUNT_PIN) {
    violations.push(
      `src/data/verbData.ts: VERB_DATA has ${records.length} row(s), pinned to exactly ${VERB_DATA_ROW_COUNT_PIN} until issue #8 (stable SRS ids) closes — no append/delete allowed before then`,
    );
  }
  return violations;
}

// Minimal RFC 4180 field splitter: honours double-quoted fields and escaped
// ("") quotes. The data has no quoted fields today, but splitting on a bare
// comma would silently mis-column the whole row the day one appears — and a
// mis-columned row is exactly the kind of corruption this script exists to
// catch, so it must not be the thing that blinds it.
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
  return { fields, unterminatedQuote: inQuotes };
}

// Returns { records, structural }. Line numbers are taken from the raw line
// index BEFORE blank lines are skipped, so they match what an editor shows.
function parseCsv(text, file) {
  const lines = text.split(/\r?\n/);
  const structural = [];
  const records = [];

  const headerLine = lines.findIndex((l) => l.trim().length > 0);
  if (headerLine === -1) {
    structural.push({ file, line: 1, message: 'file is empty' });
    return { records, structural };
  }
  const header = splitCsvLine(lines[headerLine]).fields.map((h) => h.trim());
  for (const field of FORM_FIELDS) {
    if (!header.includes(field)) {
      structural.push({
        file,
        line: headerLine + 1,
        message: `header is missing the "${field}" column (found: ${header.join(', ')})`,
      });
    }
  }

  for (let i = headerLine + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // 1-based, computed before any blank-line skip
    if (line.trim().length === 0) continue;

    const { fields, unterminatedQuote } = splitCsvLine(line);
    if (unterminatedQuote) {
      structural.push({ file, line: lineNumber, message: 'unterminated quoted field' });
      continue;
    }
    if (fields.length !== header.length) {
      structural.push({
        file,
        line: lineNumber,
        message: `expected ${header.length} fields, found ${fields.length}`,
      });
      continue;
    }

    const row = {};
    header.forEach((key, idx) => {
      row[key] = fields[idx];
    });
    records.push({ file, line: lineNumber, infinitive: row.infinitive ?? '', row });
  }

  return { records, structural };
}

// verbData.ts is generated-artifact-shaped: one object literal per line, keys
// in a fixed order. Parsed by regex rather than imported so this script stays
// a plain Node script with no TypeScript loader involved.
const TS_FIELD = /(infinitive|imperativ|presens|preteritum|supinum)\s*:\s*"([^"]*)"/g;

function parseVerbDataTs(text, file) {
  const lines = text.split(/\r?\n/);
  const records = [];
  const structural = [];

  for (let i = 0; i < lines.length; i++) {
    // A `//` comment line can mention a form field in prose (e.g. the
    // säga alternates note above the row it documents) and false-match
    // TS_FIELD; skip comment lines so they are not counted as rows.
    if (lines[i].trim().startsWith('//')) continue;
    const matches = [...lines[i].matchAll(TS_FIELD)];
    if (matches.length === 0) continue;
    const row = {};
    for (const m of matches) row[m[1]] = m[2];
    records.push({ file, line: i + 1, infinitive: row.infinitive ?? '', row });
  }

  if (records.length === 0) {
    structural.push({
      file,
      line: 1,
      message: "no verb rows matched — the table's shape changed and this parser is now blind",
    });
  }

  return { records, structural };
}

function parseFile(path) {
  const text = readFileSync(path, 'utf8');
  return path.endsWith('.csv') ? parseCsv(text, path) : parseVerbDataTs(text, path);
}

function main() {
  const files = process.argv.slice(2);
  const targets = files.length > 0 ? files : DEFAULT_FILES;

  const violations = [];
  const structural = [];
  // Plain-string findings from the structural repo-wide checks (R5), kept
  // separate from `structural` (which is per-parsed-file {file,line,message}
  // objects) because these are not about one file's own contents.
  const extraMessages = [];
  let total = 0;

  for (const path of targets) {
    const parsed = parseFile(path);
    structural.push(...parsed.structural);
    total += parsed.records.length;

    for (const { file, line, infinitive, row } of parsed.records) {
      for (const field of FORM_FIELDS) {
        const value = row[field];
        // A field absent from verbData.ts (optional key) is not a charset
        // problem; missing CSV columns are already reported structurally.
        if (value === undefined) continue;
        if (!ALLOWED.test(value)) {
          violations.push({ file, line, infinitive, field, value });
        }
      }
    }

    if (path.endsWith('verbData.ts')) {
      extraMessages.push(...checkVerbDataInvariants(parsed.records));
    }
  }

  // R5.1/R5.2 are repo-wide invariants, not about the parsed targets, so
  // they always run regardless of which files were passed on the CLI.
  extraMessages.push(...checkNoPublicCsv());
  extraMessages.push(...checkNoSrcCsvReferences());

  if (structural.length > 0 || violations.length > 0 || extraMessages.length > 0) {
    for (const s of structural) {
      console.error(`${s.file}:${s.line}: ${s.message}`);
    }
    for (const m of extraMessages) {
      console.error(m);
    }
    if (violations.length > 0) {
      console.error(`\nFound ${violations.length} form field(s) with disallowed characters:\n`);
      for (const v of violations) {
        console.error(`  ${v.file}:${v.line} (${v.infinitive}): ${v.field} = "${v.value}"`);
      }
      console.error(`\nAllowed: lowercase a-z å ä ö é, space, hyphen, slash, parentheses, period.`);
    }
    process.exit(1);
  }

  console.log(
    `OK: ${total} rows across ${targets.length} file(s), all form fields within the allowed character set.`,
  );
}

main();
