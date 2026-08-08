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
  imperativ: string;
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
    imperativ: string;
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
      const imperativMatch = trimmed.match(/imperativ:\s*"([^"]*)"/);
      // A row can also carry its explanation as a trailing "// ..." comment
      // on the same line (e.g. "... }, // modal verb: ..."), not just as
      // preceding comment lines. Fold both into one commentBlock.
      const trailingCommentMatch = trimmed.match(/\/\/.*$/);
      const commentParts = [...pendingComment];
      if (trailingCommentMatch) commentParts.push(trailingCommentMatch[0]);
      rows.push({
        infinitive: rowMatch[1],
        commentBlock: commentParts.join('\n'),
        hasGrupp: /\bgrupp:\s*"/.test(trimmed),
        imperativ: imperativMatch ? imperativMatch[1] : '',
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

// Issue #132 / PR #179: swedish-linguist audited all 50 shipped verbs'
// imperativ forms. Genuine modal verbs (kunna, få, vilja) have no Swedish
// imperativ at all and stay empty *with* an explanation; genuinely
// uncertain rows (te sig, anse) stay empty and flagged for a human rather
// than guessed; every other row now carries a real, non-empty imperativ.
describe('VERB_DATA - imperativ audit (issue #132)', () => {
  // Regression: before the audit, every non-auxiliary A1 verb below had
  // imperativ: "" even though a correct Swedish imperativ exists. Pin the
  // corrected forms so a future edit can't silently wipe them again.
  it.each([
    ['använda', 'använd'],
    ['börja', 'börja'],
    ['behöva', 'behöv'],
    ['ta', 'ta'],
    ['se', 'se'],
    ['gå', 'gå'],
    ['säga', 'säg'],
    ['skriva', 'skriv'],
    ['läsa', 'läs'],
    ['lägga', 'lägg'],
    ['tala', 'tala'],
    ['hålla', 'håll'],
  ] as const)('fills in the real imperativ for "%s" -> "%s"', (infinitive, imperativ) => {
    const row = VERB_DATA.find((v) => v.infinitive === infinitive);
    expect(row).toBeDefined();
    expect(row?.imperativ).toBe(imperativ);
  });

  // Regression: modal verbs genuinely have no imperativ in Swedish. The
  // audit must keep these empty (not guess a form) while explaining why,
  // distinguishing "no imperativ exists" from "not yet reviewed".
  it.each(['kunna', 'få', 'vilja'] as const)(
    'leaves the genuinely absent imperativ for modal verb "%s" empty, with an explanation',
    (infinitive) => {
      const row = VERB_DATA.find((v) => v.infinitive === infinitive);
      expect(row).toBeDefined();
      expect(row?.imperativ).toBe('');

      const parsed = parsedRows.find((r) => r.infinitive === infinitive);
      expect(parsed).toBeDefined();
      expect(parsed?.commentBlock).toMatch(/modal verb/i);
    },
  );

  // Every row whose imperativ is empty must carry an explanatory comment
  // (either "modal verb" for a genuine grammatical absence, or "NEEDS
  // HUMAN CHECK" for a genuinely uncertain form) — never a silent blank
  // that could be mistaken for an unfinished audit.
  it('flags every row with an empty imperativ with an explanatory comment, rather than leaving it silently blank', () => {
    const unexplained = parsedRows.filter(
      (r) =>
        r.imperativ === '' &&
        !/modal verb/i.test(r.commentBlock) &&
        !/NEEDS HUMAN CHECK/i.test(r.commentBlock),
    );
    expect(unexplained.map((r) => r.infinitive)).toEqual([]);
  });

  // Regression: rows flagged as genuinely uncertain must actually be
  // empty (not a guessed form hiding behind a stale review comment).
  it.each(['te sig', 'anse'] as const)(
    'leaves the genuinely uncertain imperativ for "%s" empty and flagged for human review, not guessed',
    (infinitive) => {
      const row = VERB_DATA.find((v) => v.infinitive === infinitive);
      expect(row).toBeDefined();
      expect(row?.imperativ).toBe('');

      const parsed = parsedRows.find((r) => r.infinitive === infinitive);
      expect(parsed).toBeDefined();
      expect(parsed?.commentBlock).toMatch(/NEEDS HUMAN CHECK/i);
    },
  );

  // The audit is complete: every row's imperativ is either a real,
  // non-empty Swedish form, or empty with one of the two allowed
  // explanations pinned above.
  it('has an imperativ audit comment (or a real value) for every row - no unexplained gaps remain', () => {
    for (const row of parsedRows) {
      if (row.imperativ === '') {
        expect(
          /modal verb/i.test(row.commentBlock) || /NEEDS HUMAN CHECK/i.test(row.commentBlock),
        ).toBe(true);
      } else {
        expect(row.imperativ.length).toBeGreaterThan(0);
      }
    }
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
