import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildAppBackup,
  readAppBackup,
  restoreAppStores,
  SRS_STORAGE_KEY,
  PRE_V3_SRS_BACKUP_KEY,
  BACKUP_VERSION,
  type BackupStorage,
} from '@/lib/backup';

// Pure module: no rendering, no hooks. Every test drives buildAppBackup /
// readAppBackup / restoreAppStores directly against an injected fake
// Storage (BackupStorage = Pick<Storage, 'getItem'|'setItem'|'removeItem'|
// 'key'|'length'>), never the real localStorage global.
class FakeStorage implements BackupStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  get length(): number {
    return this.data.size;
  }
}

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

beforeEach(() => {
  // buildAppBackup stamps exportedAt with new Date().toISOString(); no
  // assertion here depends on it, but the suite still never touches the
  // real wall clock.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buildAppBackup', () => {
  it("carries app 'ordboj', backupVersion, the progress envelope at the top level, and only this app's non-SRS stores", () => {
    const storage = new FakeStorage();
    storage.setItem('swedish-verbs-settings', JSON.stringify({ theme: 'dark' }));
    storage.setItem('swedish-verbs-stats', JSON.stringify({ streak: 5 }));
    // The SRS store itself must never be duplicated into `stores`: it
    // already rides at the top level via `progress`.
    storage.setItem(SRS_STORAGE_KEY, JSON.stringify({ version: 2, items: {} }));
    // A key from an unrelated app sharing the origin must never leak in.
    storage.setItem('some-other-app-token', 'foreign-value');

    const progress = {
      version: 2,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 3,
          intervalDays: 6,
          easeFactor: 2.1,
          dueAt: 1000,
        },
      },
    };

    const out = JSON.parse(buildAppBackup(progress, storage));

    expect(out.app).toBe('ordboj');
    expect(out.backupVersion).toBe(BACKUP_VERSION);
    expect(out.version).toBe(2);
    expect(out.items).toEqual(progress.items);

    expect(out.stores).toEqual({
      'swedish-verbs-settings': { theme: 'dark' },
      'swedish-verbs-stats': { streak: 5 },
    });
    expect(Object.prototype.hasOwnProperty.call(out.stores, SRS_STORAGE_KEY)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out.stores, 'some-other-app-token')).toBe(false);
  });

  it('a bare JSON scalar stored under an app key round-trips byte for byte through build + restore', () => {
    const sourceStorage = new FakeStorage();
    const rawScalarBytes = JSON.stringify('raw-scalar'); // literally: "raw-scalar"
    sourceStorage.setItem('swedish-verbs-scalar', rawScalarBytes);

    const out = JSON.parse(buildAppBackup({ version: 2, items: {} }, sourceStorage));
    // Round-tripped through the backup file's own JSON encoding, the store
    // value is still exactly the original bytes.
    expect(out.stores['swedish-verbs-scalar']).toBe(rawScalarBytes);

    const destStorage = new FakeStorage();
    const ok = restoreAppStores(out.stores, destStorage);
    expect(ok).toBe(true);
    expect(destStorage.getItem('swedish-verbs-scalar')).toBe(rawScalarBytes);
  });
});

describe('readAppBackup', () => {
  it("kind 'legacy' for a versioned SRS-only envelope ({version, items}) carrying none of the envelope's own fields", () => {
    expect(readAppBackup({ version: 2, items: {} })).toEqual({ kind: 'legacy' });
  });

  it("kind 'legacy' for a bare legacy item map (no version field at all)", () => {
    expect(
      readAppBackup({
        '1-presens': {
          itemId: '1-presens',
          repetitions: 1,
          intervalDays: 1,
          easeFactor: 2.5,
          dueAt: 1000,
        },
      }),
    ).toEqual({ kind: 'legacy' });
  });

  it("kind 'invalid' for a foreign app token", () => {
    expect(
      readAppBackup({ app: 'anki', backupVersion: 2, version: 2, items: {}, stores: {} }),
    ).toEqual({ kind: 'invalid' });
  });

  it.each([
    ['a string', '2'],
    ['zero', 0],
    ['a non-integer', 2.5],
    ['newer than this build understands', 99],
  ])("kind 'invalid' when backupVersion is %s (%j)", (_label, backupVersion) => {
    expect(
      readAppBackup({ app: 'ordboj', backupVersion, version: 2, items: {}, stores: {} }),
    ).toEqual({ kind: 'invalid' });
  });

  it("kind 'invalid' when stores is an array", () => {
    expect(
      readAppBackup({ app: 'ordboj', backupVersion: 2, version: 2, items: {}, stores: [] }),
    ).toEqual({ kind: 'invalid' });
  });

  it("kind 'invalid' when stores is missing entirely", () => {
    expect(readAppBackup({ app: 'ordboj', backupVersion: 2, version: 2, items: {} })).toEqual({
      kind: 'invalid',
    });
  });

  it("kind 'invalid' for a backupVersion-1 file with no swedish-verbs-srs-progress key", () => {
    expect(
      readAppBackup({
        app: 'ordboj',
        backupVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        'swedish-verbs-settings': { theme: 'dark' },
      }),
    ).toEqual({ kind: 'invalid' });
  });

  it("kind 'envelope' for a backupVersion-1 crash-boundary file (flat top-level store keys, as AppErrorBoundary.downloadProgressBackup produces)", () => {
    const progressValue = {
      version: 2,
      items: {
        '1-presens': {
          itemId: '1-presens',
          repetitions: 1,
          intervalDays: 1,
          easeFactor: 2.5,
          dueAt: 1000,
        },
      },
    };
    const crashBoundaryFile = {
      exportedAt: '2026-01-01T00:00:00.000Z',
      app: 'ordboj',
      backupVersion: 1,
      'swedish-verbs-settings': { theme: 'dark' },
      'swedish-verbs-srs-progress': progressValue,
    };

    expect(readAppBackup(crashBoundaryFile)).toEqual({
      kind: 'envelope',
      progress: progressValue,
      stores: { 'swedish-verbs-settings': { theme: 'dark' } },
    });
  });
});

describe('restoreAppStores', () => {
  it('merges: a store the file does not carry is left untouched', () => {
    const storage = new FakeStorage();
    storage.setItem('swedish-verbs-streak', JSON.stringify({ days: 3 }));

    const ok = restoreAppStores({ 'swedish-verbs-settings': { theme: 'dark' } }, storage);

    expect(ok).toBe(true);
    expect(storage.getItem('swedish-verbs-streak')).toBe(JSON.stringify({ days: 3 }));
    expect(storage.getItem('swedish-verbs-settings')).toBe(JSON.stringify({ theme: 'dark' }));
  });

  it('refuses to write a key that does not carry the app prefix', () => {
    const storage = new FakeStorage();
    const ok = restoreAppStores(
      { 'some-other-app-token': 'x', 'swedish-verbs-settings': { a: 1 } },
      storage,
    );

    expect(ok).toBe(true);
    expect(storage.getItem('some-other-app-token')).toBeNull();
    expect(storage.getItem('swedish-verbs-settings')).toBe(JSON.stringify({ a: 1 }));
  });

  it('refuses to write the SRS progress key directly, even if the caller passes it', () => {
    const storage = new FakeStorage();
    const ok = restoreAppStores({ [SRS_STORAGE_KEY]: { version: 2, items: {} } }, storage);

    expect(ok).toBe(true);
    expect(storage.getItem(SRS_STORAGE_KEY)).toBeNull();
  });

  // The pre-v3 SRS backup is written once and never overwritten, so the
  // oldest (pre-migration) copy survives (useSrsProgress.ts). The key
  // carries the swedish-verbs- prefix, so a whole-app export captures it —
  // restore must honor the same never-overwrite rule.
  it('does not overwrite an existing pre-v3 SRS backup, but writes it when absent', () => {
    const withExisting = new FakeStorage();
    withExisting.setItem(PRE_V3_SRS_BACKUP_KEY, 'oldest-local-copy');
    expect(restoreAppStores({ [PRE_V3_SRS_BACKUP_KEY]: 'copy-from-the-file' }, withExisting)).toBe(
      true,
    );
    expect(withExisting.getItem(PRE_V3_SRS_BACKUP_KEY)).toBe('oldest-local-copy');

    const withoutExisting = new FakeStorage();
    expect(
      restoreAppStores({ [PRE_V3_SRS_BACKUP_KEY]: 'copy-from-the-file' }, withoutExisting),
    ).toBe(true);
    expect(withoutExisting.getItem(PRE_V3_SRS_BACKUP_KEY)).toBe('copy-from-the-file');
  });

  it('rolls every touched key back to its previous bytes and returns false when a setItem throws QuotaExceededError', () => {
    const base = new FakeStorage();
    base.setItem('swedish-verbs-a', 'old-a-bytes');
    // 'swedish-verbs-b' does not exist yet: its "previous" value is null.

    const throwing: BackupStorage = {
      getItem: (k) => base.getItem(k),
      setItem: (k, v) => {
        if (k === 'swedish-verbs-b') {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        base.setItem(k, v);
      },
      removeItem: (k) => base.removeItem(k),
      key: (i) => base.key(i),
      get length() {
        return base.length;
      },
    };

    const ok = restoreAppStores(
      {
        'swedish-verbs-a': { updated: true },
        'swedish-verbs-b': { updated: true },
      },
      throwing,
    );

    expect(ok).toBe(false);
    // The key that wrote successfully before the throw is rolled back too.
    expect(base.getItem('swedish-verbs-a')).toBe('old-a-bytes');
    // The key that never existed is rolled back to absent, not left
    // half-written.
    expect(base.getItem('swedish-verbs-b')).toBeNull();
  });
});

// Issue #455: backup.ts carries the settings store opaquely (decode/encode
// through JSON, never reading individual fields), so autoReadAllForms needs
// no special-case handling here - this test is the round-trip proof that
// holds regardless, the same way the "bare JSON scalar" test above pins the
// generic contract rather than one field.
describe('#455: autoReadAllForms survives a whole-app backup + restore round-trip', () => {
  it('exports swedish-verbs-settings with autoReadAllForms: true and restores it intact into a cleared store', () => {
    const sourceStorage = new FakeStorage();
    sourceStorage.setItem(
      'swedish-verbs-settings',
      JSON.stringify({
        version: 1,
        settings: {
          practiceMode: 'typing',
          showExamples: false,
          autoplayAudio: true,
          muteAudio: false,
          autoReadAllForms: true,
          dailyGoal: 20,
          particleDailyGoal: 12,
          cefrLevels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
        },
      }),
    );

    const out = JSON.parse(buildAppBackup({ version: 2, items: {} }, sourceStorage));
    expect(out.stores['swedish-verbs-settings'].settings.autoReadAllForms).toBe(true);

    // Simulates the storage being cleared (a fresh device, or a reset)
    // before the restore runs.
    const destStorage = new FakeStorage();
    const ok = restoreAppStores(out.stores, destStorage);
    expect(ok).toBe(true);

    const restored = JSON.parse(destStorage.getItem('swedish-verbs-settings') as string);
    expect(restored.settings.autoReadAllForms).toBe(true);
  });
});
