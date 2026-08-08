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
function rowsWithPrecedingComments(source: string): Array<{
  infinitive: string;
  commentBlock: string;
  hasGrupp: boolean;
  imperativNotApplicable: boolean;
}> {
  const startMarker = 'export const VERB_DATA: VerbData[] = [';
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start + startMarker.length);
  const lines = body.split('\n');

  const rows: Array<{
    infinitive: string;
    commentBlock: string;
    hasGrupp: boolean;
    imperativNotApplicable: boolean;
  }> = [];
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
        imperativNotApplicable: /\bimperativNotApplicable:\s*true\b/.test(trimmed),
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

// Issue #124: fill missing imperativ forms; stop showing "(not available)".
// Same "flag, don't guess" contract as the grupp field above: every row
// with an empty imperativ must be explained, either because the verb is a
// modal with no natural imperativ (imperativNotApplicable: true) or because
// a human explicitly deferred it (a "NEEDS HUMAN CHECK" comment) rather than
// risk teaching a guessed, possibly-wrong Swedish form.
describe('VERB_DATA - imperativ field contract (issue #124)', () => {
  it('flags every row with an empty imperativ as either imperativNotApplicable or explicitly deferred with a human-review comment', () => {
    const unexplainedEmpty = VERB_DATA.filter((v, i) => {
      if (v.imperativ !== '') return false;
      if (v.imperativNotApplicable) return false;
      const parsedRow = parsedRows[i];
      return !/NEEDS HUMAN CHECK/.test(parsedRow.commentBlock);
    });
    expect(unexplainedEmpty.map((v) => v.infinitive)).toEqual([]);
  });

  it('never sets imperativNotApplicable: true on a row that also has a non-empty imperativ (contradicts itself)', () => {
    const contradictions = VERB_DATA.filter((v) => v.imperativNotApplicable && v.imperativ !== '');
    expect(contradictions.map((v) => v.infinitive)).toEqual([]);
  });

  it('marks exactly the three known modal verbs (kunna, få, vilja) as imperativNotApplicable, nothing else', () => {
    const flagged = VERB_DATA.filter((v) => v.imperativNotApplicable).map((v) => v.infinitive);
    expect(flagged.sort()).toEqual(['få', 'kunna', 'vilja'].sort());
  });

  // Known, documented gap: "te sig" (reflexive particle verb) and "anse"
  // (irregular, unattested imperativ use) are deliberately left unfilled
  // rather than guessed. If this list shrinks, update it (more verbs got
  // filled in - good). If it grows without an accompanying "NEEDS HUMAN
  // CHECK" comment, the test above already catches that. Pinning the exact
  // set here makes any *silent* change to this set loud.
  it('leaves exactly "te sig" and "anse" unfilled (deliberately deferred, not modal, not guessed)', () => {
    const deferred = VERB_DATA.filter((v) => v.imperativ === '' && !v.imperativNotApplicable).map(
      (v) => v.infinitive,
    );
    expect(deferred.sort()).toEqual(['anse', 'te sig'].sort());
  });

  it('fills a non-empty imperativ for every non-modal, non-deferred row (the mechanical fill is complete)', () => {
    const deferredOrModal = new Set(['te sig', 'anse', 'kunna', 'få', 'vilja']);
    const stillMissing = VERB_DATA.filter(
      (v) => v.imperativ === '' && !deferredOrModal.has(v.infinitive),
    );
    expect(stillMissing.map((v) => v.infinitive)).toEqual([]);
  });

  // Pin the exact mechanically-derived imperativ for a representative
  // sample across grupp 1/2/3/4, so a future edit can't silently reintroduce
  // a wrong or empty imperativ for verbs the fill already covers.
  it.each([
    ['ta', 'ta'],
    ['se', 'se'],
    ['gå', 'gå'],
    ['säga', 'säg'],
    ['skriva', 'skriv'],
    ['börja', 'börja'],
    ['tycka', 'tyck'],
    ['använda', 'använd'],
    ['lägga', 'lägg'],
    ['ligga', 'ligg'],
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
