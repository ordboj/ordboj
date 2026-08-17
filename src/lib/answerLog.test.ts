import { describe, it, expect } from 'vitest';
import {
  ANSWER_LOG_CAP,
  ANSWER_LOG_VERSION,
  appendAnswerLogEntry,
  isAnswerLogEntry,
  parseAnswerLogPayload,
  pooledChoiceAccuracy,
  perFrameAccuracy,
  perLureShare,
  type AnswerLogEntry,
  type ChoiceAnswerLogEntry,
  type TypedAnswerLogEntry,
} from '@/lib/answerLog';

// src/lib/answerLog.ts is the pure logic behind the per-answer diagnostic log
// (issue #403). It is disposable telemetry, not progress (decision doc
// section 1), but the cap/eviction, entry validation and the three analysis
// functions are still real logic worth pinning: a bug here either silently
// grows the store past its cap or quietly lies about which lure is
// underperforming.

function typedEntry(overrides: Partial<TypedAnswerLogEntry> = {}): TypedAnswerLogEntry {
  return { t: 0, i: 'pv:komma-ihag:cloze', m: 'typed', k: true, f: 0, ...overrides };
}

function choiceEntry(overrides: Partial<ChoiceAnswerLogEntry> = {}): ChoiceAnswerLogEntry {
  return {
    t: 0,
    i: 'pv:komma-ihag:cloze',
    m: 'choice',
    k: true,
    f: 0,
    l: ['upp', 'ner'],
    p: null,
    ...overrides,
  };
}

describe('parseAnswerLogPayload - cap eviction (acceptance criterion 1)', () => {
  it('loading 600 stored entries keeps the newest 500 and drops the oldest 100 (t values 0-99)', () => {
    const entries: TypedAnswerLogEntry[] = Array.from({ length: 600 }, (_, i) =>
      typedEntry({ t: i, f: i }),
    );
    const raw = JSON.stringify({ version: ANSWER_LOG_VERSION, entries });

    const result = parseAnswerLogPayload(raw);

    expect(result.newerVersion).toBe(false);
    expect(result.replaced).toBe(false);
    expect(result.entries).toHaveLength(ANSWER_LOG_CAP);
    // The oldest 100 (t 0-99) are gone...
    const tValues = result.entries.map((e) => e.t);
    for (let t = 0; t < 100; t++) {
      expect(tValues).not.toContain(t);
    }
    // ...and the newest (t 100-599) survive, oldest-first order preserved.
    expect(tValues[0]).toBe(100);
    expect(tValues[tValues.length - 1]).toBe(599);
  });
});

describe('choice vs typed entry shape round-trip', () => {
  it('a choice entry keeps l and a null p (correct answer) through parseAnswerLogPayload', () => {
    const entry = choiceEntry({ l: ['upp', 'ner'], p: null, k: true });
    const raw = JSON.stringify({ version: ANSWER_LOG_VERSION, entries: [entry] });

    const result = parseAnswerLogPayload(raw);

    expect(result.entries).toEqual([entry]);
    expect(result.entries[0]).toMatchObject({ l: ['upp', 'ner'], p: null, k: true });
  });

  it('a typed entry stores no l or p field', () => {
    const entry = typedEntry();
    const raw = JSON.stringify({ version: ANSWER_LOG_VERSION, entries: [entry] });

    const result = parseAnswerLogPayload(raw);

    expect(result.entries).toEqual([entry]);
    expect(result.entries[0]).not.toHaveProperty('l');
    expect(result.entries[0]).not.toHaveProperty('p');
  });
});

describe('isAnswerLogEntry - field-by-field structural validation', () => {
  it('accepts a well-formed typed entry', () => {
    expect(isAnswerLogEntry(typedEntry())).toBe(true);
  });

  it('accepts a well-formed choice entry', () => {
    expect(isAnswerLogEntry(choiceEntry())).toBe(true);
  });

  it('rejects a typed entry carrying an l field (the type system forbids this, but a hand-edited file might carry it)', () => {
    const bad = { ...typedEntry(), l: ['upp'] };
    expect(isAnswerLogEntry(bad)).toBe(false);
  });

  it('rejects a typed entry carrying a p field', () => {
    const bad = { ...typedEntry(), p: null };
    expect(isAnswerLogEntry(bad)).toBe(false);
  });

  it('rejects a choice entry missing l', () => {
    const bad = choiceEntry() as unknown as Record<string, unknown>;
    delete bad.l;
    expect(isAnswerLogEntry(bad)).toBe(false);
  });
});

describe('parseAnswerLogPayload - unreadable payloads (acceptance criterion 5)', () => {
  it('unparseable JSON returns an empty, replaced result', () => {
    expect(parseAnswerLogPayload('{not valid json')).toEqual({
      entries: [],
      newerVersion: false,
      replaced: true,
    });
  });

  it('a non-object top-level value returns an empty, replaced result', () => {
    expect(parseAnswerLogPayload('"just a string"')).toEqual({
      entries: [],
      newerVersion: false,
      replaced: true,
    });
  });

  it('a missing version field returns an empty, replaced result', () => {
    expect(parseAnswerLogPayload(JSON.stringify({ entries: [] }))).toEqual({
      entries: [],
      newerVersion: false,
      replaced: true,
    });
  });

  it('entries that are not an array returns an empty, replaced result', () => {
    expect(
      parseAnswerLogPayload(JSON.stringify({ version: ANSWER_LOG_VERSION, entries: 'nope' })),
    ).toEqual({
      entries: [],
      newerVersion: false,
      replaced: true,
    });
  });
});

describe('parseAnswerLogPayload - newer version (decision section 4)', () => {
  it('a version-2 payload is left alone: newerVersion true, replaced false, entries empty', () => {
    const raw = JSON.stringify({ version: 2, entries: [typedEntry()] });
    expect(parseAnswerLogPayload(raw)).toEqual({
      entries: [],
      newerVersion: true,
      replaced: false,
    });
  });
});

describe('appendAnswerLogEntry - steady-state FIFO eviction', () => {
  it('keeps length at the cap and drops the oldest once appending would exceed it', () => {
    let entries: AnswerLogEntry[] = Array.from({ length: ANSWER_LOG_CAP }, (_, i) =>
      typedEntry({ t: i, f: i }),
    );
    entries = appendAnswerLogEntry(entries, typedEntry({ t: 9999, f: 9999 }));

    expect(entries).toHaveLength(ANSWER_LOG_CAP);
    expect(entries.map((e) => e.t)).not.toContain(0);
    expect(entries[entries.length - 1]?.t).toBe(9999);
  });
});

describe('the three analysis functions', () => {
  it('pooledChoiceAccuracy pools only choice entries within the trailing window', () => {
    const entries: AnswerLogEntry[] = [
      typedEntry({ k: false }), // ignored: not a choice entry
      choiceEntry({ k: true }),
      choiceEntry({ k: false }),
      choiceEntry({ k: true }),
    ];
    expect(pooledChoiceAccuracy(entries)).toBeCloseTo(2 / 3);
  });

  it('pooledChoiceAccuracy returns null when there are no choice entries at all', () => {
    expect(pooledChoiceAccuracy([typedEntry(), typedEntry()])).toBeNull();
  });

  it('perFrameAccuracy buckets by (item id, frame) and only counts choice entries', () => {
    const entries: AnswerLogEntry[] = [
      choiceEntry({ i: 'pv:a', f: 0, k: true }),
      choiceEntry({ i: 'pv:a', f: 0, k: false }),
      choiceEntry({ i: 'pv:a', f: 1, k: true }),
      typedEntry({ i: 'pv:a', f: 0, k: false }), // different modality, must not count
    ];

    const result = perFrameAccuracy(entries);
    const frame0 = result.find((r) => r.itemId === 'pv:a' && r.frame === 0);
    const frame1 = result.find((r) => r.itemId === 'pv:a' && r.frame === 1);

    expect(frame0).toMatchObject({ correct: 1, total: 2, accuracy: 0.5 });
    expect(frame1).toMatchObject({ correct: 1, total: 1, accuracy: 1 });
  });

  it("perLureShare counts a lure repeated within one entry's l once, not once per occurrence", () => {
    const entries: AnswerLogEntry[] = [
      // 'upp' appears twice in this single entry's lure list - must count as
      // one appearance for this entry, not two.
      choiceEntry({ i: 'pv:a', f: 0, l: ['upp', 'upp', 'ner'], p: null, k: true }),
    ];

    const result = perLureShare(entries);
    const upp = result.find((r) => r.lure === 'upp');

    expect(upp).toBeDefined();
    expect(upp?.appearances).toBe(1);
    expect(upp?.chosen).toBe(0);
  });

  it('perLureShare counts chosen only where p equals the lure, across multiple entries', () => {
    const entries: AnswerLogEntry[] = [
      choiceEntry({ i: 'pv:a', f: 0, l: ['upp', 'ner'], p: 'upp', k: false }),
      choiceEntry({ i: 'pv:a', f: 0, l: ['upp', 'ner'], p: null, k: true }),
      choiceEntry({ i: 'pv:a', f: 0, l: ['upp', 'ner'], p: 'ner', k: false }),
    ];

    const result = perLureShare(entries);
    const upp = result.find((r) => r.lure === 'upp');
    const ner = result.find((r) => r.lure === 'ner');

    expect(upp).toMatchObject({ appearances: 3, chosen: 1, share: 1 / 3 });
    expect(ner).toMatchObject({ appearances: 3, chosen: 1, share: 1 / 3 });
  });
});
