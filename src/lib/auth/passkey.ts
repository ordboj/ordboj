import { AUTH_COPY } from '@/lib/auth/copy';
import { resolveAuthBaseURL } from '@/lib/auth/origin';
import type { AuthActionResult } from '@/lib/auth/actions';
import { markPasskeyOnDevice, refreshSession } from '@/lib/auth/session';

async function client() {
  const [{ createAuthClient }, { passkeyClient }] = await Promise.all([
    import('better-auth/client'),
    import('@better-auth/passkey/client'),
  ]);
  return createAuthClient({
    baseURL: resolveAuthBaseURL(window.location.origin),
    plugins: [passkeyClient()],
    fetchOptions: { credentials: 'include' },
  });
}

export async function registerPasskey(): Promise<AuthActionResult> {
  try {
    const result = await (await client()).passkey.addPasskey({ name: 'Ordboj' });
    if (result.error) return { ok: false, message: AUTH_COPY.passkeyFailed };
    markPasskeyOnDevice();
    return { ok: true };
  } catch {
    return { ok: false, message: AUTH_COPY.passkeyUnsupported };
  }
}

export async function signInWithPasskey(): Promise<AuthActionResult> {
  try {
    const result = await (await client()).signIn.passkey();
    if (result.error || !result.data) return { ok: false, message: AUTH_COPY.passkeySignInFailed };
    await refreshSession();
    return { ok: true };
  } catch {
    return { ok: false, message: AUTH_COPY.passkeyUnsupported };
  }
}
