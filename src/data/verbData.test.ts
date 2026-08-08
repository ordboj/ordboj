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
    const csvPath = join(here, '..', '..', 'public', 'data', 'swedish_verbs.csv');
    const csv = readFileSync(csvPath, 'utf-8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    return lines.slice(1).map((line) => {
      const [cefr, grammar, infinitive, imperativ, presens, preteritum, supinum] = line.split(',');
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
