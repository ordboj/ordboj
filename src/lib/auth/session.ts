import { useSyncExternalStore } from 'react';
import { AUTH_COPY } from '@/lib/auth/copy';

/**
 * Last confirmed session, so a signed-in learner can keep using app screens
 * while offline. This is a new key. Sign-in and sign-out must not read,
 * write, or delete the anonymous practice stores (SRS v3, settings, the
 * pre-v3 backup, or the answer log).
 */
const HINT_KEY = 'ordboj-auth-hint';
const PASSKEY_FLAG_KEY = 'ordboj-passkey-on-device';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export type AuthSnapshot =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'offline-anonymous' }
  | { status: 'authenticated'; user: AuthUser; offline: boolean };

export type BeforeSignOutResult = void | boolean | { ok: boolean; message?: string };
export type BeforeSignOut = () => Promise<BeforeSignOutResult> | BeforeSignOutResult;

type SignOutResult = { ok: true } | { ok: false; message: string };

const hooks = new Set<BeforeSignOut>();
let snapshot: AuthSnapshot = { status: 'loading' };
let generation = 0;
let started = false;
const listeners = new Set<() => void>();

function publish(next: AuthSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function readHint(): AuthUser | null {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string') return null;
    return { id: parsed.id, email: parsed.email, emailVerified: parsed.emailVerified === true };
  } catch {
    return null;
  }
}

function writeHint(user: AuthUser): void {
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify(user));
  } catch {
    // The hint only helps the next offline launch. A failed write must not
    // throw, and it must not touch any other key.
  }
}

function clearHint(): void {
  try {
    localStorage.removeItem(HINT_KEY);
  } catch {
    // Same rule: never throw, never touch another key.
  }
}

function applyOffline(): void {
  const hint = readHint();
  publish(
    hint ? { status: 'authenticated', user: hint, offline: true } : { status: 'offline-anonymous' },
  );
}

function parseUser(data: unknown): AuthUser | null {
  if (!data || typeof data !== 'object') return null;
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return null;
  const record = user as { id?: unknown; email?: unknown; emailVerified?: unknown };
  if (
    typeof record.id !== 'string' ||
    typeof record.email !== 'string' ||
    !record.email.includes('@')
  ) {
    return null;
  }
  return {
    id: record.id,
    email: record.email,
    emailVerified: record.emailVerified === true,
  };
}

async function readSession(
  response: Response,
): Promise<'missing' | 'unauthorized' | 'unavailable' | AuthUser> {
  if (response.status === 401) return 'unauthorized';
  if (!response.ok) return 'unavailable';
  const text = await response.text();
  if (!text || text === 'null') return 'missing';
  try {
    return parseUser(JSON.parse(text) as unknown) ?? 'missing';
  } catch {
    return 'missing';
  }
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => {
    void refreshSession();
  });
  window.addEventListener('offline', () => {
    void refreshSession();
  });
  void refreshSession();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  ensureStarted();
  return () => {
    listeners.delete(listener);
  };
}

export function useAuthSession(): AuthSnapshot {
  return useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    () => ({ status: 'loading' }) as const,
  );
}

export async function refreshSession(): Promise<void> {
  const ticket = generation;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (ticket !== generation) return;
    applyOffline();
    return;
  }
  try {
    const response = await fetch('/api/auth/get-session', {
      method: 'GET',
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    const result = await readSession(response);
    if (ticket !== generation) return;
    if (result === 'unauthorized' || result === 'missing') {
      clearHint();
      publish({ status: 'anonymous' });
      return;
    }
    if (result === 'unavailable') {
      const hint = readHint();
      publish(
        hint ? { status: 'authenticated', user: hint, offline: true } : { status: 'anonymous' },
      );
      return;
    }
    writeHint(result);
    publish({ status: 'authenticated', user: result, offline: false });
  } catch {
    if (ticket !== generation) return;
    applyOffline();
  }
}

/**
 * Session missing was confirmed by a 401 from an app API (today: get-session;
 * ORD-111 will call this for /api/progress). Locks app routes. Does not
 * delete or overwrite practice data.
 */
export function reportUnauthorized(): void {
  clearHint();
  publish({ status: 'anonymous' });
}

/**
 * ORD-111 registers a sync-before-sign-out hook here. If the hook throws,
 * returns false, or returns { ok: false }, sign-out stops and the session
 * stays. The returned unregister function drops that hook.
 */
export function registerBeforeSignOut(fn: BeforeSignOut): () => void {
  hooks.add(fn);
  return () => {
    hooks.delete(fn);
  };
}

function hookFailure(result: BeforeSignOutResult): string | null {
  if (result === false) return AUTH_COPY.signOutKept;
  if (result && typeof result === 'object' && result.ok === false) {
    const message = result.message?.trim();
    return message ? message : AUTH_COPY.signOutKept;
  }
  return null;
}

export async function signOut(): Promise<SignOutResult> {
  for (const hook of hooks) {
    try {
      const message = hookFailure(await hook());
      if (message) return { ok: false, message };
    } catch {
      return { ok: false, message: AUTH_COPY.signOutKept };
    }
  }
  try {
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: '{}',
    });
    if (!response.ok && response.status !== 401) {
      return { ok: false, message: AUTH_COPY.signOutKept };
    }
  } catch {
    return { ok: false, message: AUTH_COPY.signOutKept };
  }
  clearHint();
  publish({ status: 'anonymous' });
  return { ok: true };
}

export function hasPasskeyOnDevice(): boolean {
  try {
    return localStorage.getItem(PASSKEY_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPasskeyOnDevice(): void {
  try {
    localStorage.setItem(PASSKEY_FLAG_KEY, '1');
  } catch {
    // The flag only shows the passkey sign-in button later. Ignore quota.
  }
}

/** Test isolation. Does not remove practice stores. */
export function resetAuthForTests(): void {
  generation += 1;
  hooks.clear();
  started = false;
  clearHint();
  publish({ status: 'loading' });
}
