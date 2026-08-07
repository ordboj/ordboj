import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readVersioned, writeVersioned } from '@/lib/storage';

const KEY = 'test-versioned-key';
const VERSION = 1;

// A trivial sanitize that mirrors the doctrine's contract: validate a
// single "value" field, falling back to a default when it's missing or the
// wrong type.
interface Payload {
  value: number;
}
const DEFAULT_PAYLOAD: Payload = { value: 0 };
function sanitize(raw: unknown): Payload {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    value:
      typeof obj.value === 'number' && Number.isFinite(obj.value)
        ? obj.value
        : DEFAULT_PAYLOAD.value,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('writeVersioned', () => {
  it('persists the payload wrapped in a {version, data} envelope', () => {
    const ok = writeVersioned(KEY, VERSION, { value: 42 });
    expect(ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({
      version: VERSION,
      data: { value: 42 },
    });
  });

  it('returns false and does not throw when localStorage.setItem throws (quota exceeded)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    let ok: boolean | undefined;
    expect(() => {
      ok = writeVersioned(KEY, VERSION, { value: 1 });
    }).not.toThrow();
    expect(ok).toBe(false);
  });
});

describe('readVersioned', () => {
  it('returns sanitize(undefined) when the key is absent', () => {
    expect(readVersioned(KEY, VERSION, sanitize)).toEqual(DEFAULT_PAYLOAD);
  });

  it('does not throw and falls back to sanitize(undefined) on malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(() => readVersioned(KEY, VERSION, sanitize)).not.toThrow();
    expect(readVersioned(KEY, VERSION, sanitize)).toEqual(DEFAULT_PAYLOAD);
  });

  it('does not throw and falls back to sanitize(undefined) when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(() => readVersioned(KEY, VERSION, sanitize)).not.toThrow();
    expect(readVersioned(KEY, VERSION, sanitize)).toEqual(DEFAULT_PAYLOAD);
  });

  it('unwraps data and sanitizes it when the envelope version matches', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, data: { value: 7 } }));
    expect(readVersioned(KEY, VERSION, sanitize)).toEqual({ value: 7 });
  });

  it('round-trips a valid payload through write then read unchanged', () => {
    writeVersioned(KEY, VERSION, { value: 99 });
    expect(readVersioned(KEY, VERSION, sanitize)).toEqual({ value: 99 });
  });

  it('treats a legacy unversioned blob as best-effort raw data and hands it to sanitize', () => {
    // No {version, data} envelope at all -- pre-doctrine shape.
    localStorage.setItem(KEY, JSON.stringify({ value: 5 }));
    expect(readVersioned(KEY, VERSION, sanitize)).toEqual({ value: 5 });
  });

  it('CONTRACT: when the stored envelope version does not match currentVersion, sanitize receives the whole raw envelope object, not envelope.data', () => {
    // Pinning this so a future change to the version-mismatch branch is
    // caught by a failing test rather than silently shipping. Today
    // readVersioned falls through to `sanitize(parsed)` for any
    // non-matching version, i.e. sanitize sees { version, data }, not the
    // unwrapped data. A sanitize() that only reads `raw.value` from the
    // inner data (as ours does) will NOT find it here and will fall back.
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION + 1, data: { value: 5 } }));
    expect(readVersioned(KEY, VERSION, sanitize)).toEqual(DEFAULT_PAYLOAD);
  });
});
