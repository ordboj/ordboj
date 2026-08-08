// Promotion-pipeline validator (owner: swedish-linguist).
//
// Checks public/data/swedish_verbs.csv for mojibake / foreign-script
// corruption in the conjugation form columns (infinitive, imperativ,
// presens, preteritum, supinum). This is the check that would have caught
// issue #45 (Turkish dotless "ı", Vietnamese "ắ" substituted for i/å).
//
// It intentionally does NOT enforce a maximally strict "lowercase letters
// only" charset: the CSV legitimately contains a handful of annotation
// conventions such as "ta (el. taga)", "växt/vuxit", "fungera (vardagl.
// funka)". The goal is to catch characters that cannot occur in Swedish at
// all (any script outside the Swedish/extended-Latin alphabet used here),
// not to police style. Run manually before promoting CSV rows into
// src/data/verbData.ts:
//
//   node scripts/validate-verb-forms.mjs [path-to-csv]
//
// Exits non-zero and prints every offending row/field if it finds anything
// outside the allowed set.

import { readFileSync } from "node:fs";

const csvPath = process.argv[2] ?? "public/data/swedish_verbs.csv";

// Swedish letters (upper + lower) plus é/É, and the punctuation the CSV
// legitimately uses for alternate-form annotations and multi-word
// (particle) verbs: space, hyphen, forward slash, parentheses, period.
const ALLOWED = /^[a-zA-ZÅÄÖåäöÉé \/\-.()]*$/;

const FORM_COLUMNS = ["infinitive", "imperativ", "presens", "preteritum", "supinum"];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  const rows = lines.slice(1).map((line, i) => {
    const cols = line.split(",");
    const row = {};
    header.forEach((key, idx) => {
      row[key] = cols[idx] ?? "";
    });
    return { lineNumber: i + 2, row }; // +2: 1-indexed, plus header row
  });
  return rows;
}

function main() {
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  const violations = [];

  for (const { lineNumber, row } of rows) {
    for (const field of FORM_COLUMNS) {
      const value = row[field] ?? "";
      if (!ALLOWED.test(value)) {
        violations.push({ line: lineNumber, infinitive: row.infinitive, field, value });
      }
    }
  }

  if (violations.length > 0) {
    console.error(`Found ${violations.length} form field(s) with disallowed characters:\n`);
    for (const v of violations) {
      console.error(`  line ${v.line} (${v.infinitive}): ${v.field} = "${v.value}"`);
    }
    process.exit(1);
  }

  console.log(`OK: ${rows.length} rows, all form fields within the allowed character set.`);
}

main();
