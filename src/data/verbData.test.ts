import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERB_DATA, type Grupp } from '@/data/verbData';

const VALID_GRUPP: ReadonlySet<Grupp> = new Set(['1', '2a', '2b', '3', '4']);

// Read the raw source so we can pin the "flag, don't guess" contract at the
// text level: every row that omits `grupp` must carry a human-readable
// "NEEDS HUMAN REVIEW" comment directly above it. This is invisible at
// runtime (the field is just `undefined`), so the only way to catch a
// silently-omitted-without-explanation row is to inspect the source text.
const here = dirname(fileURLToPath(import.meta.url));
const verbDataSource = readFileSync(join(here, 'verbData.ts'), 'utf-8');

// Split the VERB_DATA array literal into one chunk per row, each chunk
// carrying any comment lines that precede it.
function rowsWithPrecedingComments(
  source: string,
): Array<{ infinitive: string; commentBlock: string; hasGrupp: boolean }> {
  const startMarker = 'export const VERB_DATA: VerbData[] = [';
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start + startMarker.length);
  const lines = body.split('\n');

  const rows: Array<{ infinitive: string; commentBlock: string; hasGrupp: boolean }> = [];
  let pendingComment: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      pendingComment.push(trimmed);
      continue;
    }
    const rowMatch = trimmed.match(/infinitive:\s*"([^"]+)"/);
    if (rowMatch) {
      rows.push({
        infinitive: rowMatch[1],
        commentBlock: pendingComment.join('\n'),
        hasGrupp: /\bgrupp:\s*"/.test(trimmed),
      });
      pendingComment = [];
    }
    if (trimmed.startsWith(']')) break;
  }
  return rows;
}

const parsedRows = rowsWithPrecedingComments(verbDataSource);

describe('VERB_DATA - grupp field contract', () => {
  it('has a parsed row for every VERB_DATA entry (sanity-checks the source parser above)', () => {
    expect(parsedRows).toHaveLength(VERB_DATA.length);
    expect(parsedRows.map((r) => r.infinitive)).toEqual(VERB_DATA.map((v) => v.infinitive));
  });

  it("every row's grupp is either omitted or one of the five valid conjugation classes", () => {
    for (const verb of VERB_DATA) {
      if (verb.grupp !== undefined) {
        expect(VALID_GRUPP.has(verb.grupp)).toBe(true);
      }
    }
  });

  it('never assigns a grupp of empty string or any value outside the union (would indicate a guess slipping past the type)', () => {
    for (const verb of VERB_DATA) {
      if (verb.grupp !== undefined) {
        expect(verb.grupp).not.toBe('');
        expect(['1', '2a', '2b', '3', '4']).toContain(verb.grupp);
      }
    }
  });

  it('flags every row that omits grupp with an explicit human-review comment, rather than leaving it silently unexplained', () => {
    const unexplainedOmissions = parsedRows.filter(
      (r) => !r.hasGrupp && !/NEEDS HUMAN REVIEW/.test(r.commentBlock),
    );
    expect(unexplainedOmissions.map((r) => r.infinitive)).toEqual([]);
  });

  it("does not attach a 'NEEDS HUMAN REVIEW' comment to a row that also has a grupp assigned (contradicts itself)", () => {
    const contradictions = parsedRows.filter(
      (r) => r.hasGrupp && /NEEDS HUMAN REVIEW/.test(r.commentBlock),
    );
    expect(contradictions.map((r) => r.infinitive)).toEqual([]);
  });

  // Regression: "vända", "söka" and "lägga" were previously flagged NEEDS
  // HUMAN REVIEW because their stored forms didn't match any known grupp
  // pattern. swedish-linguist corrected the underlying forms and assigned
  // the correct grupp (issue #34, PR #85). Pin the corrected grupp so a
  // future edit can't silently regress back to an unexplained omission.
  it.each([
    ['vända', '2a'],
    ['söka', '2b'],
    ['lägga', '4'],
  ])('assigns grupp "%s" -> "%s" now that its forms have been corrected', (infinitive, grupp) => {
    const row = VERB_DATA.find((v) => v.infinitive === infinitive);
    expect(row).toBeDefined();
    expect(row?.grupp).toBe(grupp);
  });

  // Regression: pin the exact corrected forms for the six verbs fixed in
  // PR #85, so a future edit can't silently reintroduce the wrong
  // conjugation while leaving the (now-correct) grupp assignment in place.
  it.each([
    ['ta', { presens: 'tar', preteritum: 'tog', supinum: 'tagit' }],
    ['gå', { presens: 'går', preteritum: 'gick', supinum: 'gått' }],
    ['låta', { presens: 'låter', preteritum: 'lät', supinum: 'låtit' }],
    ['vända', { presens: 'vänder', preteritum: 'vände', supinum: 'vänt' }],
    ['söka', { presens: 'söker', preteritum: 'sökte', supinum: 'sökt' }],
    ['lägga', { presens: 'lägger', preteritum: 'la', supinum: 'lagt' }],
  ] as const)('pins the corrected forms for "%s"', (infinitive, expected) => {
    const row = VERB_DATA.find((v) => v.infinitive === infinitive);
    expect(row).toBeDefined();
    expect(row?.presens).toBe(expected.presens);
    expect(row?.preteritum).toBe(expected.preteritum);
    expect(row?.supinum).toBe(expected.supinum);
  });

  it('assigns a grupp to every row (the human review audit is complete)', () => {
    const stillMissing = VERB_DATA.filter((v) => v.grupp === undefined);
    expect(stillMissing.map((v) => v.infinitive)).toEqual([]);
  });

  // Mojibake guard: every verb-form string in VERB_DATA must be plain
  // Swedish letters (plus space for the one particle verb, "te sig").
  // Catches double-encoded UTF-8, stray control characters, or a
  // dotless "i" slipping in from a bad copy-paste — the kind of
  // corruption that teaches a learner a Swedish word that doesn't exist.
  it('contains no verb-form string with a character outside plain Swedish letters, space or hyphen', () => {
    const allowed = /^[a-zA-ZåäöÅÄÖ -]*$/;
    const offenders: string[] = [];
    for (const verb of VERB_DATA) {
      for (const field of [
        'infinitive',
        'presens',
        'preteritum',
        'supinum',
        'imperativ',
      ] as const) {
        const value = verb[field];
        if (value && !allowed.test(value)) {
          offenders.push(`${verb.infinitive}.${field}="${value}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('VERB_DATA - imperativ field contract (issue #124)', () => {
  // Same "flag, don't guess" pattern as the grupp contract above, but keyed
  // on an empty imperativ instead of a missing grupp: every row with an
  // empty imperativ must either be explicitly marked `noImperativ: true`
  // (a real Swedish grammatical fact - modal/auxiliary verbs) or carry a
  // human-readable review comment explaining why it's still unfilled. A row
  // with an empty imperativ, no flag and no comment would be silently
  // indistinguishable "missing data" - exactly the bug issue #124 fixed.
  function rowsWithPrecedingCommentsAndImperativ(
    source: string,
  ): Array<{ infinitive: string; commentBlock: string; imperativEmpty: boolean }> {
    const startMarker = 'export const VERB_DATA: VerbData[] = [';
    const start = source.indexOf(startMarker);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start + startMarker.length);
    const lines = body.split('\n');

    const rows: Array<{ infinitive: string; commentBlock: string; imperativEmpty: boolean }> = [];
    let pendingComment: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) {
        pendingComment.push(trimmed);
        continue;
      }
      const rowMatch = trimmed.match(/infinitive:\s*"([^"]+)"/);
      if (rowMatch) {
        rows.push({
          infinitive: rowMatch[1],
          commentBlock: pendingComment.join('\n'),
          imperativEmpty: /\bimperativ:\s*""/.test(trimmed),
        });
        pendingComment = [];
      }
      if (trimmed.startsWith(']')) break;
    }
    return rows;
  }

  const imperativRows = rowsWithPrecedingCommentsAndImperativ(verbDataSource);

  it('has a parsed row for every VERB_DATA entry (sanity-checks the source parser above)', () => {
    expect(imperativRows).toHaveLength(VERB_DATA.length);
    expect(imperativRows.map((r) => r.infinitive)).toEqual(VERB_DATA.map((v) => v.infinitive));
  });

  it('sets imperativ to the empty string on every row flagged noImperativ, and only those rows or an explicitly human-reviewed one', () => {
    for (const verb of VERB_DATA) {
      if (verb.noImperativ) {
        expect(verb.imperativ).toBe('');
      }
    }
  });

  // Regression: issue #124 filled the ~40 rows that were previously empty
  // "not filled in yet" placeholders. Pin the exact current modal-verb set
  // so an accidental future edit that empties another row's imperativ (or
  // un-flags one of these) is caught loudly instead of silently reverting
  // to the "(not available)" bug.
  it('flags noImperativ true for exactly the known modal/auxiliary verbs, and nothing else', () => {
    const flagged = VERB_DATA.filter((v) => v.noImperativ)
      .map((v) => v.infinitive)
      .sort();
    expect(flagged).toEqual(['få', 'kunna', 'vilja'].sort());
  });

  it('fills a real, non-empty imperativ for every non-modal verb whose row is not explicitly flagged for human review', () => {
    const unexplainedEmpty = imperativRows.filter((r) => {
      if (!r.imperativEmpty) return false;
      const verb = VERB_DATA.find((v) => v.infinitive === r.infinitive);
      if (verb?.noImperativ) return false; // legitimately has no imperativ
      // Everything else with an empty imperativ must be explicitly flagged.
      return !/human/i.test(r.commentBlock);
    });
    expect(unexplainedEmpty.map((r) => r.infinitive)).toEqual([]);
  });

  // Regression: "ta", "se", "gå", "säga", "läsa", "söka", "tänka" and the
  // rest of the ~40 previously-empty rows now carry a mechanically-derived
  // imperativ. Spot-check a representative sample across grupp 1/2a/2b/3/4
  // so a future edit can't silently re-empty one of them.
  it.each([
    ['ta', 'ta'],
    ['se', 'se'],
    ['gå', 'gå'],
    ['säga', 'säg'],
    ['läsa', 'läs'],
    ['söka', 'sök'],
    ['tänka', 'tänk'],
    ['visa', 'visa'],
    ['tro', 'tro'],
    ['äga', 'äg'],
  ])('pins the filled imperativ "%s" -> "%s"', (infinitive, imperativ) => {
    const row = VERB_DATA.find((v) => v.infinitive === infinitive);
    expect(row).toBeDefined();
    expect(row?.imperativ).toBe(imperativ);
  });
});

describe('swedish_verbs.csv - mojibake guard', () => {
  // The source CSV legitimately contains parentheses, slashes and periods
  // for alternate forms and abbreviations (e.g. "ta (el. taga)",
  // "sa/sade"), so it can't use the same strict letters-only guard as
  // VERB_DATA. Instead, assert the file contains no character outside
  // printable ASCII plus the Swedish letters — this still catches
  // mojibake (double-encoded UTF-8) and stray dotless-i / lookalike
  // characters without flagging legitimate punctuation.
  it('contains no character outside printable ASCII and Swedish letters', () => {
    const csvPath = join(here, '..', '..', 'public', 'data', 'swedish_verbs.csv');
    const csv = readFileSync(csvPath, 'utf-8');
    const offenders = new Set<string>();
    for (const ch of csv) {
      const code = ch.codePointAt(0)!;
      const isPlainAscii = code >= 0x20 && code <= 0x7e;
      const isControlWhitespace = ch === '\n' || ch === '\r' || ch === '\t';
      const isSwedishLetter = 'åäöÅÄÖ'.includes(ch);
      if (!isPlainAscii && !isControlWhitespace && !isSwedishLetter) {
        offenders.add(`${ch} (U+${code.toString(16).toUpperCase().padStart(4, '0')})`);
      }
    }
    expect([...offenders]).toEqual([]);
  });
});
