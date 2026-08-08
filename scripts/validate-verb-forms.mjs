// Verb-form validator (owner: swedish-linguist).
//
// Checks the conjugation form fields (infinitive, imperativ, presens,
// preteritum, supinum) of BOTH verb data sources for characters that cannot
// occur in a Swedish verb form:
//
//   public/data/swedish_verbs.csv  — source of record
//   src/data/verbData.ts           — the table that actually ships to users
//
// verbData.ts is checked too because it is what the app reads at runtime; a
// corrupt form there reaches a learner immediately, whereas a corrupt CSV row
// only reaches one once it is promoted.
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
// Run:  node scripts/validate-verb-forms.mjs [file ...]
// With no arguments it checks both default files above.
// Exits non-zero and prints every offending row/field if it finds anything
// outside the allowed set.

import { readFileSync } from 'node:fs';

// Lowercase Swedish letters plus é (loanwords such as "idé"), and the
// punctuation the data legitimately uses: space (particle and reflexive verbs,
// "te sig", "stiga upp"), hyphen (compounds), forward slash (attested
// alternate forms, "växt/vuxit"), parentheses and period (annotations,
// "ta (el. taga)"). Deliberately no A-Z — see the header note.
const ALLOWED = /^[a-zåäöé \/\-.()]*$/;

const FORM_FIELDS = ['infinitive', 'imperativ', 'presens', 'preteritum', 'supinum'];

const DEFAULT_FILES = ['public/data/swedish_verbs.csv', 'src/data/verbData.ts'];

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
  }

  if (structural.length > 0 || violations.length > 0) {
    for (const s of structural) {
      console.error(`${s.file}:${s.line}: ${s.message}`);
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
