/**
 * Shared versioned-envelope doctrine for localStorage-backed stores.
 *
 * Every store that persists to localStorage wraps its payload as
 * `{ version, data }`. Reads never throw and never let raw/garbage JSON
 * reach app state: callers supply a `sanitize` function that validates each
 * field individually and falls back to that field's default, so one bad
 * field can't take out the whole record. Writes are guarded against
 * exceptions (e.g. Safari private mode / quota errors) and report success
 * via a boolean instead of throwing into the render tree.
 *
 * Owner: frontend-expert (reviewed by staff-engineer). Used by
 * `useSettings.ts`; `useSrsProgress.ts` adopts the same helper under #7.
 */

export interface VersionedEnvelope<T> {
  version: number;
  data: T;
}

function isVersionedEnvelope(value: unknown): value is { version: unknown; data: unknown } {
  return typeof value === 'object' && value !== null && 'version' in value && 'data' in value;
}

/**
 * Read a versioned blob from localStorage. Handles four cases without
 * throwing: absent key, malformed JSON, a legacy unversioned blob (the
 * shape stores used before adopting this doctrine), and a current-version
 * envelope. In every case `sanitize` receives whatever raw payload was
 * found (or `undefined`) and is responsible for validating each field and
 * substituting defaults for anything invalid.
 */
export function readVersioned<T>(
  key: string,
  currentVersion: number,
  sanitize: (raw: unknown) => T,
): T {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch (e) {
    console.warn(`Failed to read "${key}" from localStorage`, e);
    return sanitize(undefined);
  }

  if (!stored) {
    return sanitize(undefined);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch (e) {
    console.warn(`Failed to parse stored "${key}"; falling back to defaults`, e);
    return sanitize(undefined);
  }

  if (isVersionedEnvelope(parsed) && parsed.version === currentVersion) {
    return sanitize(parsed.data);
  }

  // Legacy unversioned blob, or a version we don't recognize yet: treat the
  // raw payload as best-effort data and let per-field sanitize decide what
  // survives. The next write re-persists it as a current-version envelope.
  return sanitize(parsed);
}

/**
 * Persist a versioned blob to localStorage. Never throws: write failures
 * (quota exceeded, Safari private mode, etc.) are caught and reported via
 * the return value so callers can keep the in-memory session intact and
 * surface a warning instead of crashing.
 */
export function writeVersioned<T>(key: string, currentVersion: number, data: T): boolean {
  try {
    const envelope: VersionedEnvelope<T> = { version: currentVersion, data };
    localStorage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch (e) {
    console.warn(`Failed to persist "${key}" to localStorage`, e);
    return false;
  }
}
