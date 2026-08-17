import type { SrsState } from '@/lib/srs';

// The localStorage key of the SRS progress store. Lives here rather than in
// useSrsProgress.ts so the backup path and the hook cannot drift apart on
// the one key that carries irreplaceable data.
export const SRS_STORAGE_KEY = 'swedish-verbs-srs-progress';

// One-shot copy of the pre-v3 SRS payload, written verbatim by the hook's
// load path before the first v3 save and never overwritten once present, so
// the oldest (pre-migration) copy is the one that survives. Declared here
// next to SRS_STORAGE_KEY because restoreAppStores must honor that
// never-overwrite rule on the way back in — see restoreAppStores.
export const PRE_V3_SRS_BACKUP_KEY = 'swedish-verbs-srs-progress-backup-pre-v3';

// Every store this app owns is named with this prefix
// (`swedish-verbs-settings`, `swedish-verbs-srs-progress`, and the planned
// `swedish-verbs-stats` / daily-session / streak stores). The backup
// captures and restores by prefix instead of by a hard-coded list, so a
// store added later is covered the day it ships, with one condition: it must
// use this prefix. The prefix is also a safety boundary on the way back in —
// an imported file can only ever write keys this app owns, never an
// unrelated key that happens to share the origin.
export const APP_STORE_PREFIX = 'swedish-verbs-';

const APP_ID = 'ordboj';

// Backup-file format version. Distinct from the SRS store's STORAGE_VERSION,
// which describes what is *inside* the progress store: the top-level
// `version`/`items` pair is self-versioned, so the SRS payload moving from
// version 2 to version 3 (issue #53) did not change the *file* format — the
// import side hands `{ version, items }` to the hook's version ladder, which
// reads every SRS version it has ever shipped.
//
//   1 = the crash-boundary backup (AppErrorBoundary.downloadProgressBackup):
//       `{ app, backupVersion: 1, exportedAt, <storeKey>: <value>, ... }`,
//       one flat top-level key per store. Still shipping, still readable
//       here, because for a learner whose app crashed that file is the only
//       backup they have.
//   2 = this format: the SRS store stays at the top level in exactly the
//       shape the SRS-only import path already reads (`{ version, items }`),
//       and every other store rides in `stores`. The duplication of shape is
//       deliberate: a version-2 file dropped into an older build, or into
//       any code path that only understands the SRS export, still restores
//       the schedule instead of being rejected wholesale.
export const BACKUP_VERSION = 2;

// The subset of the Storage API this module needs. Injectable so callers and
// tests can pass a stub instead of mutating a global. Not routed through
// src/lib/storage.ts's writeSerialized: that helper is hard-bound to the
// global localStorage and swallows failures, while restoreAppStores needs
// per-key failure detection against an injected storage to roll back.
export type BackupStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

// A store's value as it appears inside a backup file: the parsed JSON when
// the stored text is a JSON object or array (so the file stays readable and
// diffable), and the raw text otherwise. Raw text covers two cases without
// ambiguity — a store that failed to parse, and a store that legitimately
// holds a bare JSON scalar such as `"abc"` or `42`, which would otherwise
// round-trip back as different bytes.
function decodeStoreValue(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') return parsed;
  } catch {
    // fall through: keep the raw text
  }
  return raw;
}

function encodeStoreValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : encoded;
}

function listAppStoreKeys(storage: BackupStorage): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && key.startsWith(APP_STORE_PREFIX)) keys.push(key);
    }
  } catch (e) {
    // Storage can throw outright (private mode, blocked cookies). A backup
    // of the schedule alone is still worth producing.
    console.error('Failed to enumerate app stores for backup', e);
  }
  return keys;
}

// The top-level SRS payload of a version-2 backup file. `items` is the
// stored (version-3) item shape: the id lives in the map key, so `itemId`
// is not written (issue #53).
export interface SrsProgressEnvelope {
  version: number;
  items: Record<string, Omit<SrsState, 'itemId'>>;
}

// Builds the whole-app backup file. `progress` is passed in rather than read
// from storage because the hook holds the authoritative in-memory schedule,
// which can be one answer ahead of what is persisted.
export function buildAppBackup(
  progress: SrsProgressEnvelope,
  storage: BackupStorage = localStorage,
): string {
  const stores: Record<string, unknown> = {};
  for (const key of listAppStoreKeys(storage)) {
    // The SRS store is the top-level `version`/`items` pair; carrying it
    // twice would let the two copies disagree.
    if (key === SRS_STORAGE_KEY) continue;
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch (e) {
      console.error(`Failed to read ${key} for backup`, e);
    }
    if (raw === null) continue;
    stores[key] = decodeStoreValue(raw);
  }

  return JSON.stringify(
    {
      app: APP_ID,
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      version: progress.version,
      items: progress.items,
      stores,
    },
    null,
    2,
  );
}

export type BackupRead =
  // Not a whole-app envelope at all: the caller falls back to reading it as
  // an SRS-only export (versioned or legacy bare map).
  | { kind: 'legacy' }
  // Claims to be a whole-app envelope but cannot be read as one. Never falls
  // back: a file that says it is a backup and is not gets rejected, rather
  // than half-interpreted.
  | { kind: 'invalid' }
  | { kind: 'envelope'; progress: unknown; stores: Record<string, unknown> };

// Recognizes and unwraps a whole-app envelope. Validation of the progress
// payload itself stays with the SRS owner (useSrsProgress); this function
// only decides which shape the file is and hands the pieces back.
export function readAppBackup(parsed: unknown): BackupRead {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'legacy' };
  const file = parsed as Record<string, unknown>;

  const claimsEnvelope =
    file.app !== undefined || file.backupVersion !== undefined || file.stores !== undefined;
  if (!claimsEnvelope) return { kind: 'legacy' };

  if (file.app !== APP_ID) return { kind: 'invalid' };

  const backupVersion = file.backupVersion;
  if (
    typeof backupVersion !== 'number' ||
    !Number.isInteger(backupVersion) ||
    backupVersion < 1 ||
    // A file written by a newer build is refused rather than guessed at,
    // the same rule the SRS store applies to a newer store.
    backupVersion > BACKUP_VERSION
  ) {
    return { kind: 'invalid' };
  }

  if (backupVersion === 1) {
    // Crash-boundary shape: one flat top-level key per store.
    const stores: Record<string, unknown> = {};
    let progress: unknown;
    for (const [key, value] of Object.entries(file)) {
      if (!key.startsWith(APP_STORE_PREFIX) || value === null || value === undefined) continue;
      if (key === SRS_STORAGE_KEY) progress = value;
      else stores[key] = value;
    }
    if (progress === undefined) return { kind: 'invalid' };
    return { kind: 'envelope', progress, stores };
  }

  const stores = file.stores;
  if (!stores || typeof stores !== 'object' || Array.isArray(stores)) return { kind: 'invalid' };
  return {
    kind: 'envelope',
    progress: { version: file.version, items: file.items },
    stores: stores as Record<string, unknown>,
  };
}

// Writes the non-SRS stores from a backup back into localStorage.
//
// Merge, not replace: a key the file does not carry is left alone. An older
// backup therefore cannot wipe a store that did not exist when it was taken.
//
// All-or-nothing on failure. A quota error part-way through would otherwise
// leave settings from the file next to a streak from before it, so every
// key touched is snapshotted first and rolled back if any write throws.
// Returns false in that case; the caller must then leave the schedule alone
// too, so a failed restore changes nothing at all.
export function restoreAppStores(
  stores: Record<string, unknown>,
  storage: BackupStorage = localStorage,
): boolean {
  const writes: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(stores)) {
    // Only this app's own keys, and never the progress store: that one is
    // owned by the caller's validated import path.
    if (!key.startsWith(APP_STORE_PREFIX) || key === SRS_STORAGE_KEY) continue;
    if (value === null || value === undefined) continue;
    // The pre-v3 SRS backup is written once and never overwritten, so the
    // oldest copy survives (see useSrsProgress.ts). A restore honors that:
    // the file's copy lands only when the key is absent locally.
    if (key === PRE_V3_SRS_BACKUP_KEY && storage.getItem(key) !== null) continue;
    const encoded = encodeStoreValue(value);
    if (encoded !== null) writes.push([key, encoded]);
  }

  const previous: Array<[string, string | null]> = [];
  try {
    for (const [key, encoded] of writes) {
      previous.push([key, storage.getItem(key)]);
      storage.setItem(key, encoded);
    }
    return true;
  } catch (e) {
    console.error('Failed to restore backup stores; rolling back', e);
    for (const [key, before] of previous) {
      try {
        if (before === null) storage.removeItem(key);
        else storage.setItem(key, before);
      } catch (rollbackError) {
        // Nothing further is available here; the write that failed is the
        // same mechanism the rollback needs.
        console.error(`Failed to roll back ${key}`, rollbackError);
      }
    }
    return false;
  }
}
