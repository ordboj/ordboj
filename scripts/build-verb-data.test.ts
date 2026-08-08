// Pins the validating verb-data promotion pipeline (issue #41,
// scripts/build-verb-data.mjs) to its acceptance criteria:
//   - classifies rows into grupp 1/2a/2b/3/4/deponens
//   - rejects form-class contradictions
//   - rejects non-allowed characters
//   - rejects empty imperativ on non-modal verbs (unless derivable)
//   - never ships a failing row
//   - output is deterministic
//   - the shipped verbData.ts has zero validator failures
//
// The script is production code (owned outside `qa`) — these tests invoke
// it as a subprocess against throwaway fixture directories. They never
// mutate the real repo's src/data/verbData.ts or scripts/verb-data-review.csv.

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..');
const REAL_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'build-verb-data.mjs');
const REAL_CSV_PATH = path.join(REPO_ROOT, 'public', 'data', 'swedish_verbs.csv');
const REAL_VERB_DATA_PATH = path.join(REPO_ROOT, 'src', 'data', 'verbData.ts');
const REAL_REVIEW_PATH = path.join(REPO_ROOT, 'scripts', 'verb-data-review.csv');

const CSV_HEADER = 'cefr levels,grammar,infinitive,imperativ,presens,preteritum,supinum';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Sets up an isolated ROOT (scripts/, public/data/, src/data/) with a copy
// of the real script and a caller-supplied CSV body, then runs it. Because
// the script derives every path from its own file location, copying it into
// a throwaway directory fully isolates file-system side effects from the
// real repo.
function runPipeline(csvBody: string, args: string[] = []) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verb-data-pipeline-'));
  tmpDirs.push(tmpDir);

  fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'public', 'data'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'src', 'data'), { recursive: true });

  const scriptPath = path.join(tmpDir, 'scripts', 'build-verb-data.mjs');
  fs.copyFileSync(REAL_SCRIPT_PATH, scriptPath);
  fs.writeFileSync(path.join(tmpDir, 'public', 'data', 'swedish_verbs.csv'), csvBody, 'utf-8');

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: tmpDir,
    encoding: 'utf-8',
  });

  const outPath = path.join(tmpDir, 'src', 'data', 'verbData.ts');
  const reviewPath = path.join(tmpDir, 'scripts', 'verb-data-review.csv');

  return {
    result,
    tmpDir,
    verbDataText: fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf-8') : null,
    reviewText: fs.existsSync(reviewPath) ? fs.readFileSync(reviewPath, 'utf-8') : null,
  };
}

function csvLine(fields: {
  cefr?: string;
  grammar?: string;
  infinitive: string;
  imperativ?: string;
  presens: string;
  preteritum: string;
  supinum: string;
}) {
  const {
    cefr = 'A1',
    grammar = 'verb',
    infinitive,
    imperativ = '',
    presens,
    preteritum,
    supinum,
  } = fields;
  return [cefr, grammar, infinitive, imperativ, presens, preteritum, supinum].join(',');
}

function reviewRow(reviewText: string, infinitive: string): string | undefined {
  return reviewText.split('\n').find((line) => line.split(',')[2] === infinitive);
}

// The script always writes '\n' line endings; git on this machine (core.autocrlf)
// checks committed files out with '\r\n'. Normalize before comparing so the
// assertion is about content, not the local checkout's line-ending policy.
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('build-verb-data.mjs — golden output against the real CSV', () => {
  it('run against the real swedish_verbs.csv reproduces the checked-in verbData.ts byte-for-byte', () => {
    const realCsv = fs.readFileSync(REAL_CSV_PATH, 'utf-8');
    const { result, verbDataText } = runPipeline(realCsv);
    expect(result.status).toBe(0);
    expect(verbDataText).not.toBeNull();
    const checkedIn = fs.readFileSync(REAL_VERB_DATA_PATH, 'utf-8');
    expect(normalizeEol(verbDataText!)).toBe(normalizeEol(checkedIn));
  });

  it('run against the real swedish_verbs.csv reproduces the checked-in review CSV byte-for-byte', () => {
    const realCsv = fs.readFileSync(REAL_CSV_PATH, 'utf-8');
    const { reviewText } = runPipeline(realCsv);
    expect(reviewText).not.toBeNull();
    const checkedIn = fs.readFileSync(REAL_REVIEW_PATH, 'utf-8');
    expect(normalizeEol(reviewText!)).toBe(normalizeEol(checkedIn));
  });

  it('--check reports zero validator failures on the promoted (shipped) rows', () => {
    const realCsv = fs.readFileSync(REAL_CSV_PATH, 'utf-8');
    const { result } = runPipeline(realCsv, ['--check', '--all']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Promoted rows: 50\/50 validated, 0 failures\./);
  });

  it('is deterministic: two independent runs against the same CSV produce byte-identical output', () => {
    const realCsv = fs.readFileSync(REAL_CSV_PATH, 'utf-8');
    const run1 = runPipeline(realCsv);
    const run2 = runPipeline(realCsv);
    expect(run1.verbDataText).not.toBeNull();
    expect(run1.verbDataText).toBe(run2.verbDataText);
    expect(run1.reviewText).not.toBeNull();
    expect(run1.reviewText).toBe(run2.reviewText);
  });

  it('never ships an infinitive that the review file marks as failing validation', () => {
    const realCsv = fs.readFileSync(REAL_CSV_PATH, 'utf-8');
    const { verbDataText, reviewText } = runPipeline(realCsv);
    expect(verbDataText).not.toBeNull();
    expect(reviewText).not.toBeNull();

    const failingInfinitives = reviewText!
      .split('\n')
      .slice(1)
      .filter((line) => line.length > 0)
      .filter((line) => /,fail,/.test(line))
      .map((line) => line.split(',')[2]);
    // Sanity: the real CSV does contain some failing rows (e.g. "kalla").
    expect(failingInfinitives.length).toBeGreaterThan(0);

    for (const infinitive of failingInfinitives) {
      expect(verbDataText).not.toContain(`infinitive: "${infinitive}"`);
    }
  });
});

describe('build-verb-data.mjs — classification and validation on synthetic rows (--all audit)', () => {
  it('classifies a grupp-1 row (-ar/-ade/-at)', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'tala',
        imperativ: 'tala',
        presens: 'talar',
        preteritum: 'talade',
        supinum: 'talat',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'tala');
    expect(row).toContain(',1,');
    expect(row).toContain(',pass,');
  });

  it('classifies a grupp-2a row (-er, voiced stem, -de preteritum)', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'ringa',
        imperativ: 'ring',
        presens: 'ringer',
        preteritum: 'ringde',
        supinum: 'ringt',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'ringa');
    expect(row).toContain(',2a,');
    expect(row).toContain(',pass,');
  });

  it('classifies a grupp-2b row (-er, voiceless stem, -te preteritum)', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'köpa',
        imperativ: 'köp',
        presens: 'köper',
        preteritum: 'köpte',
        supinum: 'köpt',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'köpa');
    expect(row).toContain(',2b,');
    expect(row).toContain(',pass,');
  });

  it('classifies a grupp-3 row (short vowel-final stem)', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'tro',
        imperativ: 'tro',
        presens: 'tror',
        preteritum: 'trodde',
        supinum: 'trott',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'tro');
    expect(row).toContain(',3,');
    expect(row).toContain(',pass,');
  });

  it('classifies an irregular/strong row as grupp 4', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'vara',
        imperativ: 'var',
        presens: 'är',
        preteritum: 'var',
        supinum: 'varit',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'vara');
    expect(row).toContain(',4,');
    expect(row).toContain(',pass,');
  });

  it('classifies an -s verb as deponens', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'hoppas',
        imperativ: '',
        presens: 'hoppas',
        preteritum: 'hoppades',
        supinum: 'hoppats',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'hoppas');
    expect(row).toContain(',deponens,');
  });

  it('rejects a 2a/2b voicing contradiction (voiceless stem with -de preteritum)', () => {
    // 'k' is voiceless, so a -de preteritum contradicts the -er presens shape.
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'väcka',
        imperativ: 'väck',
        presens: 'väcker',
        preteritum: 'väckde',
        supinum: 'väckt',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'väcka');
    expect(row).toContain(',fail,');
    expect(row).toMatch(/voiceless stem.*should take -te preteritum/);
  });

  it('rejects the grupp-1-vs-cluster contradiction (regression: same bug class as "kalla"/"ställa", issues #34/#37)', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'kalla',
        imperativ: 'kalla',
        presens: 'kallar',
        preteritum: 'kallade',
        supinum: 'kallat',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'kalla');
    expect(row).toContain(',fail,');
    expect(row).toMatch(/consonant cluster typical of grupp 2\/4/);
  });

  it('rejects a row with a character outside the allowed alphabet', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'kösta',
        imperativ: 'köst',
        presens: 'köstør',
        preteritum: 'köstade',
        supinum: 'köstat',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'kösta');
    expect(row).toContain(',fail,');
    expect(row).toMatch(/contains a character outside the allowed alphabet/);
  });

  it('rejects empty imperativ on a non-modal verb with no mechanical or curated derivation', () => {
    // grupp-4 shape (does not fit -ar/-er mechanical rules), blank CSV imperativ,
    // not in the curated IRREGULAR_IMPERATIV table, not a modal.
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'brinna',
        imperativ: '',
        presens: 'brinner',
        preteritum: 'brann',
        supinum: 'brunnit',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'brinna');
    expect(row).toContain(',fail,');
    expect(row).toMatch(/empty imperativ on non-modal verb/);
  });

  it('does NOT reject empty imperativ on a modal verb (correct, not a failure)', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'kunna',
        imperativ: '',
        presens: 'kan',
        preteritum: 'kunde',
        supinum: 'kunnat',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'kunna');
    expect(row).toContain(',pass,');
  });

  it('does NOT reject empty imperativ on a grupp-1 verb (mechanically derivable from the infinitive)', () => {
    const csv = [
      CSV_HEADER,
      csvLine({
        infinitive: 'öva',
        imperativ: '',
        presens: 'övar',
        preteritum: 'övade',
        supinum: 'övat',
      }),
    ].join('\n');
    const { reviewText } = runPipeline(csv, ['--all']);
    const row = reviewRow(reviewText!, 'öva');
    expect(row).toContain(',pass,');
  });
});

describe('build-verb-data.mjs — fail-closed promotion gate', () => {
  it('refuses to emit verbData.ts at all when any promoted row fails validation (no partial/truncated table)', () => {
    // Build a full CSV containing every PROMOTED_INFINITIVES row taken
    // verbatim from the real CSV, but corrupt exactly one of them ("vara")
    // with a bad character. A partial-write here would silently shift every
    // other verb's array index — exactly the SRS-remap hazard the ticket
    // warns about — so the pipeline must refuse to write anything at all.
    const realCsv = fs.readFileSync(REAL_CSV_PATH, 'utf-8');
    const lines = realCsv.split(/\r?\n/);
    const header = lines[0];
    const varaIdx = lines.findIndex((l) => l.startsWith('A1,') && l.split(',')[2] === 'vara');
    expect(varaIdx).toBeGreaterThan(-1);
    const cols = lines[varaIdx].split(',');
    cols[4] = 'är9'; // corrupt presens with a disallowed digit
    lines[varaIdx] = cols.join(',');
    const corruptedCsv = [header, ...lines.slice(1)].join('\n');

    const { result, verbDataText } = runPipeline(corruptedCsv);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /Promoted rows failed validation — refusing to emit verbData\.ts/,
    );
    expect(verbDataText).toBeNull();
  });

  it('refuses to promote a verb whose infinitive is missing from the CSV entirely', () => {
    const realCsv = fs.readFileSync(REAL_CSV_PATH, 'utf-8');
    const lines = realCsv.split(/\r?\n/);
    const header = lines[0];
    const filtered = lines.slice(1).filter((l) => l.split(',')[2] !== 'vara');
    const csvWithoutVara = [header, ...filtered].join('\n');

    const { result, verbDataText } = runPipeline(csvWithoutVara);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/vara: not found in CSV/);
    expect(verbDataText).toBeNull();
  });
});
