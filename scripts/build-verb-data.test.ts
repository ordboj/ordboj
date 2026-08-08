// Black-box tests for scripts/build-verb-data.mjs (issue #41 / PR #290).
//
// The script is a standalone Node entrypoint (it calls main() unconditionally
// at import time and resolves CSV_PATH / VERB_DATA_PATH / REVIEW_PATH from its
// OWN file location via import.meta.url). That means:
//   - it cannot be unit-imported into a vitest module graph without running
//     its file-writing side effects against whatever paths it resolves to;
//   - it has no exported functions to call directly.
// So these tests spawn it as a real child process, twice:
//   (a) against synthetic fixture "repos" (tmp dirs shaped like
//       scripts/ + public/data/ + src/data/) built per test, to pin exact
//       classifier/gate contracts without depending on the real CSV's
//       ~1538 rows drifting the assertions over time; and
//   (b) once, read-only (--check), against the REAL repo files, to lock in
//       the acceptance criterion "the shipped table has zero validator
//       failures" as a live regression gate rather than a one-time claim in
//       a PR description.
//
// Mock-only-boundary rule: this test does not stub node:fs/node:child_process
// (those are the OS boundary, not the module under test) and does not import
// or execute the script's internals directly — it observes the same
// stdout/stderr/exit-code/file-system contract a human running
// `npm run build:verb-data` would see.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, '..');
const REAL_SCRIPT_PATH = join(TEST_DIR, 'build-verb-data.mjs');

// ---------------------------------------------------------------------
// Fixture-repo helpers
// ---------------------------------------------------------------------
function buildCsv(rows: Array<Record<string, string>>): string {
  const header = 'cefr levels,grammar,infinitive,imperativ,presens,preteritum,supinum';
  const lines = rows.map((r) =>
    [
      r.cefr ?? 'A1',
      r.grammar ?? 'att',
      r.infinitive,
      r.imperativ,
      r.presens,
      r.preteritum,
      r.supinum,
    ].join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

function verbRow(f: {
  cefr?: string;
  infinitive: string;
  imperativ: string;
  presens: string;
  preteritum: string;
  supinum: string;
  grupp?: string;
  noNaturalImperativ?: boolean;
  comment?: string;
}): string {
  let s =
    `  { cefr: "${f.cefr ?? 'A1'}", infinitive: "${f.infinitive}", imperativ: "${f.imperativ}", ` +
    `presens: "${f.presens}", preteritum: "${f.preteritum}", supinum: "${f.supinum}"`;
  if (f.grupp !== undefined) s += `, grupp: "${f.grupp}"`;
  if (f.noNaturalImperativ) s += `, noNaturalImperativ: true`;
  s += ' },';
  if (f.comment) s += ` // ${f.comment}`;
  return s;
}

function buildVerbDataTs(rowLines: string[], eol: '\n' | '\r\n' = '\n'): string {
  return ['export const VERB_DATA: VerbData[] = [', ...rowLines, '];'].join(eol) + eol;
}

const VALID_SHIPPED_ROW = verbRow({
  infinitive: 'kalla',
  imperativ: 'kalla',
  presens: 'kallar',
  preteritum: 'kallade',
  supinum: 'kallat',
  grupp: '1',
});

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'build-verb-data-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function setupFixture(csv: string, verbDataTs: string): void {
  mkdirSync(join(tmpRoot, 'scripts'), { recursive: true });
  mkdirSync(join(tmpRoot, 'public', 'data'), { recursive: true });
  mkdirSync(join(tmpRoot, 'src', 'data'), { recursive: true });
  copyFileSync(REAL_SCRIPT_PATH, join(tmpRoot, 'scripts', 'build-verb-data.mjs'));
  writeFileSync(join(tmpRoot, 'public', 'data', 'swedish_verbs.csv'), csv, 'utf8');
  writeFileSync(join(tmpRoot, 'src', 'data', 'verbData.ts'), verbDataTs, 'utf8');
}

function run(args: string[] = []): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [join(tmpRoot, 'scripts', 'build-verb-data.mjs'), ...args],
    { cwd: tmpRoot, encoding: 'utf8' },
  );
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function reviewPath(): string {
  return join(tmpRoot, 'scripts', 'verb-data-review.csv');
}

function verbDataPath(): string {
  return join(tmpRoot, 'src', 'data', 'verbData.ts');
}

// Minimal CSV-row-line parser for the review file's own quoted-CSV format,
// written independently from the script's splitCsvLine (this test does not
// call into the module under test).
function findReviewRow(
  reviewCsv: string,
  infinitive: string,
): { grupp: string; status: string; reasons: string } {
  const re = /^(\d+),"([^"]*)","(.*)",([^,]*),([^,]*),"(.*)"$/;
  for (const line of reviewCsv.split('\n')) {
    const m = re.exec(line);
    if (m && m[3] === infinitive) {
      // Undo the writer's CSV double-quote escaping (`"` -> `""`) so
      // assertions can compare against the plain, unescaped reason text.
      return { grupp: m[4], status: m[5], reasons: m[6].replace(/""/g, '"') };
    }
  }
  throw new Error(`no review row found for infinitive "${infinitive}" in:\n${reviewCsv}`);
}

// ---------------------------------------------------------------------
// Classifier + validator contract (via the CSV audit / review file)
// ---------------------------------------------------------------------
describe('CSV row classification (review file)', () => {
  const csv = buildCsv([
    // grupp 1: regular -ar/-ade/-at
    {
      infinitive: 'kalla',
      imperativ: 'kalla',
      presens: 'kallar',
      preteritum: 'kallade',
      supinum: 'kallat',
    },
    // grupp 2a: voiced stem, -er/-de/-t
    {
      infinitive: 'ringa',
      imperativ: 'ring',
      presens: 'ringer',
      preteritum: 'ringde',
      supinum: 'ringt',
    },
    // grupp 2b: voiceless stem, -er/-te/-t
    {
      infinitive: 'köpa',
      imperativ: 'köp',
      presens: 'köper',
      preteritum: 'köpte',
      supinum: 'köpt',
    },
    // presens implies grupp 1, preteritum/supinum imply grupp 2a: contradiction
    {
      infinitive: 'bakva',
      imperativ: 'bakv',
      presens: 'bakvar',
      preteritum: 'bakvde',
      supinum: 'bakvt',
    },
    // matches the 2a (voiced) -de pattern but the stem ends in voiceless "k":
    // the CLAUDE.md "most common data error" case
    {
      infinitive: 'väka',
      imperativ: 'väk',
      presens: 'väker',
      preteritum: 'väkde',
      supinum: 'väkt',
    },
    // charset violation: hyphen in imperativ
    {
      infinitive: 'hoppa',
      imperativ: 'hopp-a',
      presens: 'hoppar',
      preteritum: 'hoppade',
      supinum: 'hoppat',
    },
    // empty imperativ, non-modal, otherwise perfectly regular grupp 1
    {
      infinitive: 'vimla',
      imperativ: '',
      presens: 'vimlar',
      preteritum: 'vimlade',
      supinum: 'vimlat',
    },
    // empty imperativ, modal verb (closed MODAL_VERBS list) — not a failure
    { infinitive: 'kunna', imperativ: '', presens: 'kan', preteritum: 'kunde', supinum: 'kunnat' },
    // deponens: infinitive/presens/preteritum/supinum all end in "s"
    {
      infinitive: 'hoppas',
      imperativ: 'hoppas',
      presens: 'hoppas',
      preteritum: 'hoppades',
      supinum: 'hoppats',
    },
    // grupp 3: short stem, -r/-dde/-tt
    { infinitive: 'bo', imperativ: 'bo', presens: 'bor', preteritum: 'bodde', supinum: 'bott' },
    // particle verb: the particle must be stripped before classifying, and
    // the bare verb here is the same regular grupp-2a shape as "ringa"
    {
      infinitive: 'ringa upp',
      imperativ: 'ring upp',
      presens: 'ringer upp',
      preteritum: 'ringde upp',
      supinum: 'ringt upp',
    },
    // particle present in the infinitive but NOT confirmed across all three
    // conjugated forms (a "ringa bort" row whose presens forgot the
    // particle) — must fall through to needs-check, not crash or misclassify
    {
      infinitive: 'ringa bort',
      imperativ: 'ring bort',
      presens: 'ringer',
      preteritum: 'ringde bort',
      supinum: 'ringt bort',
    },
    // genuinely irregular verb (real Swedish "komma"): presens matches a
    // grupp-2 shape but preteritum/supinum match no mechanical pattern at
    // all — must defer to needs-check, never a guessed contradiction
    {
      infinitive: 'komma',
      imperativ: 'kom',
      presens: 'kommer',
      preteritum: 'kom',
      supinum: 'kommit',
    },
  ]);

  function reviewFileAfterRun(): string {
    setupFixture(csv, buildVerbDataTs([VALID_SHIPPED_ROW]));
    const result = run();
    expect(result.status).toBe(0);
    return readFileSync(reviewPath(), 'utf8');
  }

  it('classifies a regular grupp 1 verb as pass', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'kalla');
    expect(row).toEqual({ grupp: '1', status: 'pass', reasons: '' });
  });

  it('classifies a regular voiced-stem grupp 2a verb as pass', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'ringa');
    expect(row).toEqual({ grupp: '2a', status: 'pass', reasons: '' });
  });

  it('classifies a regular voiceless-stem grupp 2b verb as pass', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'köpa');
    expect(row).toEqual({ grupp: '2b', status: 'pass', reasons: '' });
  });

  it('rejects a row whose presens and preteritum/supinum imply different grupp families', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'bakva');
    expect(row.status).toBe('fail');
    expect(row.grupp).toBe('');
    expect(row.reasons).toContain(
      'contradiction: presens "bakvar" implies grupp 1 but preteritum/supinum imply grupp 2a',
    );
  });

  it('rejects a 2a-shaped preteritum on a voiceless stem (voiced/voiceless data error)', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'väka');
    expect(row.status).toBe('fail');
    expect(row.reasons).toContain(
      'stem "väk" ends in voiceless "k" (k/p/t/s/x) but preteritum "väkde" is the grupp 2a (voiced) -de pattern; expected grupp 2b -te',
    );
  });

  it('rejects a row with a character outside a-zåäöé and space', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'hoppa');
    expect(row.status).toBe('fail');
    expect(row.reasons).toContain('charset: imperativ="hopp-a"');
  });

  it('rejects an empty imperativ on a non-modal verb, even when otherwise fully regular', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'vimla');
    expect(row.status).toBe('fail');
    expect(row.reasons).toContain('empty imperativ on non-modal verb');
  });

  it('does not fail an empty imperativ on a closed-list modal verb', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'kunna');
    expect(row.status).not.toBe('fail');
    expect(row.reasons).toBe('');
  });

  it('classifies a deponens verb (all forms end in "s")', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'hoppas');
    expect(row).toEqual({ grupp: 'deponens', status: 'pass', reasons: '' });
  });

  it('classifies a grupp 3 short-stem verb', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'bo');
    expect(row).toEqual({ grupp: '3', status: 'pass', reasons: '' });
  });

  it("strips a confirmed particle before classifying (particle verb gets the bare verb's grupp)", () => {
    const row = findReviewRow(reviewFileAfterRun(), 'ringa upp');
    expect(row).toEqual({ grupp: '2a', status: 'pass', reasons: '' });
  });

  it('defers to needs-check, without crashing or misclassifying, when the particle is not confirmed across all forms', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'ringa bort');
    expect(row.status).toBe('needs-check');
    expect(row.reasons).toBe('');
  });

  it('defers a genuinely irregular verb to needs-check rather than flagging a false contradiction', () => {
    const row = findReviewRow(reviewFileAfterRun(), 'komma');
    expect(row.status).toBe('needs-check');
    expect(row.reasons).toBe('');
  });

  it('never includes a fail or needs-check row anywhere in verbData.ts', () => {
    setupFixture(csv, buildVerbDataTs([VALID_SHIPPED_ROW]));
    run();
    const verbDataText = readFileSync(verbDataPath(), 'utf8');
    // None of the fail/needs-check infinitives from this fixture's CSV were
    // promoted (NEW_PROMOTIONS is empty in this ticket, but this pins the
    // *observable* guarantee: bad rows never reach the shipped file).
    for (const bad of ['bakva', 'väka', 'hoppa', 'vimla', 'ringa bort']) {
      expect(verbDataText).not.toContain(`infinitive: "${bad}"`);
    }
  });
});

// ---------------------------------------------------------------------
// Shipped-table gate ("zero validator failures" enforced, not aspirational)
// ---------------------------------------------------------------------
describe('shipped verbData.ts validation gate', () => {
  const trivialCsv = buildCsv([
    {
      infinitive: 'kalla',
      imperativ: 'kalla',
      presens: 'kallar',
      preteritum: 'kallade',
      supinum: 'kallat',
    },
  ]);

  it('exits 0 and reports zero failures for a clean shipped row', () => {
    setupFixture(trivialCsv, buildVerbDataTs([VALID_SHIPPED_ROW]));
    const result = run(['--check']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Shipped table: 1 rows, 0 validator failures');
  });

  it('fails the build (exit 1) when a shipped row has a charset violation', () => {
    setupFixture(
      trivialCsv,
      buildVerbDataTs([
        verbRow({
          infinitive: 'kalla',
          imperativ: 'kall-a',
          presens: 'kallar',
          preteritum: 'kallade',
          supinum: 'kallat',
          grupp: '1',
        }),
      ]),
    );
    const result = run(['--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAIL: 1 shipped row(s)');
    expect(result.stderr).toContain('kalla');
    expect(result.stderr).toContain('charset: imperativ="kall-a"');
  });

  it('fails the build when a shipped row declares a grupp that contradicts its own forms', () => {
    setupFixture(
      trivialCsv,
      buildVerbDataTs([
        verbRow({
          infinitive: 'kalla',
          imperativ: 'kalla',
          presens: 'kallar',
          preteritum: 'kallade',
          supinum: 'kallat',
          grupp: '2b', // forms are unambiguously grupp 1
        }),
      ]),
    );
    const result = run(['--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('row declares grupp "2b" but forms match grupp "1"');
  });

  it('fails the build when grupp is omitted without a NEEDS HUMAN REVIEW comment', () => {
    setupFixture(
      trivialCsv,
      buildVerbDataTs([
        verbRow({
          infinitive: 'kalla',
          imperativ: 'kalla',
          presens: 'kallar',
          preteritum: 'kallade',
          supinum: 'kallat',
          // no grupp, no comment
        }),
      ]),
    );
    const result = run(['--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('grupp omitted without a NEEDS HUMAN REVIEW comment');
  });

  it('accepts grupp omitted WITH a NEEDS HUMAN REVIEW comment', () => {
    setupFixture(
      trivialCsv,
      buildVerbDataTs([
        verbRow({
          infinitive: 'kalla',
          imperativ: 'kalla',
          presens: 'kallar',
          preteritum: 'kallade',
          supinum: 'kallat',
          comment: 'NEEDS HUMAN REVIEW: grupp unconfirmed',
        }),
      ]),
    );
    const result = run(['--check']);
    expect(result.status).toBe(0);
  });

  it('does not double-flag an empty imperativ on a non-modal verb when noNaturalImperativ is set', () => {
    setupFixture(
      trivialCsv,
      buildVerbDataTs([
        verbRow({
          infinitive: 'vimla',
          imperativ: '',
          presens: 'vimlar',
          preteritum: 'vimlade',
          supinum: 'vimlat',
          grupp: '1',
          noNaturalImperativ: true,
        }),
      ]),
    );
    const result = run(['--check']);
    expect(result.status).toBe(0);
  });

  it('fails an empty imperativ on a non-modal verb that has no escape-hatch marker at all', () => {
    setupFixture(
      trivialCsv,
      buildVerbDataTs([
        verbRow({
          infinitive: 'vimla',
          imperativ: '',
          presens: 'vimlar',
          preteritum: 'vimlade',
          supinum: 'vimlat',
          grupp: '1',
        }),
      ]),
    );
    const result = run(['--check']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('empty imperativ on non-modal verb');
  });
});

// ---------------------------------------------------------------------
// Round-trip, --check side-effect isolation, determinism
// ---------------------------------------------------------------------
describe('output contract', () => {
  const trivialCsv = buildCsv([
    {
      infinitive: 'kalla',
      imperativ: 'kalla',
      presens: 'kallar',
      preteritum: 'kallade',
      supinum: 'kallat',
    },
  ]);

  it('--check never writes the review file or verbData.ts', () => {
    const original = buildVerbDataTs([VALID_SHIPPED_ROW]);
    setupFixture(trivialCsv, original);
    const result = run(['--check']);
    expect(result.status).toBe(0);
    expect(existsSync(reviewPath())).toBe(false);
    expect(readFileSync(verbDataPath(), 'utf8')).toBe(original);
  });

  it('a normal run writes the review file and re-emits verbData.ts byte-identical (no promotions this ticket)', () => {
    const original = buildVerbDataTs([VALID_SHIPPED_ROW]);
    setupFixture(trivialCsv, original);
    const result = run();
    expect(result.status).toBe(0);
    expect(existsSync(reviewPath())).toBe(true);
    expect(readFileSync(verbDataPath(), 'utf8')).toBe(original);
  });

  it('round-trips a CRLF-line-ended verbData.ts byte-identically', () => {
    const original = buildVerbDataTs([VALID_SHIPPED_ROW], '\r\n');
    expect(original).toContain('\r\n');
    setupFixture(trivialCsv, original);
    const result = run();
    expect(result.status).toBe(0);
    expect(readFileSync(verbDataPath(), 'utf8')).toBe(original);
  });

  it('round-trips an LF-line-ended verbData.ts byte-identically', () => {
    const original = buildVerbDataTs([VALID_SHIPPED_ROW], '\n');
    expect(original).not.toContain('\r\n');
    setupFixture(trivialCsv, original);
    const result = run();
    expect(result.status).toBe(0);
    expect(readFileSync(verbDataPath(), 'utf8')).toBe(original);
  });

  it('is deterministic: two consecutive runs produce byte-identical review files', () => {
    setupFixture(trivialCsv, buildVerbDataTs([VALID_SHIPPED_ROW]));
    const first = run();
    expect(first.status).toBe(0);
    const firstReview = readFileSync(reviewPath(), 'utf8');
    const second = run();
    expect(second.status).toBe(0);
    const secondReview = readFileSync(reviewPath(), 'utf8');
    expect(secondReview).toBe(firstReview);
  });
});

// ---------------------------------------------------------------------
// npm script / CI wiring (static config regression, real repo files)
// ---------------------------------------------------------------------
describe('npm script and CI wiring', () => {
  it('package.json exposes build:verb-data and build:verb-data:check', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['build:verb-data']).toBe('node scripts/build-verb-data.mjs');
    expect(pkg.scripts['build:verb-data:check']).toBe('node scripts/build-verb-data.mjs --check');
  });

  it('CI runs the --check variant as its own job', () => {
    const ci = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain('build-verb-data-check');
    expect(ci).toContain('npm run build:verb-data:check');
  });
});

// ---------------------------------------------------------------------
// Live regression gate against the REAL repo files (read-only, --check)
// ---------------------------------------------------------------------
describe('real repo: shipped table validity (regression gate)', () => {
  it('the actually-shipped VERB_DATA table has zero validator failures right now', () => {
    const result = spawnSync(process.execPath, [REAL_SCRIPT_PATH, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0 validator failures');
  });

  it('every row of the real CSV gets a verdict (no rows silently dropped)', () => {
    const csvText = readFileSync(join(REPO_ROOT, 'public', 'data', 'swedish_verbs.csv'), 'utf8');
    const nonEmptyLines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const expectedRowCount = nonEmptyLines.length - 1; // minus header

    const result = spawnSync(process.execPath, [REAL_SCRIPT_PATH, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`CSV audit: ${expectedRowCount} rows`);
  });
});
