// Per-answer diagnostic log for the particle discrimination card.
//
// Full decision: docs/product/2026-08-13-per-answer-review-log-decision.md.
// This is disposable telemetry, not progress — CLAUDE.md's "irreplaceable"
// rule does not apply to this store (decision section 1). Nothing in this
// file, and nothing that reads its output, is ever consulted by the
// scheduler (src/lib/srs.ts): the log exists so a human can check the three
// falsifiers in docs/learning/2026-08-12-sentence-completion-distractors.md
// by hand, not to feed calculateNextReview.
//
// Pure logic only. The write path (buffering, the coalesced writer, the
// quota policy) lives in src/hooks/useAnswerLog.ts.

// The log's own localStorage key, separate from the SRS progress store
// (swedish-verbs-srs-progress). A separate key is the whole point (decision
// section 1): the progress payload never grows with this log, a corrupt log
// can never reject a valid progress backup, and STORAGE_VERSION in
// useSrsProgress.ts stays at 3.
export const ANSWER_LOG_STORAGE_KEY = 'swedish-verbs-answer-log';

// Envelope version. Per decision section 4, a version bump's default
// migration is "discard and restart at the new version" unless a future
// change ships a real one — stated here so nobody has to invent that policy
// later for a store the project has already ruled losable.
export const ANSWER_LOG_VERSION = 1;

// Cap and eviction: FIFO, drop from the front once appending would exceed
// this. Sized in decision section 3 against the three falsifiers' trailing
// windows (the largest needs ~250 entries); 500 covers it with headroom.
export const ANSWER_LOG_CAP = 500;

export type AnswerModality = 'typed' | 'choice';

// One entry per graded answer on a particle cloze item. Field-by-field
// justification, and the rejected fields, are decision section 2.
export interface AnswerLogEntry {
  t: number; // epoch ms, when the answer was graded
  i: string; // item id, e.g. "pv:komma-ihag:cloze"
  m: AnswerModality;
  k: boolean; // correct
  f: number; // example index within the entry (the frame)
  l?: string[]; // choice only: the lure particles presented
  p?: string | null; // choice only: the lure tapped, or null when correct
}

export interface AnswerLogEnvelope {
  version: typeof ANSWER_LOG_VERSION;
  entries: AnswerLogEntry[];
}

export function emptyAnswerLog(): AnswerLogEnvelope {
  return { version: ANSWER_LOG_VERSION, entries: [] };
}

// Appends one entry, evicting from the front once the result would exceed
// the cap. Pure: never mutates `entries`. Acceptance criterion 1: at the
// cap, length stays at the cap, the oldest entry is dropped, the newest is
// kept.
export function appendAnswerLogEntry(
  entries: AnswerLogEntry[],
  entry: AnswerLogEntry,
): AnswerLogEntry[] {
  const next = entries.concat(entry);
  return next.length > ANSWER_LOG_CAP ? next.slice(next.length - ANSWER_LOG_CAP) : next;
}

// Quota policy (decision section 5): on a failed write, halve the buffer —
// oldest half discarded, newest kept — and let the next append retry. Not
// exported eviction-by-cap logic reused here on purpose: halving is a
// distinct, one-off reaction to a write failure, not the steady-state FIFO
// rule.
export function halveAnswerLog(entries: AnswerLogEntry[]): AnswerLogEntry[] {
  const keep = Math.ceil(entries.length / 2);
  return entries.slice(entries.length - keep);
}

export function serializeAnswerLog(entries: AnswerLogEntry[]): string {
  return JSON.stringify({ version: ANSWER_LOG_VERSION, entries });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Structural validator for one entry. Used when reading storage, so that
// bytes this build cannot make sense of (a hand-edited file, a future field
// this build predates in a way parseAnswerLogPayload's version guard did not
// catch) are dropped individually rather than poisoning every sibling entry
// — the log is diagnostic, so a partially-readable log is still useful,
// unlike the progress store where a malformed item is quarantined instead of
// dropped.
export function isAnswerLogEntry(value: unknown): value is AnswerLogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  if (!isFiniteNumber(entry.t)) return false;
  if (typeof entry.i !== 'string' || entry.i.length === 0) return false;
  if (entry.m !== 'typed' && entry.m !== 'choice') return false;
  if (typeof entry.k !== 'boolean') return false;
  if (!isFiniteNumber(entry.f)) return false;
  if (
    entry.l !== undefined &&
    !(Array.isArray(entry.l) && entry.l.every((lure) => typeof lure === 'string'))
  ) {
    return false;
  }
  if (entry.p !== undefined && entry.p !== null && typeof entry.p !== 'string') return false;
  return true;
}

export interface AnswerLogParseResult {
  entries: AnswerLogEntry[];
  // True when the stored payload's version is newer than ANSWER_LOG_VERSION.
  // Per decision section 4, that payload is left on disk untouched and this
  // build logs nothing for the session — see useAnswerLog.ts, which disables
  // itself when this is true rather than writing over a newer build's
  // diagnostics. `entries` is always [] in this case; the caller must not
  // use it.
  newerVersion: boolean;
}

// Parses a stored answer-log payload. Never throws: an unparseable payload,
// or one whose `entries` is not an array, yields an empty v1 log
// (acceptance criterion 5) rather than rejecting the read — this store is
// disposable by construction (decision section 1), which is the one
// deliberate difference from the progress store's stricter reader.
export function parseAnswerLogPayload(raw: string): AnswerLogParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { entries: [], newerVersion: false };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { entries: [], newerVersion: false };
  }
  const envelope = parsed as { version?: unknown; entries?: unknown };
  const version = envelope.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { entries: [], newerVersion: false };
  }
  // Checked before the entries-shape guard below: a newer build's payload
  // must be left alone whatever shape its entries are, since this build has
  // no basis to judge them (decision section 4).
  if (version > ANSWER_LOG_VERSION) {
    return { entries: [], newerVersion: true };
  }
  if (!Array.isArray(envelope.entries)) {
    return { entries: [], newerVersion: false };
  }
  return { entries: envelope.entries.filter(isAnswerLogEntry), newerVersion: false };
}

// --- The three analysis functions -----------------------------------------
//
// Pure functions over an entry array, reading the falsifiers named in
// docs/learning/2026-08-12-sentence-completion-distractors.md, "How we would
// know this was wrong". No UI reads these in v1 (decision section 8): they
// are a devtools call against localStorage, run by the team.

// Pooled choice accuracy over the trailing window of choice answers
// (default 30, the pooled falsifier's window). Returns null when there are
// no choice entries at all, so a caller can distinguish "no data yet" from
// "0% accuracy".
export function pooledChoiceAccuracy(entries: AnswerLogEntry[], windowSize = 30): number | null {
  const choiceEntries = entries.filter((entry) => entry.m === 'choice');
  const window = choiceEntries.slice(Math.max(0, choiceEntries.length - windowSize));
  if (window.length === 0) return null;
  const correct = window.filter((entry) => entry.k).length;
  return correct / window.length;
}

export interface FrameAccuracy {
  itemId: string;
  frame: number;
  correct: number;
  total: number;
  accuracy: number;
}

// Choice accuracy per (item id, frame) pair — the per-frame falsifier ("one
// frame below ~50% after 5 answers"). The 5-answer and 50% thresholds are a
// human reading of `total`/`accuracy`, not encoded here: this function only
// aggregates.
export function perFrameAccuracy(entries: AnswerLogEntry[]): FrameAccuracy[] {
  const buckets = new Map<
    string,
    { itemId: string; frame: number; correct: number; total: number }
  >();
  for (const entry of entries) {
    if (entry.m !== 'choice') continue;
    const key = `${entry.i} ${entry.f}`;
    const bucket = buckets.get(key) ?? { itemId: entry.i, frame: entry.f, correct: 0, total: 0 };
    bucket.total += 1;
    if (entry.k) bucket.correct += 1;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values(), (bucket) => ({
    ...bucket,
    accuracy: bucket.correct / bucket.total,
  }));
}

export interface LureShare {
  itemId: string;
  frame: number;
  lure: string;
  chosen: number;
  appearances: number;
  share: number;
}

// Per-lure choice share — the per-lure falsifier ("one distractor chosen on
// more than ~60% of the occasions it appears"). Scoped to (item id, frame,
// lure): the falsifier is about one lure's pull on one frame, and the same
// particle string can be a lure on a different frame with a different
// competitiveness. `appearances` counts every choice entry whose `l`
// contains the lure (the denominator); `chosen` counts the ones where `p`
// equals it (the numerator) — consistent with `p` being `null` on a correct
// choice, per decision section 2.
export function perLureShare(entries: AnswerLogEntry[]): LureShare[] {
  const buckets = new Map<
    string,
    { itemId: string; frame: number; lure: string; chosen: number; appearances: number }
  >();
  for (const entry of entries) {
    if (entry.m !== 'choice' || !entry.l) continue;
    for (const lure of entry.l) {
      const key = `${entry.i} ${entry.f} ${lure}`;
      const bucket = buckets.get(key) ?? {
        itemId: entry.i,
        frame: entry.f,
        lure,
        chosen: 0,
        appearances: 0,
      };
      bucket.appearances += 1;
      if (entry.p === lure) bucket.chosen += 1;
      buckets.set(key, bucket);
    }
  }
  return Array.from(buckets.values(), (bucket) => ({
    ...bucket,
    share: bucket.chosen / bucket.appearances,
  }));
}
