import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERB_DATA, type Grupp, type AlternateFormField } from '@/data/verbData';

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
        // rowMatch[1] / imperativMatch[1] are the regexes' capture groups:
        // present whenever the row matched, but string | undefined under
        // noUncheckedIndexedAccess (#105).
        infinitive: rowMatch[1]!,
        commentBlock: commentParts.join('\n'),
        hasGrupp: /\bgrupp:\s*"/.test(trimmed),
        imperativ: imperativMatch ? (imperativMatch[1] ?? '') : '',
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

// Issue #123: VerbData gains an optional `alternates` field so documented
// SAOL alternate forms (e.g. "lade" beside primary "la" for lägga) can be
// stored without touching any existing row. Pin that contract at the data
// level, independent of the checker that consumes it (src/lib/verbs.ts).
describe('VERB_DATA - alternates field (issue #123)', () => {
  it('does not require the field on rows without a documented alternate: the overwhelming majority of rows omit it', () => {
    const withAlternates = VERB_DATA.filter((v) => v.alternates !== undefined);
    // Shape assertion, not a census: #123 must not have touched any row it
    // didn't need to, but the linguist verifying and adding further pairs
    // (out of scope for #123, see decision doc §6) shouldn't break this test.
    expect(withAlternates.length).toBeGreaterThan(0);
    expect(withAlternates.length).toBeLessThan(VERB_DATA.length);
  });

  it('pins the documented alternate for lägga preteritum: primary "la", alternate "lade"', () => {
    const row = VERB_DATA.find((v) => v.infinitive === 'lägga');
    expect(row).toBeDefined();
    expect(row?.preteritum).toBe('la');
    expect(row?.alternates?.preteritum).toEqual(['lade']);
  });

  it('pins the documented alternate for säga preteritum: primary "sa", alternate "sade"', () => {
    const row = VERB_DATA.find((v) => v.infinitive === 'säga');
    expect(row).toBeDefined();
    expect(row?.preteritum).toBe('sa');
    expect(row?.alternates?.preteritum).toEqual(['sade']);
  });

  it('never documents an alternate identical to its own primary form (would be a no-op that hides a real data error)', () => {
    for (const verb of VERB_DATA) {
      if (!verb.alternates) continue;
      for (const [field, alts] of Object.entries(verb.alternates) as Array<
        ['imperativ' | 'presens' | 'preteritum' | 'supinum', string[]]
      >) {
        const primary = verb[field];
        for (const alt of alts) {
          expect(alt).not.toBe(primary);
        }
      }
    }
  });

  it('never documents an empty-string alternate or an empty alternates array (would silently accept "" as correct)', () => {
    for (const verb of VERB_DATA) {
      if (!verb.alternates) continue;
      for (const alts of Object.values(verb.alternates)) {
        expect(alts).toBeDefined();
        expect((alts as string[]).length).toBeGreaterThan(0);
        for (const alt of alts as string[]) {
          expect(alt.trim().length).toBeGreaterThan(0);
        }
      }
    }
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

// Issue #124: modal verbs (kunna, få, vilja) are now explicitly flagged
// noNaturalImperativ: true, distinguishing "grammatically has none" from
// "not filled in yet" -- "te sig" and "anse" (below) stay unflagged because
// their empty imperativ is still pending human review (issue #132), not a
// confirmed grammatical absence.
describe('VERB_DATA - noNaturalImperativ flag (issue #124)', () => {
  it.each(['kunna', 'få', 'vilja'] as const)(
    'flags modal verb "%s" noNaturalImperativ: true',
    (infinitive) => {
      const row = VERB_DATA.find((v) => v.infinitive === infinitive);
      expect(row).toBeDefined();
      expect(row?.noNaturalImperativ).toBe(true);
    },
  );

  it('does not flag a non-modal verb that has a real imperativ', () => {
    const row = VERB_DATA.find((v) => v.infinitive === 'vara');
    expect(row?.noNaturalImperativ).toBeFalsy();
  });

  it.each(['te sig', 'anse'] as const)(
    'does not flag "%s" (empty pending human review, not a confirmed grammatical absence)',
    (infinitive) => {
      const row = VERB_DATA.find((v) => v.infinitive === infinitive);
      expect(row?.noNaturalImperativ).toBeFalsy();
    },
  );

  it('flags noNaturalImperativ only on rows whose imperativ is genuinely empty, never on a row with a real imperativ value', () => {
    for (const verb of VERB_DATA) {
      if (verb.noNaturalImperativ) {
        expect(verb.imperativ).toBe('');
      }
    }
  });

  it('flags noNaturalImperativ on exactly the three modal verbs (no accidental extra row flagged)', () => {
    const flagged = VERB_DATA.filter((v) => v.noNaturalImperativ)
      .map((v) => v.infinitive)
      .sort();
    expect(flagged).toEqual(['få', 'kunna', 'vilja']);
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
    const csvPath = join(here, '..', '..', 'docs', 'verb-data', 'candidates.csv');
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

describe('swedish_verbs.csv - issue #125 naive-template conjugation audit (PR #158)', () => {
  // The generator that produced swedish_verbs.csv applied a naive grupp-1
  // template (presens = infinitiv+"r", preteritum = infinitiv+"de",
  // supinum = infinitiv+"t") to every "-a"-infinitive row, correct for real
  // grupp-1 verbs but wrong for the ~256 grupp 2/3/4 verbs the issue
  // flagged. #125 audited and corrected those rows. These tests pin the
  // corrected forms at the text level (the CSV is data, not imported code,
  // so there is nothing else to assert against) so a future edit can't
  // silently regress a fixed row back to the naive template.
  type CsvRow = {
    cefr: string;
    grammar: string;
    infinitive: string;
    imperativ: string;
    presens: string;
    preteritum: string;
    supinum: string;
  };

  function parseCsv(): CsvRow[] {
    const csvPath = join(here, '..', '..', 'docs', 'verb-data', 'candidates.csv');
    const csv = readFileSync(csvPath, 'utf-8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    return lines.slice(1).map((line) => {
      // Destructured split() elements are string | undefined under
      // noUncheckedIndexedAccess (#105); a short row yields '' fields rather
      // than undefined so CsvRow stays all-string.
      const [
        cefr = '',
        grammar = '',
        infinitive = '',
        imperativ = '',
        presens = '',
        preteritum = '',
        supinum = '',
      ] = line.split(',');
      return { cefr, grammar, infinitive, imperativ, presens, preteritum, supinum };
    });
  }

  function rowFor(rows: CsvRow[], infinitive: string): CsvRow {
    const row = rows.find((r) => r.infinitive === infinitive);
    if (!row) throw new Error(`No CSV row found for infinitive "${infinitive}"`);
    return row;
  }

  // Naive-template shape: presens = infinitiv+"r", preteritum = infinitiv+"de",
  // supinum = infinitiv+"t" — the exact auto-generated pattern #125 flagged.
  function isNaiveTemplate(row: CsvRow): boolean {
    const inf = row.infinitive.replace(/\s*\(.*\)/, '').trim();
    return row.presens === `${inf}r` && row.preteritum === `${inf}de` && row.supinum === `${inf}t`;
  }

  // A representative sample spanning A1/A2/B1 and grupp 2a/2b/3/4, pulled
  // from the ~292 rows the audit corrected. Each of these previously had
  // the naive template (e.g. "ställa,,ställar,ställade,ställat") and now
  // has its real conjugation.
  it.each([
    ['innebära', { presens: 'innebär', preteritum: 'innebar', supinum: 'inneburit' }],
    ['ställa', { presens: 'ställer', preteritum: 'ställde', supinum: 'ställt' }],
    ['kräva', { presens: 'kräver', preteritum: 'krävde', supinum: 'krävt' }],
    ['byta', { presens: 'byter', preteritum: 'bytte', supinum: 'bytt' }],
    ['möta', { presens: 'möter', preteritum: 'mötte', supinum: 'mött' }],
    ['beskriva', { presens: 'beskriver', preteritum: 'beskrev', supinum: 'beskrivit' }],
    ['anta', { presens: 'antar', preteritum: 'antog', supinum: 'antagit' }],
    ['bidra', { presens: 'bidrar', preteritum: 'bidrog', supinum: 'bidragit' }],
    ['dyka', { presens: 'dyker', preteritum: 'dök', supinum: 'dykit' }],
    ['sköta', { presens: 'sköter', preteritum: 'skötte', supinum: 'skött' }],
    ['föredra', { presens: 'föredrar', preteritum: 'föredrog', supinum: 'föredragit' }],
    ['tillägga', { presens: 'tillägger', preteritum: 'tillade', supinum: 'tillagt' }],
    ['gifta', { presens: 'gifter', preteritum: 'gifte', supinum: 'gift' }],
    ['träda', { presens: 'träder', preteritum: 'trädde', supinum: 'trätt' }],
    ['svära', { presens: 'svär', preteritum: 'svor', supinum: 'svurit' }],
    ['besitta', { presens: 'besitter', preteritum: 'besatt', supinum: 'besuttit' }],
    ['angripa', { presens: 'angriper', preteritum: 'angrep', supinum: 'angripit' }],
    ['skita', { presens: 'skiter', preteritum: 'sket', supinum: 'skitit' }],
  ] as const)(
    'corrects the naive grupp-1 template for "%s" (issue #125)',
    (infinitive, expected) => {
      const row = rowFor(parseCsv(), infinitive);
      expect(row.presens).toBe(expected.presens);
      expect(row.preteritum).toBe(expected.preteritum);
      expect(row.supinum).toBe(expected.supinum);
      expect(isNaiveTemplate(row)).toBe(false);
    },
  );

  // Regression: "svara" (A1, a genuine grupp-1 verb) had "svära"'s strong
  // forms pasted in, with a stray uppercase preteritum ("svär,SVor,svurit")
  // instead of its own real conjugation.
  it('regression: svara is not contaminated with svära\'s forms ("svär,SVor,svurit")', () => {
    const row = rowFor(parseCsv(), 'svara');
    expect(row.presens).toBe('svarar');
    expect(row.preteritum).toBe('svarade');
    expect(row.supinum).toBe('svarat');
  });

  // Regression: "sova"'s preteritum was the stray-uppercase "SOV" instead
  // of "sov" (presens/supinum were already correct, so this row never
  // matched the naive-template detector — it's a separate corruption
  // fixed in the same PR).
  it('regression: sova preteritum is lowercase "sov", not "SOV"', () => {
    const row = rowFor(parseCsv(), 'sova');
    expect(row.presens).toBe('sover');
    expect(row.preteritum).toBe('sov');
    expect(row.supinum).toBe('sovit');
  });

  // General invariant (not just the two known instances above): every verb
  // form in the CSV is lowercase Swedish. A stray uppercase letter — like
  // "SVor" or "SOV" — is exactly the class of copy/paste corruption that
  // teaches a learner a Swedish word that doesn't exist. This catches any
  // recurrence of that bug class, not only the two rows already found.
  it('no infinitive/imperativ/presens/preteritum/supinum field contains an uppercase letter', () => {
    const offenders: string[] = [];
    for (const row of parseCsv()) {
      for (const field of [
        'infinitive',
        'imperativ',
        'presens',
        'preteritum',
        'supinum',
      ] as const) {
        const value = row[field];
        if (value && /[A-ZÅÄÖ]/.test(value)) {
          offenders.push(`${row.infinitive}.${field}="${value}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Family-consistency: per the audit method (docs/... swedish_verbs.audit.md
  // step 2), a prefixed compound verb always inherits its base verb's
  // conjugation class in Swedish — this is a hard morphological rule, not a
  // guess. Pin that every compound of "sätta", "komma", "göra" and "hålla"
  // present in the CSV follows its base verb's pattern, so a future edit
  // can't silently reintroduce the naive template for one family member
  // while leaving its siblings correct.
  it.each([
    'fortsätta',
    'ersätta',
    'utsätta',
    'ifrågasätta',
    'förutsätta',
    'översätta',
    'tillsätta',
    'avsätta',
    'omsätta',
    'försätta',
    'motsätta',
    'bosätta',
    'värdesätta',
    'besätta',
    'sjösätta',
    'pantsätta',
  ])('"%s" inherits sätta\'s sätter/xsatte/xsatt conjugation', (infinitive) => {
    const row = rowFor(parseCsv(), infinitive);
    const prefix = infinitive.slice(0, -'sätta'.length);
    expect(row.presens).toBe(`${prefix}sätter`);
    expect(row.preteritum).toBe(`${prefix}satte`);
    expect(row.supinum).toBe(`${prefix}satt`);
  });

  it.each([
    'förekomma',
    'återkomma',
    'åstadkomma',
    'uppkomma',
    'tillkomma',
    'framkomma',
    'inkomma',
    'utkomma',
    'ankomma',
    'omkomma',
    'undkomma',
  ])('"%s" inherits komma\'s kommer/xkom/xkommit conjugation', (infinitive) => {
    const row = rowFor(parseCsv(), infinitive);
    const prefix = infinitive.slice(0, -'komma'.length);
    expect(row.presens).toBe(`${prefix}kommer`);
    expect(row.preteritum).toBe(`${prefix}kom`);
    expect(row.supinum).toBe(`${prefix}kommit`);
  });

  it.each([
    'utgöra',
    'avgöra',
    'möjliggöra',
    'klargöra',
    'redogöra',
    'offentliggöra',
    'frigöra',
    'fullgöra',
    'tjänstgöra',
    'tydliggöra',
    'rengöra',
  ])('"%s" inherits göra\'s gör/xgjorde/xgjort conjugation', (infinitive) => {
    const row = rowFor(parseCsv(), infinitive);
    const prefix = infinitive.slice(0, -'göra'.length);
    expect(row.presens).toBe(`${prefix}gör`);
    expect(row.preteritum).toBe(`${prefix}gjorde`);
    expect(row.supinum).toBe(`${prefix}gjort`);
  });

  it.each([
    'innehålla',
    'behålla',
    'framhålla',
    'erhålla',
    'upprätthålla',
    'tillhandahålla',
    'bibehålla',
    'underhålla',
    'uppehålla',
    'förhålla',
  ])('"%s" inherits hålla\'s håller/xhöll/xhållit conjugation', (infinitive) => {
    const row = rowFor(parseCsv(), infinitive);
    const prefix = infinitive.slice(0, -'hålla'.length);
    expect(row.presens).toBe(`${prefix}håller`);
    expect(row.preteritum).toBe(`${prefix}höll`);
    expect(row.supinum).toBe(`${prefix}hållit`);
  });
});

describe('issue #42 - CEFR re-tag (shipped-50 audit, PR #298)', () => {
  // Local, minimal CSV reader (deliberately not shared with the "issue
  // #125" describe above -- its parseCsv/rowFor are function-scoped to that
  // block) covering only what these tests need: the cefr column keyed by
  // infinitive.
  type CsvCefrRow = { cefr: string; infinitive: string };

  function parseCsvCefr(): CsvCefrRow[] {
    const csvPath = join(here, '..', '..', 'docs', 'verb-data', 'candidates.csv');
    const csv = readFileSync(csvPath, 'utf-8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    return lines.slice(1).map((line) => {
      const [cefr = '', , infinitive = ''] = line.split(',');
      return { cefr, infinitive };
    });
  }

  function csvRowFor(infinitive: string): CsvCefrRow {
    const row = parseCsvCefr().find((r) => r.infinitive === infinitive);
    if (!row) throw new Error(`No CSV row found for infinitive "${infinitive}"`);
    return row;
  }

  // Issue #42: "unna", "kapa" and "te sig" were tagged A1 (a frequency
  // bucket, not a real beginner level) despite being formal/specialized/
  // literary register. #298 re-tags these three specific rows -- explicitly
  // named in the issue body -- in both the shipped table (VERB_DATA, what
  // actually ships to learners) and its CSV promotion queue. Only the cefr
  // field should move; forms, imperativ and grupp must be untouched so the
  // conjugation data itself stays correct.
  it.each([
    [
      'unna',
      'B2',
      { imperativ: 'unna', presens: 'unnar', preteritum: 'unnade', supinum: 'unnat', grupp: '1' },
    ],
    [
      'kapa',
      'B2',
      { imperativ: 'kapa', presens: 'kapar', preteritum: 'kapade', supinum: 'kapat', grupp: '1' },
    ],
    [
      'te sig',
      'C1',
      {
        imperativ: '',
        presens: 'ter sig',
        preteritum: 'tedde sig',
        supinum: 'tett sig',
        grupp: '3',
      },
    ],
  ] as const)(
    'VERB_DATA tags "%s" as %s, forms and grupp unchanged',
    (infinitive, expectedCefr, expected) => {
      const row = VERB_DATA.find((v) => v.infinitive === infinitive);
      expect(row, `expected a VERB_DATA row for "${infinitive}"`).toBeDefined();
      expect(row!.cefr).toBe(expectedCefr);
      expect(row!.imperativ).toBe(expected.imperativ);
      expect(row!.presens).toBe(expected.presens);
      expect(row!.preteritum).toBe(expected.preteritum);
      expect(row!.supinum).toBe(expected.supinum);
      expect(row!.grupp).toBe(expected.grupp);
    },
  );

  it.each([
    ['unna', 'B2'],
    ['kapa', 'B2'],
    ['te sig', 'C1'],
  ] as const)(
    'swedish_verbs.csv queue tags "%s" as %s to match the shipped table',
    (infinitive, expectedCefr) => {
      const row = csvRowFor(infinitive);
      expect(row.cefr).toBe(expectedCefr);
    },
  );

  // Regression for the exact defect issue #42 reported: before the retag,
  // "unna" (a formal-register verb) sat in the same CEFR bucket as genuine
  // beginner verbs like "vara"/"ha", so any A1-scoped consumer (e.g. the A1
  // free-practice pool) served it as if it were everyday vocabulary. This
  // pins the fixed bucket membership directly, independent of any UI.
  it('"unna" is no longer bucketed with genuine A1 verbs like "vara" and "ha"', () => {
    const vara = VERB_DATA.find((v) => v.infinitive === 'vara');
    const unna = VERB_DATA.find((v) => v.infinitive === 'unna');
    expect(vara?.cefr).toBe('A1');
    expect(unna?.cefr).not.toBe('A1');
  });

  // Acceptance criterion "shipped-50 re-tags applied (5 flagged rows in
  // audit)" names 5 flagged rows; PR #298's own description states only 3
  // are applied here and explicitly does not close #42. This test pins the
  // current, honest state of the shipped table rather than asserting a
  // count the PR does not claim to deliver -- so it stays green under this
  // PR's real scope and turns red the moment someone tags a table as "the
  // #42 fix" while silently dropping one of these three, without requiring
  // us to guess at the 2 unnamed rows from the audit.
  it('exactly the 3 rows named in issue #42 are non-A1 among unna/kapa/te sig/anse/finna', () => {
    const namesToCheck = ['unna', 'kapa', 'te sig', 'anse', 'finna'];
    const nonA1 = namesToCheck.filter((name) => {
      const row = VERB_DATA.find((v) => v.infinitive === name);
      return row !== undefined && row.cefr !== 'A1';
    });
    // "anse" and "finna" are flagged as strong candidates in the PR
    // description but explicitly deferred to a learning-designer policy
    // doc that does not exist yet -- they must still read A1 here. If this
    // assertion ever fails because they were quietly re-tagged without
    // that doc landing, that is exactly the kind of guessed-pedagogy
    // change CLAUDE.md reserves for learning-designer.
    expect(nonA1.sort()).toEqual(['kapa', 'te sig', 'unna']);
  });
});

// Issue #43 (docs/learning/2026-08-08-verb-data-conventions.md), implemented
// by PR #279/#360: lemma-column cleanup, the `note` field, reflexive-form
// audit, and CSV<->TS alternates sync. Section 6 of the decision doc lists
// the acceptance checks (AC1-AC10) this describe block pins directly.
describe('issue #43 - verb-data conventions (PR #279/#360)', () => {
  type FullCsvRow = {
    cefr: string;
    grammar: string;
    infinitive: string;
    imperativ: string;
    presens: string;
    preteritum: string;
    supinum: string;
    note: string;
  };

  function parseFullCsv(): FullCsvRow[] {
    const csvPath = join(here, '..', '..', 'docs', 'verb-data', 'candidates.csv');
    const csv = readFileSync(csvPath, 'utf-8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    return lines.slice(1).map((line) => {
      const [
        cefr = '',
        grammar = '',
        infinitive = '',
        imperativ = '',
        presens = '',
        preteritum = '',
        supinum = '',
        note = '',
      ] = line.split(',');
      return { cefr, grammar, infinitive, imperativ, presens, preteritum, supinum, note };
    });
  }

  function csvRowFor(infinitive: string): FullCsvRow {
    const row = parseFullCsv().find((r) => r.infinitive === infinitive);
    if (!row) throw new Error(`No CSV row found for infinitive "${infinitive}"`);
    return row;
  }

  // AC1: no cell in the infinitive column of CSV or TS contains "(", ")" or
  // "/" -- includes CSV line 1482 (betyg(s)sätta), resolved under C2b.
  describe('AC1 - clean lemma column, no parens or slash', () => {
    it('no CSV infinitive cell contains "(", ")" or "/"', () => {
      const offenders = parseFullCsv().filter((r) => /[()/]/.test(r.infinitive));
      expect(offenders.map((r) => r.infinitive)).toEqual([]);
    });

    it('no VERB_DATA.infinitive cell contains "(", ")" or "/"', () => {
      expect(VERB_DATA.filter((v) => /[()/]/.test(v.infinitive)).map((v) => v.infinitive)).toEqual(
        [],
      );
    });

    // Regression: CSV line 1482 used to store the lemma as "betyg(s)sätta".
    // C2b resolves this to a single clean spelling with the rejected
    // spelling (if any) moved to `note`, never left in the lemma itself.
    it('regression: CSV line 1482 (betyg(s)sätta) now stores a single clean lemma with no parentheses', () => {
      const row = csvRowFor('betygsätta');
      expect(row.infinitive).toBe('betygsätta');
    });

    // Regression: verbData.ts previously carried annotated lemmas like
    // "ta (el. taga)" and "ge (formellt giva)" before the C1 audit.
    it.each(['ta', 'ge'] as const)(
      'regression: VERB_DATA "%s" is a clean lemma (the parenthetical annotation moved to `note`)',
      (infinitive) => {
        const row = VERB_DATA.find((v) => v.infinitive === infinitive);
        expect(row).toBeDefined();
        expect(row?.infinitive).toBe(infinitive);
        expect(row?.note).toBeDefined();
        expect(row?.note!.length).toBeGreaterThan(0);
      },
    );
  });

  // AC2: the 15 reflexive lemmas are unchanged and carry "sig" in every
  // non-empty stored form; any stored reflexive imperativ uses "dig". Unlike
  // AC1/AC3/AC4/AC7/AC9 above, this data was already correct before #43 (the
  // linguist's audit confirmed it, rather than fixing it) -- "unchanged" is
  // literally the criterion -- so these checks hold against both the
  // pre-#43 and post-#43 CSV. The assertion logic itself is not a tautology:
  // it was verified separately against a deliberately-broken in-memory
  // fixture (missing "sig", imperativ using "sig" instead of "dig") outside
  // this suite before landing here.
  describe('AC2 - reflexive lemmas keep "sig", imperativ (if any) uses "dig"', () => {
    const REFLEXIVE_LEMMAS = [
      'te sig',
      'åta sig',
      'bry sig',
      'närma sig',
      'lämpa sig',
      'bege sig',
      'förhålla sig',
      'bete sig',
      'nöja sig',
      'motsätta sig',
      'utspela sig',
      'löna sig',
      'bosätta sig',
      'infinna sig',
      'förlita sig',
    ] as const;

    it('exactly these 15 reflexive lemmas are present in the CSV, unchanged', () => {
      const present = REFLEXIVE_LEMMAS.filter((name) =>
        parseFullCsv().some((r) => r.infinitive === name),
      );
      expect(present.slice().sort()).toEqual([...REFLEXIVE_LEMMAS].sort());
    });

    it.each(REFLEXIVE_LEMMAS)(
      '"%s" carries "sig" in the lemma and in every non-empty stored form',
      (name) => {
        const row = csvRowFor(name);
        expect(row.infinitive.endsWith(' sig')).toBe(true);
        for (const field of ['presens', 'preteritum', 'supinum'] as const) {
          if (row[field] !== '') {
            expect(row[field].endsWith(' sig')).toBe(true);
          }
        }
      },
    );

    it.each(REFLEXIVE_LEMMAS)(
      '"%s" never stores an imperativ ending in "sig" -- a stored reflexive imperativ must use "dig"',
      (name) => {
        const row = csvRowFor(name);
        if (row.imperativ !== '') {
          expect(row.imperativ.endsWith(' sig')).toBe(false);
          expect(row.imperativ.endsWith(' dig')).toBe(true);
        }
      },
    );
  });

  // AC3: every slash cell parses as form(/form)+ with no spaces; the
  // shipped TS rows with `alternates` have the first token as their field
  // value and the verified remainder in `alternates`; and, in the other
  // direction, every `alternates` entry in VERB_DATA has a matching "/"
  // cell in the CSV row for that lemma.
  describe('AC3 - slash-cell encoding and CSV<->TS alternates sync', () => {
    // This format contract already held for every pre-existing slash cell
    // (e.g. "sa/sade" was already spaceless before #43); #43 formalizes it
    // rather than fixing a violation reachable in this repo's history, so
    // it also holds against the pre-#43 CSV. The regex was checked against
    // a deliberately spaced fixture ("sa / sade") outside this suite to
    // confirm it is not a tautology.
    it('every "/"-containing conjugation cell in the CSV parses as form(/form)+ with no spaces', () => {
      const offenders: string[] = [];
      for (const row of parseFullCsv()) {
        for (const field of ['imperativ', 'presens', 'preteritum', 'supinum'] as const) {
          const value = row[field];
          if (value.includes('/') && !/^[^\s/]+(\/[^\s/]+)+$/.test(value)) {
            offenders.push(`${row.infinitive}.${field}="${value}"`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    // Regression for the exact defect the decision doc names: before #43,
    // the CSV cell for lägga's preteritum was plain "la" with no slash,
    // even though verbData.ts already shipped alternates: { preteritum:
    // ["lade"] }. This iterates every (verb, form) pair that carries
    // `alternates` in VERB_DATA today, so it also protects any future
    // shipped alternate pair, not just this one.
    it.each(
      VERB_DATA.filter((v) => v.alternates).flatMap((v) =>
        (Object.keys(v.alternates!) as AlternateFormField[]).map(
          (form) => [v.infinitive, form] as const,
        ),
      ),
    )(
      'VERB_DATA "%s" alternates on "%s" have a matching "/" cell in the CSV row for that lemma',
      (infinitive, form) => {
        const verb = VERB_DATA.find((v) => v.infinitive === infinitive)!;
        const csvRow = csvRowFor(infinitive);
        const cell = csvRow[form];
        expect(cell).toContain('/');
        const tokens = cell.split('/');
        expect(tokens[0]).toBe(verb[form]);
        expect(tokens.slice(1)).toEqual(verb.alternates![form]);
      },
    );

    // The other direction of the same sync contract: walk every CSV row
    // with a "/" cell, and where that lemma also has a shipped VERB_DATA
    // row, assert the TS field is token 0 and its alternates are the
    // remaining tokens. Most CSV rows have no VERB_DATA match at all (only
    // 56 verbs ship); those are skipped rather than asserted against.
    it('every CSV "/" cell with a matching VERB_DATA row keeps that field and its alternates in sync with the CSV tokens', () => {
      for (const row of parseFullCsv()) {
        const verb = VERB_DATA.find((v) => v.infinitive === row.infinitive);
        if (!verb) continue;
        for (const field of ['imperativ', 'presens', 'preteritum', 'supinum'] as const) {
          const value = row[field];
          if (!value.includes('/')) continue;
          const tokens = value.split('/');
          expect(verb[field]).toBe(tokens[0]);
          expect(verb.alternates?.[field]).toEqual(tokens.slice(1));
        }
      }
    });
  });

  // AC4: for each of the 9 rows + mala, a note names the classification
  // category (free variant / sense-conditioned / archaic-dropped) per form.
  // These rows are CSV-only (not shipped in VERB_DATA), so the "source
  // comment" the decision doc requires lands in the CSV `note` column
  // rather than a verbData.ts comment.
  describe('AC4 - classification note on the 9 slash rows + mala', () => {
    const NINE_ROWS_PLUS_MALA = [
      'säga',
      'betala',
      'tvinga',
      'växa',
      'sprida',
      'vika',
      'lyda',
      'begrava',
      'svälta',
      'mala',
    ] as const;

    it.each(NINE_ROWS_PLUS_MALA)('"%s" carries a non-empty classification note', (name) => {
      const row = csvRowFor(name);
      expect(row.note.length).toBeGreaterThan(0);
    });

    it.each(NINE_ROWS_PLUS_MALA)(
      '"%s" note names a recognized #43 category (free variant, sense-conditioned, verified-alternates marker, or archaic) -- a bare "C5:" prefix alone is not enough',
      (name) => {
        const row = csvRowFor(name);
        expect(row.note).toMatch(
          /fri variant|betydelsebetingat|verifierade|ålderdomlig|borttagen som overifierad|inga alternativformer/i,
        );
      },
    );

    // Regression: lyda and svälta are the two rows the decision doc names
    // explicitly as sense-conditioned (C6a); pin that their note actually
    // says so, not just "C5 free variant" like the other seven.
    it.each(['lyda', 'svälta'] as const)(
      '"%s" note is tagged sense-conditioned (C6a / "betydelsebetingat"), not just a free variant',
      (name) => {
        const row = csvRowFor(name);
        expect(row.note).toMatch(/C6a/);
        expect(row.note).toMatch(/betydelsebetingat/i);
      },
    );
  });

  // AC7: taga, giva, funka-forms and other note-only variants grade
  // incorrect. Full grading is exercised in src/lib/verbs.test.ts and
  // src/components/PracticeCard.test.tsx; this pins the CSV-side half of
  // the contract -- every annotated lemma's note explicitly marks its
  // named variant as not an accepted answer.
  describe('AC7 - note-only variants are explicitly marked "not accepted" in the CSV', () => {
    it.each(['ta', 'ge', 'be', 'klä', 'fotografera'] as const)(
      '"%s" note marks its named variant "accepteras ej" (not accepted as an answer)',
      (name) => {
        const row = csvRowFor(name);
        expect(row.note).toMatch(/accepteras ej/i);
      },
    );

    // "jämföra (förk. jfr)" is the one C2 exception: the annotation is a
    // dictionary abbreviation, not a variant form, and is dropped entirely
    // rather than moved to `note`.
    it('"jämföra" has an empty note: the "(förk. jfr)" annotation was dropped, not moved (C2 exception)', () => {
      const row = csvRowFor('jämföra');
      expect(row.note).toBe('');
    });
  });

  // AC8: VERB_DATA row order and length are unchanged (id stability until
  // #8 makes the infinitive the id). #43 only adds `note`/`alternatesNote`
  // fields and comments to existing rows -- it must not insert, delete or
  // reorder anything. Like AC2, this necessarily holds against both the
  // pre-#43 and post-#43 table (that is the criterion), so it is a forward
  // regression guard against the next edit rather than a fix this PR makes;
  // the comparison logic (array equality of an ordered id list) was checked
  // against a deliberately reordered fixture outside this suite to confirm
  // it is not a tautology.
  // Issue #415 appended 903 verified rows after the pinned 68 (byte-identical,
  // see verbData.orderPin.test.ts), so the total grew from 68 to 971, and
  // #372 appended the `checka` base row for a total of 972. The original
  // 68-row pinned order this test protects is unchanged and still checked
  // below against the first 68 entries.
  it('AC8: VERB_DATA has exactly the pinned 972 rows, with the original 68 still first and in the pinned order', () => {
    expect(VERB_DATA).toHaveLength(972);
    expect(VERB_DATA.slice(0, 68).map((v) => v.infinitive)).toEqual([
      'vara',
      'ha',
      'kunna',
      'unna',
      'få',
      'bli',
      'komma',
      'vilja',
      'göra',
      'finna',
      'ta',
      'se',
      'gå',
      'säga',
      'äga',
      'betyda',
      'ge',
      'skriva',
      'te sig',
      'riva',
      'börja',
      'tro',
      'tycka',
      'veta',
      'försöka',
      'behöva',
      'känna',
      'läsa',
      'ro',
      'låta',
      'stå',
      'visa',
      'använda',
      'vända',
      'hålla',
      'tänka',
      'söka',
      'ligga',
      'lägga',
      'anse',
      'öva',
      'handla',
      'öka',
      'skapa',
      'kapa',
      'gälla',
      'verka',
      'tala',
      'bära',
      'höra',
      'stänga',
      'sätta',
      'stiga',
      'hälsa',
      'bygga',
      'ställa',
      'slå',
      'dra',
      'köra',
      'arbeta',
      'hänga',
      'sitta',
      'falla',
      'kasta',
      'bryta',
      'åka',
      'plocka',
      'titta',
    ]);
  });

  // AC9: line 1482's lemma spelling and its presens/preteritum/supinum
  // cells use the same compound form.
  describe('AC9 - betygsätta lemma spelling matches its own paradigm cells', () => {
    it('presens/preteritum/supinum all inherit the single-s "betygsätta" spelling, not the rejected double-s doublet', () => {
      const row = csvRowFor('betygsätta');
      expect(row.presens).toBe('betygsätter');
      expect(row.preteritum).toBe('betygsatte');
      expect(row.supinum).toBe('betygsatt');
    });

    it('no cell in the betygsätta row (other than `note`) contains the rejected double-s spelling', () => {
      const row = csvRowFor('betygsätta');
      for (const field of [
        'infinitive',
        'imperativ',
        'presens',
        'preteritum',
        'supinum',
      ] as const) {
        expect(row[field]).not.toMatch(/betygss/i);
      }
      // The rejected spelling is only named, recognition-only, in `note`.
      expect(row.note).toMatch(/betygss/i);
    });
  });

  // AC10: after the C1 cleanup, every lemma in the CSV infinitive column is
  // unique, and every VERB_DATA.infinitive is unique -- the #8 id depends
  // on it. As with AC2/AC8, uniqueness already held before #43 (the C1
  // cleanup removed annotations, it did not deduplicate rows), so this is a
  // forward guard for #8; the duplicate-counting logic was checked against
  // a fixture with a deliberate duplicate outside this suite.
  describe('AC10 - lemma uniqueness', () => {
    it('every CSV infinitive appears exactly once', () => {
      const counts = new Map<string, number>();
      for (const row of parseFullCsv()) {
        counts.set(row.infinitive, (counts.get(row.infinitive) ?? 0) + 1);
      }
      const dups = [...counts.entries()].filter(([, count]) => count > 1).map(([inf]) => inf);
      expect(dups).toEqual([]);
    });

    it('every VERB_DATA.infinitive appears exactly once', () => {
      const counts = new Map<string, number>();
      for (const verb of VERB_DATA) {
        counts.set(verb.infinitive, (counts.get(verb.infinitive) ?? 0) + 1);
      }
      const dups = [...counts.entries()].filter(([, count]) => count > 1).map(([inf]) => inf);
      expect(dups).toEqual([]);
    });
  });

  // Guard, not an acceptance check by number: the "note" column is the
  // eighth CSV column, and the decision doc (section 5, step 3) flags that
  // a note containing an unquoted comma would silently break the bare-split
  // parser this test file and #125's audit both use. Pin that every data
  // row splits into exactly 8 fields, so a future note with an embedded
  // comma fails loudly here instead of shifting every field after it.
  it('every CSV data row splits into exactly 8 comma-separated fields (no unescaped comma in `note`)', () => {
    const csvPath = join(here, '..', '..', 'docs', 'verb-data', 'candidates.csv');
    const csv = readFileSync(csvPath, 'utf-8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const offenders = lines.slice(1).filter((line) => line.split(',').length !== 8);
    expect(offenders).toEqual([]);
  });

  // The CSV header itself gained the `note` column under #43; pin it so a
  // future edit can't silently drop or rename it out from under every test
  // in this describe block.
  it('the CSV header names 8 columns ending in "note"', () => {
    const csvPath = join(here, '..', '..', 'docs', 'verb-data', 'candidates.csv');
    const csv = readFileSync(csvPath, 'utf-8');
    const header = csv.split(/\r?\n/)[0]!.split(',');
    expect(header).toEqual([
      'cefr levels',
      'grammar',
      'infinitive',
      'imperativ',
      'presens',
      'preteritum',
      'supinum',
      'note',
    ]);
  });
});

// Issue #369 (PR #382): top-12 base verbs appended to unblock 161
// particle-verb entries (#330). Pins the exact conjugated forms shipped for
// each new row, independent of the generic character/grupp-membership
// checks above, which would pass on a plausible-looking but linguistically
// wrong form (e.g. a wrong preteritum still made of valid Swedish letters).
// A silently wrong form here teaches the learner something false.
describe('issue #369 - top-12 base verbs for particle-verb unblocking (PR #382)', () => {
  const EXPECTED_NEW_ROWS = [
    {
      cefr: 'A1',
      infinitive: 'slå',
      imperativ: 'slå',
      presens: 'slår',
      preteritum: 'slog',
      supinum: 'slagit',
      grupp: '4',
    },
    {
      cefr: 'A1',
      infinitive: 'dra',
      imperativ: 'dra',
      presens: 'drar',
      preteritum: 'drog',
      supinum: 'dragit',
      grupp: '4',
    },
    {
      cefr: 'A1',
      infinitive: 'köra',
      imperativ: 'kör',
      presens: 'kör',
      preteritum: 'körde',
      supinum: 'kört',
      grupp: '2a',
    },
    {
      cefr: 'A1',
      infinitive: 'arbeta',
      imperativ: 'arbeta',
      presens: 'arbetar',
      preteritum: 'arbetade',
      supinum: 'arbetat',
      grupp: '1',
    },
    {
      cefr: 'A1',
      infinitive: 'hänga',
      imperativ: 'häng',
      presens: 'hänger',
      preteritum: 'hängde',
      supinum: 'hängt',
      grupp: '2a',
    },
    {
      cefr: 'A1',
      infinitive: 'sitta',
      imperativ: 'sitt',
      presens: 'sitter',
      preteritum: 'satt',
      supinum: 'suttit',
      grupp: '4',
    },
    {
      cefr: 'A1',
      infinitive: 'falla',
      imperativ: 'fall',
      presens: 'faller',
      preteritum: 'föll',
      supinum: 'fallit',
      grupp: '4',
    },
    {
      cefr: 'A1',
      infinitive: 'kasta',
      imperativ: 'kasta',
      presens: 'kastar',
      preteritum: 'kastade',
      supinum: 'kastat',
      grupp: '1',
    },
    {
      cefr: 'A1',
      infinitive: 'bryta',
      imperativ: 'bryt',
      presens: 'bryter',
      preteritum: 'bröt',
      supinum: 'brutit',
      grupp: '4',
    },
    {
      cefr: 'A1',
      infinitive: 'åka',
      imperativ: 'åk',
      presens: 'åker',
      preteritum: 'åkte',
      supinum: 'åkt',
      grupp: '2b',
    },
    {
      cefr: 'A2',
      infinitive: 'plocka',
      imperativ: 'plocka',
      presens: 'plockar',
      preteritum: 'plockade',
      supinum: 'plockat',
      grupp: '1',
    },
    {
      cefr: 'A1',
      infinitive: 'titta',
      imperativ: 'titta',
      presens: 'tittar',
      preteritum: 'tittade',
      supinum: 'tittat',
      grupp: '1',
    },
  ] as const;

  it.each(EXPECTED_NEW_ROWS)(
    'pins the exact stored forms for "$infinitive" (cefr/imperativ/presens/preteritum/supinum/grupp)',
    (expected) => {
      const row = VERB_DATA.find((v) => v.infinitive === expected.infinitive);
      expect(row).toBeDefined();
      expect(row).toMatchObject(expected);
    },
  );

  // Issue #415 appended 903 more verified rows after these 12 (byte-identical
  // up through the original 68, see verbData.orderPin.test.ts), so these 12
  // are no longer the *last* 12 rows in VERB_DATA -- they are still rows
  // 56-67 (0-indexed), the same position PR #382 put them in, with the 903
  // new rows appended after index 67. #372 appended one more row (`checka`)
  // after the 903.
  it('adds VERB_DATA.length === 56 + 12 + 903 + 1, with rows 56-67 equal to EXPECTED_NEW_ROWS in order', () => {
    expect(VERB_DATA).toHaveLength(56 + 12 + 903 + 1);
    const rows56to67 = VERB_DATA.slice(56, 68).map((v) => v.infinitive);
    expect(rows56to67).toEqual(EXPECTED_NEW_ROWS.map((row) => row.infinitive));
  });

  it('assigns none of the 12 new rows an `alternates` field, and only `dra` a `note` field for its archaic variant', () => {
    for (const expected of EXPECTED_NEW_ROWS) {
      const row = VERB_DATA.find((v) => v.infinitive === expected.infinitive);
      expect(row?.alternates).toBeUndefined();
      if (expected.infinitive === 'dra') {
        expect(row?.note).toMatch(/draga/);
      } else {
        expect(row?.note).toBeUndefined();
      }
    }
  });

  // Cross-check against docs/verb-data/candidates.csv: every new base verb
  // already has a candidate row there (from the historical 1537-row CSV),
  // so the TS conjugated forms and CEFR tag must not contradict it. This
  // does not require byte-identical CSV rows (the CSV's imperativ column is
  // still blank for several of these, matching the long-standing #132
  // imperativ-audit gap that TS alone fills in) but the CEFR and the four
  // conjugated forms shared by both files must agree.
  it.each(EXPECTED_NEW_ROWS)(
    'CEFR and conjugated forms for "$infinitive" do not contradict its docs/verb-data/candidates.csv candidate row',
    (expected) => {
      const csvPath = join(here, '..', '..', 'docs', 'verb-data', 'candidates.csv');
      const csv = readFileSync(csvPath, 'utf-8');
      const lines = csv.split(/\r?\n/).filter(Boolean);
      const csvRow = lines
        .slice(1)
        .map((line) => line.split(','))
        .find(([, , infinitive]) => infinitive === expected.infinitive);

      expect(csvRow).toBeDefined();
      const [cefr, , , , presens, preteritum, supinum] = csvRow!;
      expect(cefr).toBe(expected.cefr);
      expect(presens).toBe(expected.presens);
      expect(preteritum).toBe(expected.preteritum);
      expect(supinum).toBe(expected.supinum);
    },
  );
});
