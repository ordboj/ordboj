import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VERB_DATA, type Grupp } from "@/data/verbData";

const VALID_GRUPP: ReadonlySet<Grupp> = new Set(["1", "2a", "2b", "3", "4"]);

// Read the raw source so we can pin the "flag, don't guess" contract at the
// text level: every row that omits `grupp` must carry a human-readable
// "NEEDS HUMAN REVIEW" comment directly above it. This is invisible at
// runtime (the field is just `undefined`), so the only way to catch a
// silently-omitted-without-explanation row is to inspect the source text.
const here = dirname(fileURLToPath(import.meta.url));
const verbDataSource = readFileSync(join(here, "verbData.ts"), "utf-8");

// Split the VERB_DATA array literal into one chunk per row, each chunk
// carrying any comment lines that precede it.
function rowsWithPrecedingComments(source: string): Array<{ infinitive: string; commentBlock: string; hasGrupp: boolean }> {
  const startMarker = "export const VERB_DATA: VerbData[] = [";
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start + startMarker.length);
  const lines = body.split("\n");

  const rows: Array<{ infinitive: string; commentBlock: string; hasGrupp: boolean }> = [];
  let pendingComment: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//")) {
      pendingComment.push(trimmed);
      continue;
    }
    const rowMatch = trimmed.match(/infinitive:\s*"([^"]+)"/);
    if (rowMatch) {
      rows.push({
        infinitive: rowMatch[1],
        commentBlock: pendingComment.join("\n"),
        hasGrupp: /\bgrupp:\s*"/.test(trimmed),
      });
      pendingComment = [];
    }
    if (trimmed.startsWith("]")) break;
  }
  return rows;
}

const parsedRows = rowsWithPrecedingComments(verbDataSource);

describe("VERB_DATA - grupp field contract", () => {
  it("has a parsed row for every VERB_DATA entry (sanity-checks the source parser above)", () => {
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

  it("never assigns a grupp of empty string or any value outside the union (would indicate a guess slipping past the type)", () => {
    for (const verb of VERB_DATA) {
      if (verb.grupp !== undefined) {
        expect(verb.grupp).not.toBe("");
        expect(["1", "2a", "2b", "3", "4"]).toContain(verb.grupp);
      }
    }
  });

  it("flags every row that omits grupp with an explicit human-review comment, rather than leaving it silently unexplained", () => {
    const unexplainedOmissions = parsedRows.filter(
      (r) => !r.hasGrupp && !/NEEDS HUMAN REVIEW/.test(r.commentBlock)
    );
    expect(unexplainedOmissions.map((r) => r.infinitive)).toEqual([]);
  });

  it("does not attach a 'NEEDS HUMAN REVIEW' comment to a row that also has a grupp assigned (contradicts itself)", () => {
    const contradictions = parsedRows.filter(
      (r) => r.hasGrupp && /NEEDS HUMAN REVIEW/.test(r.commentBlock)
    );
    expect(contradictions.map((r) => r.infinitive)).toEqual([]);
  });

  // Regression: the flagged rows are specific, known verbs whose stored
  // forms don't match their textbook conjugation pattern. Pin them by name
  // so a future edit that "fixes" the guess without fixing the underlying
  // form mismatch is caught.
  it.each(["vända", "söka", "lägga"])(
    'flags "%s" for human review (grupp omitted) because its stored forms do not match a known grupp pattern',
    (infinitive) => {
      const row = VERB_DATA.find((v) => v.infinitive === infinitive);
      expect(row).toBeDefined();
      expect(row?.grupp).toBeUndefined();
    }
  );

  it("does not leave any row without a grupp unless it is one of the specifically flagged verbs", () => {
    const flagged = new Set(["vända", "söka", "lägga"]);
    const unexpectedlyMissing = VERB_DATA.filter(
      (v) => v.grupp === undefined && !flagged.has(v.infinitive)
    );
    expect(unexpectedlyMissing.map((v) => v.infinitive)).toEqual([]);
  });

  it("assigns a grupp to every row that is not specifically flagged for review", () => {
    const flagged = new Set(["vända", "söka", "lägga"]);
    for (const verb of VERB_DATA) {
      if (!flagged.has(verb.infinitive)) {
        expect(verb.grupp).toBeDefined();
      }
    }
  });
});
