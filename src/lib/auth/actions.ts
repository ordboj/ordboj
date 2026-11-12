import { AUTH_COPY } from '@/lib/auth/copy';
import { assignLocation, callbackURL } from '@/lib/auth/origin';
import { getAuthSnapshot, refreshSession, reportUnauthorized } from '@/lib/auth/session';

export type OAuthProvider = 'google' | 'github' | 'microsoft';

export type AuthActionResult = { ok: true } | { ok: false; message: string };

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value.includes('@') || value.startsWith('@') || value.endsWith('@'))
    return AUTH_COPY.invalidEmail;
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) return AUTH_COPY.passwordTooShort;
  if (password.length > MAX_PASSWORD) return AUTH_COPY.passwordTooLong;
  return null;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    const data = JSON.parse(text) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> | null } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      redirect: 'manual',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: AUTH_COPY.offlineBody };
  }
  if (response.status === 401 && path === '/api/auth/get-session') reportUnauthorized();
  const data = await readJson(response);
  if (response.status === 503) return { ok: false, message: AUTH_COPY.emailUnavailable };
  if (response.status === 429) return { ok: false, message: AUTH_COPY.tooManyRequests };
  if (!response.ok) {
    const code = typeof data?.code === 'string' ? data.code : '';
    if (code === 'EMAIL_NOT_VERIFIED') return { ok: false, message: AUTH_COPY.unverified };
    if (path === '/api/auth/sign-in/email' && response.status === 401) {
      return { ok: false, message: AUTH_COPY.wrongPassword };
    }
    return { ok: false, message: AUTH_COPY.genericError };
  }
  return { ok: true, data };
}

async function confirmSession(): Promise<AuthActionResult> {
  await refreshSession();
  const current = getAuthSnapshot();
  if (current.status !== 'authenticated') return { ok: false, message: AUTH_COPY.genericError };
  return { ok: true };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const result = await postJson('/api/auth/sign-in/email', {
    email: email.trim(),
    password,
    callbackURL: callbackURL('/'),
  });
  if (!result.ok) return result;
  return confirmSession();
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  return postJson('/api/auth/sign-up/email', {
    name: '',
    email: email.trim(),
    password,
    callbackURL: callbackURL('/verify-email?verified=1'),
  });
}

export async function requestMagicLink(email: string): Promise<AuthActionResult> {
  return postJson('/api/auth/sign-in/magic-link', {
    email: email.trim(),
    name: '',
    callbackURL: callbackURL('/'),
    errorCallbackURL: callbackURL('/magic-link'),
  });
}

export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  return postJson('/api/auth/request-password-reset', {
    email: email.trim(),
    redirectTo: callbackURL('/reset-password'),
  });
}

export async function setNewPassword(
  token: string,
  newPassword: string,
): Promise<AuthActionResult> {
  return postJson('/api/auth/reset-password', { token, newPassword });
}

export async function startOAuth(provider: OAuthProvider): Promise<AuthActionResult> {
  const result = await postJson('/api/auth/sign-in/social', {
    provider,
    disableRedirect: true,
    callbackURL: callbackURL('/'),
    errorCallbackURL: callbackURL('/sign-in'),
  });
  if (!result.ok) return result;
  const url = result.data?.url;
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    return { ok: false, message: AUTH_COPY.genericError };
  }
  assignLocation(url);
  return { ok: true };
}
