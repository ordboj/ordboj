// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { handleAuthRequest } from './handler';
import { applyMigrations } from '../test/migrate';
import { createSqliteD1 } from '../test/sqlite-d1';
import type { Env } from '../env';

const BRANCH = 'https://cursor-ord-109-client-auth-u.ordboj.pages.dev';
const HASHED = 'https://05b54ff5.ordboj.pages.dev';
const PRODUCTION = 'https://ordboj.com';

function testEnv(db: ReturnType<typeof createSqliteD1>): Env {
  return {
    DB: db,
    BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef0123',
    GOOGLE_CLIENT_ID: 'test-google-client',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
  };
}

async function boot(): Promise<Env> {
  const db = createSqliteD1();
  await applyMigrations(db);
  return testEnv(db);
}

function socialRequest(
  page: string,
  callbackPage: string,
  host?: string,
  extra?: HeadersInit,
): Request {
  const headers = new Headers({
    'content-type': 'application/json',
    origin: page,
  });
  if (host) headers.set('host', host);
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Request(`${page}/api/auth/sign-in/social`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: 'google',
      disableRedirect: true,
      callbackURL: `${callbackPage}/`,
      errorCallbackURL: `${callbackPage}/sign-in`,
    }),
  });
}

async function googleRedirectUri(response: Response): Promise<string> {
  const body = (await response.json()) as { url?: string };
  const redirect = new URL(body.url ?? 'https://invalid.example').searchParams.get('redirect_uri');
  return redirect ?? '';
}

function cookieFlags(cookie: string): string {
  return cookie.split(';').slice(1).join(';').toLowerCase();
}

describe('preview OAuth origin', () => {
  it('keeps the Google callback on the preview host that started sign-in', async () => {
    const env = await boot();
    const previous = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = PRODUCTION;
    try {
      const response = await handleAuthRequest(
        socialRequest(BRANCH, BRANCH, 'cursor-ord-109-client-auth-u.ordboj.pages.dev'),
        env,
      );
      expect(response.status).toBe(200);
      const redirectUri = await googleRedirectUri(response.clone());
      expect(redirectUri).toBe(`${BRANCH}/api/auth/callback/google`);
      expect(redirectUri).not.toContain(PRODUCTION);
      const cookies = response.headers.getSetCookie();
      expect(cookies.length).toBeGreaterThan(0);
      for (const cookie of cookies) {
        const flags = cookieFlags(cookie);
        expect(flags).not.toMatch(/domain=/);
        expect(flags).toContain('secure');
        expect(flags).toContain('httponly');
        expect(flags).toContain('samesite=lax');
        expect(cookie.startsWith('__Secure-')).toBe(true);
      }
    } finally {
      if (previous === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previous;
    }
  });

  it('keeps a hashed preview host on that host', async () => {
    const env = await boot();
    const response = await handleAuthRequest(socialRequest(HASHED, HASHED), env);
    expect(response.status).toBe(200);
    expect(await googleRedirectUri(response)).toBe(`${HASHED}/api/auth/callback/google`);
  });

  it('keeps the production host on https://ordboj.com', async () => {
    const env = await boot();
    const response = await handleAuthRequest(
      socialRequest(PRODUCTION, PRODUCTION, 'ordboj.com', {
        'x-forwarded-host': 'evil.example',
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await googleRedirectUri(response)).toBe(`${PRODUCTION}/api/auth/callback/google`);
  });

  it('rejects an unknown host and does not build a callback for it', async () => {
    const env = await boot();
    const response = await handleAuthRequest(
      socialRequest('https://evil.example', 'https://evil.example', 'evil.example'),
      env,
    );
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toContain('evil.example');
    expect(text).not.toContain('accounts.google.com');
    expect(response.headers.get('location')).toBeNull();
  });

  it('rejects a Host header that does not match the request URL', async () => {
    const env = await boot();
    const response = await handleAuthRequest(
      socialRequest(PRODUCTION, PRODUCTION, 'cursor-ord-109-client-auth-u.ordboj.pages.dev'),
      env,
    );
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toContain('accounts.google.com');
    expect(text).not.toContain('ordboj.pages.dev');
  });

  it('rejects a preview sign-in whose callbackURL is https://ordboj.com', async () => {
    const env = await boot();
    const response = await handleAuthRequest(socialRequest(BRANCH, PRODUCTION), env);
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toContain('accounts.google.com');
  });

  it('uses the loopback origin for wrangler and does not set a Secure cookie on http', async () => {
    const env = await boot();
    const loopback = 'http://127.0.0.1:8788';
    const response = await handleAuthRequest(socialRequest(loopback, loopback), env);
    expect(response.status).toBe(200);
    expect(await googleRedirectUri(response.clone())).toBe(`${loopback}/api/auth/callback/google`);
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie.startsWith('__Secure-')).toBe(false);
      expect(cookieFlags(cookie)).not.toContain('secure');
      expect(cookieFlags(cookie)).toContain('httponly');
      expect(cookieFlags(cookie)).toContain('samesite=lax');
      expect(cookieFlags(cookie)).not.toMatch(/domain=/);
    }
  });
});
