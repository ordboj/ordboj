// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAuthOptions } from './auth/create-auth';
import { microsoftEmailVerified } from './auth/provider-email';
import { handleAuthRequest } from './auth/handler';
import {
  ADDRESS_DAILY_CAP,
  AUTH_BASE_URL,
  IP_DAILY_CAP,
  MAIL_FROM,
  MAGIC_LINK_TTL_SECONDS,
  PASSKEY_RP_ID,
  RESEND_DAILY_CAP,
  RESEND_MONTHLY_CAP,
  RESET_TTL_SECONDS,
  VERIFICATION_TTL_SECONDS,
} from './auth/constants';
import { createResendMailer, type Mailer, type OutboundMail } from './auth/mailer';
import { mailCounterKey } from './auth/mail-quota';
import { handleProgressRequest } from './auth/progress';
import { applyMigrations } from './test/migrate';
import { createSqliteD1, type TestD1 } from './test/sqlite-d1';
import type { Env } from './env';

const ORIGIN = 'https://ordboj.com';
const PASSWORD = 'correct-horse';
const NEW_PASSWORD = 'new-password-2';

function recordingMailer(): { mailer: Mailer; sent: OutboundMail[] } {
  const sent: OutboundMail[] = [];
  return {
    sent,
    mailer: {
      async send(mail) {
        sent.push(mail);
      },
    },
  };
}

function testEnv(db: TestD1, overrides: Partial<Env> = {}): Env & { DB: D1Database } {
  return {
    DB: db,
    BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef0123',
    GOOGLE_CLIENT_ID: 'test-google-client',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    GITHUB_CLIENT_ID: 'test-github-client',
    GITHUB_CLIENT_SECRET: 'test-github-secret',
    MICROSOFT_CLIENT_ID: 'test-microsoft-client',
    MICROSOFT_CLIENT_SECRET: 'test-microsoft-secret',
    ...overrides,
  };
}

async function boot(overrides: Partial<Env> = {}) {
  const db = createSqliteD1();
  await applyMigrations(db);
  const box = recordingMailer();
  const env = testEnv(db, overrides);
  return { db, env, ...box };
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0] ?? '')
    .filter((value) => value.includes('='))
    .join('; ');
}

async function readBody(response: Response): Promise<{
  status: number;
  body: Record<string, unknown> | string | null;
  text: string;
  cookies: string;
  location: string | null;
}> {
  const text = await response.text();
  let body: Record<string, unknown> | string | null = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    body,
    text,
    cookies: cookieHeader(response),
    location: response.headers.get('location'),
  };
}

async function authFetch(
  env: Env,
  path: string,
  init: RequestInit & { ip?: string; cookie?: string; mailer?: Mailer | null } = {},
): Promise<Awaited<ReturnType<typeof readBody>>> {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) headers.set('origin', ORIGIN);
  if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', init.ip ?? '203.0.113.10');
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const request = new Request(`${ORIGIN}${path}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.body,
  });
  const response = await handleAuthRequest(request, env, {
    mailer: init.mailer === undefined ? undefined : init.mailer,
  });
  return readBody(response);
}

async function progressFetch(
  env: Env,
  init: RequestInit & { cookie?: string } = {},
): Promise<Awaited<ReturnType<typeof readBody>>> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const request = new Request(`${ORIGIN}/api/progress`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
  });
  const response = await handleProgressRequest(request, env);
  return readBody(response);
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

function findLastMail(items: OutboundMail[], predicate: (item: OutboundMail) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && predicate(item)) return item;
  }
  return undefined;
}

function decodeJwtTimes(token: string): { iat: number; exp: number } {
  const part = token.split('.')[1] ?? '';
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return JSON.parse(json) as { iat: number; exp: number };
}

function urlIn(mail: OutboundMail): URL {
  const match = mail.text.match(/https:\/\/ordboj\.com\S+/);
  if (!match?.[0]) throw new Error(`No URL in ${mail.kind} mail`);
  return new URL(match[0]);
}

async function userByEmail(db: TestD1, email: string) {
  return db
    .prepare('SELECT id, name, email, emailVerified, image FROM user WHERE email = ?')
    .bind(email.toLowerCase())
    .first<{
      id: string;
      name: string;
      email: string;
      emailVerified: number;
      image: string | null;
    }>();
}

async function accountsFor(db: TestD1, userId: string) {
  const result = await db
    .prepare(
      'SELECT providerId, accountId, password, accessToken, idToken FROM account WHERE userId = ?',
    )
    .bind(userId)
    .all<{
      providerId: string;
      accountId: string;
      password: string | null;
      accessToken: string | null;
      idToken: string | null;
    }>();
  return result.results;
}

async function rateHits(db: TestD1): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(count), 0) AS hits FROM rateLimit')
    .first<{ hits: number }>();
  return Number(row?.hits ?? 0);
}

async function signUp(env: Env, email: string, mailer: Mailer, name = 'Ada Lovelace') {
  return authFetch(env, '/api/auth/sign-up/email', {
    body: jsonBody({
      name,
      email,
      password: PASSWORD,
      callbackURL: `${ORIGIN}/`,
    }),
    mailer,
  });
}

async function verifyEmail(env: Env, mail: OutboundMail, mailer: Mailer) {
  const url = urlIn(mail);
  const token = url.searchParams.get('token');
  expect(token).toBeTruthy();
  return authFetch(env, `/api/auth/verify-email?token=${encodeURIComponent(token ?? '')}`, {
    method: 'GET',
    mailer,
  });
}

async function signIn(env: Env, email: string, password: string, mailer: Mailer | null) {
  return authFetch(env, '/api/auth/sign-in/email', {
    body: jsonBody({ email, password }),
    mailer,
  });
}

async function verifiedSession(env: Env, email: string, mailer: Mailer, sent: OutboundMail[]) {
  const before = sent.length;
  const created = await signUp(env, email, mailer);
  expect(created.status).toBe(200);
  const mail = sent.slice(before).find((item) => item.kind === 'verification');
  expect(mail).toBeTruthy();
  const verified = await verifyEmail(env, mail as OutboundMail, mailer);
  expect(verified.status).toBe(200);
  const signedIn = await signIn(env, email, PASSWORD, mailer);
  expect(signedIn.status).toBe(200);
  expect(signedIn.cookies).toContain('=');
  return signedIn.cookies;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function withGithubProfile(
  profile: { email: string; emailVerified: boolean; name: string; id?: string },
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (url.startsWith('https://github.com/login/oauth/access_token')) {
      return Response.json({
        access_token: 'test-access-token',
        token_type: 'bearer',
        scope: 'read:user',
      });
    }
    if (url === 'https://api.github.com/user') {
      return Response.json({
        id: profile.id ?? '4242',
        login: 'ada',
        name: profile.name,
        email: profile.email,
        avatar_url: 'https://example.com/avatar.png',
      });
    }
    if (url === 'https://api.github.com/user/emails') {
      return Response.json([
        {
          email: profile.email,
          primary: true,
          verified: profile.emailVerified,
          visibility: 'public',
        },
      ]);
    }
    return original(input, init);
  };
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function githubSignIn(env: Env, mailer: Mailer | null, cookie = '') {
  const start = await authFetch(env, '/api/auth/sign-in/social', {
    body: jsonBody({
      provider: 'github',
      callbackURL: `${ORIGIN}/`,
      disableRedirect: true,
    }),
    mailer,
    cookie,
  });
  expect(start.status).toBe(200);
  const startBody = start.body as { url?: string };
  const authorize = new URL(startBody.url ?? '');
  const state = authorize.searchParams.get('state');
  expect(state).toBeTruthy();
  return authFetch(
    env,
    `/api/auth/callback/github?code=test-code&state=${encodeURIComponent(state ?? '')}`,
    { method: 'GET', mailer, cookie: start.cookies || cookie },
  );
}

async function medianMs(run: () => Promise<void>, samples = 3): Promise<number> {
  const values: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now();
    await run();
    values.push(performance.now() - start);
  }
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)] ?? 0;
}

function similarTiming(left: number, right: number) {
  const ratio = left / Math.max(right, 1);
  expect(ratio).toBeGreaterThan(1 / 3);
  expect(ratio).toBeLessThan(3);
}

function stableSignUp(body: Record<string, unknown>) {
  const user = body.user as Record<string, unknown>;
  return {
    token: body.token ?? null,
    name: user.name,
    emailVerified: user.emailVerified,
    image: user.image ?? null,
    keys: Object.keys(body).sort(),
    userKeys: Object.keys(user).sort(),
  };
}

describe('ORD-108 auth backend', () => {
  it('rateLimit rows persist in D1 across two auth instances', async () => {
    const { db, env, mailer } = await boot();
    const first = await signIn(env, 'nobody@example.com', PASSWORD, mailer);
    expect(first.status).toBeGreaterThanOrEqual(400);
    const afterFirst = await rateHits(db);
    expect(afterFirst).toBeGreaterThan(0);

    const second = await signIn(env, 'nobody@example.com', PASSWORD, mailer);
    expect(second.status).toBeGreaterThanOrEqual(400);
    const afterSecond = await rateHits(db);
    expect(afterSecond).toBeGreaterThan(afterFirst);
  });

  it('does not write a rateLimit row for get-session', async () => {
    const { db, env, mailer, sent } = await boot();
    const cookie = await verifiedSession(env, 'session@example.com', mailer, sent);
    const before = await rateHits(db);
    const session = await authFetch(env, '/api/auth/get-session', {
      method: 'GET',
      cookie,
      mailer,
    });
    expect(session.status).toBe(200);
    expect(JSON.stringify(session.body)).toContain('session@example.com');
    expect(await rateHits(db)).toBe(before);
  });

  it('unverified provider profile does not link or take over an existing email', async () => {
    const { db, env, mailer, sent } = await boot();
    const email = 'taken@example.com';
    await verifiedSession(env, email, mailer, sent);
    const before = await userByEmail(db, email);
    expect(before).toBeTruthy();

    await withGithubProfile({ email, emailVerified: false, name: 'Attacker Name' }, async () => {
      const callback = await githubSignIn(env, mailer);
      expect(callback.location ?? callback.text).toMatch(/link|error/i);
      const user = await userByEmail(db, email);
      expect(user?.id).toBe(before?.id);
      expect(user?.name).toBe('');
      const accounts = await accountsFor(db, user?.id ?? '');
      expect(accounts.map((account) => account.providerId)).not.toContain('github');
      const stillPassword = await signIn(env, email, PASSWORD, mailer);
      expect(stillPassword.status).toBe(200);
    });
  });

  it('verified provider profile links to the same email', async () => {
    const { db, env, mailer, sent } = await boot();
    const email = 'link@example.com';
    await verifiedSession(env, email, mailer, sent);
    const before = await userByEmail(db, email);

    await withGithubProfile(
      { email, emailVerified: true, name: 'Provider Name', id: '99' },
      async () => {
        const callback = await githubSignIn(env, mailer);
        expect(callback.status).toBe(302);
        expect(callback.cookies).toContain('=');
        const user = await userByEmail(db, email);
        expect(user?.id).toBe(before?.id);
        expect(user?.name).toBe('');
        expect(user?.image).toBeNull();
        const accounts = await accountsFor(db, user?.id ?? '');
        const github = accounts.find((account) => account.providerId === 'github');
        expect(github?.accountId).toBe('99');
        expect(github?.accessToken).toBeNull();
        expect(github?.idToken).toBeNull();
        const password = await signIn(env, email, PASSWORD, mailer);
        expect(password.status).toBe(200);
      },
    );
  });

  it('password sign-up sends verification mail and stays unverified until the link is used', async () => {
    const { db, env, mailer, sent } = await boot();
    const email = 'verify@example.com';
    const created = await signUp(env, email, mailer, 'Should Not Stick');
    expect(created.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe('verification');
    expect(sent[0]?.from).toBe(MAIL_FROM);
    expect(sent[0]?.to).toBe(email);
    const user = await userByEmail(db, email);
    expect(user?.emailVerified).toBe(0);
    expect(user?.name).toBe('');
    const blocked = await signIn(env, email, PASSWORD, mailer);
    expect(blocked.status).toBe(403);

    const verified = await verifyEmail(env, sent[0] as OutboundMail, mailer);
    expect(verified.status).toBe(200);
    expect((await userByEmail(db, email))?.emailVerified).toBe(1);
    const allowed = await signIn(env, email, PASSWORD, mailer);
    expect(allowed.status).toBe(200);
  });

  it('password reset mail sets a new password', async () => {
    const { env, mailer, sent } = await boot();
    const email = 'reset@example.com';
    await verifiedSession(env, email, mailer, sent);
    const before = sent.length;
    const requested = await authFetch(env, '/api/auth/request-password-reset', {
      body: jsonBody({ email, redirectTo: `${ORIGIN}/` }),
      mailer,
    });
    expect(requested.status).toBe(200);
    const mail = sent.slice(before).find((item) => item.kind === 'reset');
    expect(mail?.from).toBe(MAIL_FROM);
    const token =
      urlIn(mail as OutboundMail)
        .pathname.split('/')
        .pop() ?? '';
    const reset = await authFetch(env, '/api/auth/reset-password', {
      body: jsonBody({ newPassword: NEW_PASSWORD, token }),
      mailer,
    });
    expect(reset.status).toBe(200);
    const oldPassword = await signIn(env, email, PASSWORD, mailer);
    expect(oldPassword.status).toBeGreaterThanOrEqual(400);
    const next = await signIn(env, email, NEW_PASSWORD, mailer);
    expect(next.status).toBe(200);
  });

  it('per-address send cap rejects the next mail', async () => {
    const { env, mailer, sent } = await boot();
    const email = 'cap-address@example.com';
    for (let index = 0; index < ADDRESS_DAILY_CAP; index += 1) {
      const response = await authFetch(env, '/api/auth/sign-in/magic-link', {
        body: jsonBody({ email, callbackURL: `${ORIGIN}/` }),
        mailer,
      });
      expect(response.status).toBe(200);
    }
    expect(sent.filter((mail) => mail.to === email)).toHaveLength(ADDRESS_DAILY_CAP);
    const rejected = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email, callbackURL: `${ORIGIN}/` }),
      mailer,
    });
    expect(rejected.status).toBe(429);
    expect(sent.filter((mail) => mail.to === email)).toHaveLength(ADDRESS_DAILY_CAP);
    const other = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: 'other-address@example.com', callbackURL: `${ORIGIN}/` }),
      mailer,
      ip: '203.0.113.20',
    });
    expect(other.status).toBe(200);
  });

  it('per-IP send cap rejects the next mail', async () => {
    const { env, mailer, sent } = await boot();
    const ip = '198.51.100.8';
    for (let index = 0; index < IP_DAILY_CAP; index += 1) {
      const response = await authFetch(env, '/api/auth/sign-in/magic-link', {
        body: jsonBody({ email: `ip-${index}@example.com`, callbackURL: `${ORIGIN}/` }),
        mailer,
        ip,
      });
      expect(response.status).toBe(200);
    }
    expect(sent).toHaveLength(IP_DAILY_CAP);
    const rejected = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: 'ip-over@example.com', callbackURL: `${ORIGIN}/` }),
      mailer,
      ip,
    });
    expect(rejected.status).toBe(429);
    expect(sent).toHaveLength(IP_DAILY_CAP);
    const otherIp = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: 'ip-over@example.com', callbackURL: `${ORIGIN}/` }),
      mailer,
      ip: '198.51.100.9',
    });
    expect(otherIp.status).toBe(200);
  });

  it('verification, reset, and magic-link share the daily and monthly quota', async () => {
    const { db, env, mailer, sent } = await boot();
    const email = 'quota@example.com';
    await signUp(env, email, mailer);
    await authFetch(env, '/api/auth/request-password-reset', {
      body: jsonBody({ email, redirectTo: `${ORIGIN}/` }),
      mailer,
    });
    await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email, callbackURL: `${ORIGIN}/` }),
      mailer,
    });
    expect(sent.map((mail) => mail.kind).sort()).toEqual(['magic-link', 'reset', 'verification']);
    const now = new Date();
    const day = mailCounterKey('day', { now });
    const month = mailCounterKey('month', { now });
    const dayRow = await db
      .prepare('SELECT count FROM mail_counter WHERE scope = ? AND subject = ?')
      .bind(day.scope, day.subject)
      .first<{ count: number }>();
    const monthRow = await db
      .prepare('SELECT count FROM mail_counter WHERE scope = ? AND subject = ?')
      .bind(month.scope, month.subject)
      .first<{ count: number }>();
    expect(dayRow?.count).toBe(3);
    expect(monthRow?.count).toBe(3);

    await db
      .prepare('UPDATE mail_counter SET count = ? WHERE scope = ? AND subject = ?')
      .bind(RESEND_DAILY_CAP, day.scope, day.subject)
      .run();
    const blockedDay = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: 'day-cap@example.com', callbackURL: `${ORIGIN}/` }),
      mailer,
    });
    expect(blockedDay.status).toBe(429);
    expect(sent.map((mail) => mail.to)).not.toContain('day-cap@example.com');

    await db
      .prepare('UPDATE mail_counter SET count = ? WHERE scope = ? AND subject = ?')
      .bind(0, day.scope, day.subject)
      .run();
    await db
      .prepare('UPDATE mail_counter SET count = ? WHERE scope = ? AND subject = ?')
      .bind(RESEND_MONTHLY_CAP, month.scope, month.subject)
      .run();
    const blockedMonth = await authFetch(env, '/api/auth/sign-up/email', {
      body: jsonBody({
        name: 'Month',
        email: 'month-cap@example.com',
        password: PASSWORD,
      }),
      mailer,
    });
    expect(blockedMonth.status).toBe(429);
    expect(sent.map((mail) => mail.to)).not.toContain('month-cap@example.com');

    const cookie = await signIn(env, email, PASSWORD, mailer);
    expect(cookie.status).toBe(403);
    const verified = await verifyEmail(env, sent[0] as OutboundMail, mailer);
    expect(verified.status).toBe(200);
    const session = await signIn(env, email, PASSWORD, mailer);
    expect(session.status).toBe(200);
    const stillIn = await authFetch(env, '/api/auth/get-session', {
      method: 'GET',
      cookie: session.cookies,
      mailer,
    });
    expect(stillIn.status).toBe(200);

    await withGithubProfile(
      { email: 'oauth-during-cap@example.com', emailVerified: true, name: 'OAuth' },
      async () => {
        const callback = await githubSignIn(env, mailer);
        expect(callback.status).toBe(302);
        expect(callback.cookies).toContain('=');
      },
    );
  });

  it('sign-up, magic-link, and password reset do not enumerate accounts', async () => {
    const { env, mailer } = await boot();
    const existing = 'known@example.com';
    await signUp(env, existing, mailer);

    const knownSignUp = await signUp(env, existing, mailer);
    const unknownSignUp = await signUp(env, 'unknown-sign-up@example.com', mailer);
    expect(knownSignUp.status).toBe(unknownSignUp.status);
    const knownUser = (knownSignUp.body as { user: { email: string } }).user;
    const unknownUser = (unknownSignUp.body as { user: { email: string } }).user;
    expect(knownUser.email).toBe(existing);
    expect(unknownUser.email).toBe('unknown-sign-up@example.com');
    expect(stableSignUp(knownSignUp.body as Record<string, unknown>)).toEqual(
      stableSignUp(unknownSignUp.body as Record<string, unknown>),
    );
    expect(JSON.stringify(knownSignUp.body)).not.toMatch(/already exists/i);

    const knownLink = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: existing, callbackURL: `${ORIGIN}/` }),
      mailer,
    });
    const unknownLink = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: 'unknown-link@example.com', callbackURL: `${ORIGIN}/` }),
      mailer,
    });
    expect(knownLink.status).toBe(unknownLink.status);
    expect(knownLink.body).toEqual(unknownLink.body);

    const knownReset = await authFetch(env, '/api/auth/request-password-reset', {
      body: jsonBody({ email: existing, redirectTo: `${ORIGIN}/` }),
      mailer,
    });
    const unknownReset = await authFetch(env, '/api/auth/request-password-reset', {
      body: jsonBody({ email: 'unknown-reset@example.com', redirectTo: `${ORIGIN}/` }),
      mailer,
    });
    expect(knownReset.status).toBe(unknownReset.status);
    expect(knownReset.body).toEqual(unknownReset.body);

    const knownSignUpMs = await medianMs(async () => {
      await signUp(env, existing, mailer);
    }, 1);
    const unknownSignUpMs = await medianMs(async () => {
      await signUp(env, `fresh-${crypto.randomUUID()}@example.com`, mailer);
    }, 1);
    similarTiming(knownSignUpMs, unknownSignUpMs);

    const knownLinkMs = await medianMs(async () => {
      await authFetch(env, '/api/auth/sign-in/magic-link', {
        body: jsonBody({ email: existing, callbackURL: `${ORIGIN}/` }),
        mailer,
        ip: '203.0.113.40',
      });
    }, 1);
    const unknownLinkMs = await medianMs(async () => {
      await authFetch(env, '/api/auth/sign-in/magic-link', {
        body: jsonBody({
          email: `fresh-${crypto.randomUUID()}@example.com`,
          callbackURL: `${ORIGIN}/`,
        }),
        mailer,
        ip: '203.0.113.41',
      });
    }, 1);
    similarTiming(knownLinkMs, unknownLinkMs);

    const knownResetMs = await medianMs(async () => {
      await authFetch(env, '/api/auth/request-password-reset', {
        body: jsonBody({ email: existing, redirectTo: `${ORIGIN}/` }),
        mailer,
        ip: '203.0.113.42',
      });
    }, 1);
    const unknownResetMs = await medianMs(async () => {
      await authFetch(env, '/api/auth/request-password-reset', {
        body: jsonBody({
          email: `fresh-${crypto.randomUUID()}@example.com`,
          redirectTo: `${ORIGIN}/`,
        }),
        mailer,
        ip: '203.0.113.43',
      });
    }, 1);
    similarTiming(knownResetMs, unknownResetMs);
  });

  it('unverified provider does not block a later verified sign-in for the same email', async () => {
    const { db, env, mailer } = await boot();
    const email = 'claim@example.com';
    let attackerCookie = '';
    await withGithubProfile(
      { email, emailVerified: false, name: 'Attacker', id: '111' },
      async () => {
        const callback = await githubSignIn(env, mailer);
        expect(callback.status).toBe(302);
        attackerCookie = callback.cookies;
      },
    );
    const created = await userByEmail(db, email);
    expect(created?.emailVerified).toBe(0);
    expect((await accountsFor(db, created?.id ?? '')).map((account) => account.accountId)).toEqual([
      '111',
    ]);

    await withGithubProfile({ email, emailVerified: true, name: 'Owner', id: '222' }, async () => {
      const callback = await githubSignIn(env, mailer);
      expect(callback.status).toBe(302);
    });

    const owner = await userByEmail(db, email);
    expect(owner?.id).toBe(created?.id);
    expect(owner?.emailVerified).toBe(1);
    const accounts = await accountsFor(db, owner?.id ?? '');
    expect(accounts.map((account) => account.accountId)).toEqual(['222']);
    const attacker = await authFetch(env, '/api/auth/get-session', {
      method: 'GET',
      cookie: attackerCookie,
      mailer,
    });
    expect(JSON.stringify(attacker.body)).not.toContain(email);
    const users = await db.prepare('SELECT COUNT(*) AS n FROM user').first<{ n: number }>();
    expect(Number(users?.n)).toBe(1);
  });

  it('a Microsoft profile without email_verified or xms_edov is not verified', () => {
    expect(microsoftEmailVerified(undefined)).toBe(false);
    expect(microsoftEmailVerified({})).toBe(false);
    expect(microsoftEmailVerified({ email_verified: false, xms_edov: false })).toBe(false);
    expect(microsoftEmailVerified({ email_verified: 'false', xms_edov: 'false' })).toBe(false);
    expect(microsoftEmailVerified({ email_verified: true })).toBe(true);
    expect(microsoftEmailVerified({ xms_edov: true })).toBe(true);
    expect(microsoftEmailVerified({ xms_edov: 'true' })).toBe(true);
  });

  it('unknown and existing reset requests hit the address cap together', async () => {
    const { db, env, mailer } = await boot();
    const existing = 'cap-known@example.com';
    await signUp(env, existing, mailer);
    await db.prepare('DELETE FROM mail_counter').run();
    const known: number[] = [];
    const unknown: number[] = [];
    for (let index = 0; index < ADDRESS_DAILY_CAP + 1; index += 1) {
      const knownResponse = await authFetch(env, '/api/auth/request-password-reset', {
        body: jsonBody({ email: existing, redirectTo: `${ORIGIN}/` }),
        mailer,
        ip: '203.0.113.80',
      });
      const unknownResponse = await authFetch(env, '/api/auth/request-password-reset', {
        body: jsonBody({ email: 'cap-unknown@example.com', redirectTo: `${ORIGIN}/` }),
        mailer,
        ip: '203.0.113.81',
      });
      known.push(knownResponse.status);
      unknown.push(unknownResponse.status);
    }
    expect(known).toEqual(unknown);
    expect(known[ADDRESS_DAILY_CAP - 1]).toBe(200);
    expect(known[ADDRESS_DAILY_CAP]).toBe(429);
  });

  it('reset does not await the mailer for an existing or an unknown email', async () => {
    const { env, mailer, sent } = await boot();
    const existing = 'await-known@example.com';
    await signUp(env, existing, mailer);
    expect(sent.some((mail) => mail.kind === 'verification')).toBe(true);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hanging: Mailer = {
      async send() {
        await gate;
      },
    };
    const race = async (email: string, ip: string) => {
      const pending = authFetch(env, '/api/auth/request-password-reset', {
        body: jsonBody({ email, redirectTo: `${ORIGIN}/` }),
        mailer: hanging,
        ip,
      });
      return Promise.race([
        pending.then((response) => ({ kind: 'returned' as const, status: response.status })),
        new Promise<{ kind: 'blocked' }>((resolve) => {
          setTimeout(() => resolve({ kind: 'blocked' }), 80);
        }),
      ]);
    };
    const known = await race(existing, '203.0.113.90');
    const unknown = await race('await-unknown@example.com', '203.0.113.91');
    release();
    expect(known.kind).toBe('returned');
    expect(unknown.kind).toBe('returned');
    if (known.kind === 'returned') expect(known.status).toBe(200);
    if (unknown.kind === 'returned') expect(unknown.status).toBe(200);
  });

  it('two verification resends in the same second both return 200', async () => {
    const { env, mailer } = await boot();
    const email = 'resend@example.com';
    await signUp(env, email, mailer);
    const first = await authFetch(env, '/api/auth/send-verification-email', {
      body: jsonBody({ email }),
      mailer,
    });
    const second = await authFetch(env, '/api/auth/send-verification-email', {
      body: jsonBody({ email }),
      mailer,
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('a sign-up password does not survive verify then verified GitHub', async () => {
    const { db, env, mailer, sent } = await boot();
    const email = 'victim-github@example.com';
    await signUp(env, email, mailer);
    const verification = sent.find((item) => item.kind === 'verification') as OutboundMail;
    const verified = await verifyEmail(env, verification, mailer);
    expect(verified.status).toBe(200);
    expect((await userByEmail(db, email))?.emailVerified).toBe(1);
    await withGithubProfile({ email, emailVerified: true, name: 'Victim', id: '777' }, async () => {
      const callback = await githubSignIn(env, mailer);
      expect(callback.status).toBe(302);
    });
    const password = await signIn(env, email, PASSWORD, mailer);
    expect(password.status).toBeGreaterThanOrEqual(400);
    const user = await userByEmail(db, email);
    const accounts = await accountsFor(db, user?.id ?? '');
    expect(
      accounts.some((account) => account.providerId === 'credential' && account.password),
    ).toBe(false);
    expect(
      accounts.some((account) => account.providerId === 'github' && account.accountId === '777'),
    ).toBe(true);
  });

  it('unverified password cannot sign in after magic link or verified OAuth', async () => {
    const magic = await boot();
    const magicEmail = 'hijack-magic@example.com';
    await signUp(magic.env, magicEmail, magic.mailer);
    const blocked = await signIn(magic.env, magicEmail, PASSWORD, magic.mailer);
    expect(blocked.status).toBe(403);
    const link = await authFetch(magic.env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: magicEmail, callbackURL: `${ORIGIN}/` }),
      mailer: magic.mailer,
    });
    expect(link.status).toBe(200);
    const mail = magic.sent.find((item) => item.kind === 'magic-link');
    const verifyUrl = urlIn(mail as OutboundMail);
    const verified = await authFetch(magic.env, `${verifyUrl.pathname}${verifyUrl.search}`, {
      method: 'GET',
      mailer: magic.mailer,
    });
    expect(verified.status).toBe(302);
    expect((await userByEmail(magic.db, magicEmail))?.emailVerified).toBe(1);
    const passwordAfterMagic = await signIn(magic.env, magicEmail, PASSWORD, magic.mailer);
    expect(passwordAfterMagic.status).toBeGreaterThanOrEqual(400);
    expect(passwordAfterMagic.cookies).not.toMatch(/session/i);

    const oauth = await boot();
    const oauthEmail = 'hijack-oauth@example.com';
    await signUp(oauth.env, oauthEmail, oauth.mailer);
    const before = await userByEmail(oauth.db, oauthEmail);
    await withGithubProfile({ email: oauthEmail, emailVerified: true, name: 'Owner' }, async () => {
      const callback = await githubSignIn(oauth.env, oauth.mailer);
      expect(callback.status).toBe(302);
      const user = await userByEmail(oauth.db, oauthEmail);
      expect(user?.id).toBe(before?.id);
      expect(user?.emailVerified).toBe(1);
      const accounts = await accountsFor(oauth.db, user?.id ?? '');
      expect(
        accounts.some((account) => account.providerId === 'credential' && account.password),
      ).toBe(false);
    });
    const passwordAfterOAuth = await signIn(oauth.env, oauthEmail, PASSWORD, oauth.mailer);
    expect(passwordAfterOAuth.status).toBeGreaterThanOrEqual(400);
  });

  it('magic-link, verification, and reset tokens are single-use and short-lived, and reset ends other sessions', async () => {
    const { db, env, mailer, sent } = await boot();
    const email = 'tokens@example.com';
    await signUp(env, email, mailer);
    const verification = sent.find((item) => item.kind === 'verification') as OutboundMail;
    const verificationUrl = urlIn(verification);
    const verificationToken = verificationUrl.searchParams.get('token') ?? '';
    const jwtBody = decodeJwtTimes(verificationToken);
    expect(jwtBody.exp - jwtBody.iat).toBeLessThanOrEqual(VERIFICATION_TTL_SECONDS);
    const firstVerify = await verifyEmail(env, verification, mailer);
    expect(firstVerify.status).toBe(200);
    // The owner signs in after verification, so this password is proven and
    // a later magic link must not delete it. The reset test below needs it.
    const proved = await signIn(env, email, PASSWORD, mailer);
    expect(proved.status).toBe(200);
    const secondVerify = await verifyEmail(env, verification, mailer);
    expect(secondVerify.status).toBeGreaterThanOrEqual(400);

    const expiring = await signUp(env, 'expire-verify@example.com', mailer);
    expect(expiring.status).toBe(200);
    await db.prepare('UPDATE mail_token SET expires_at = ?').bind(0).run();
    const expiredMail = sent.find(
      (item) => item.to === 'expire-verify@example.com',
    ) as OutboundMail;
    const expiredVerify = await verifyEmail(env, expiredMail, mailer);
    expect(expiredVerify.status).toBeGreaterThanOrEqual(400);
    expect((await userByEmail(db, 'expire-verify@example.com'))?.emailVerified).toBe(0);

    const link = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email, callbackURL: `${ORIGIN}/` }),
      mailer,
    });
    expect(link.status).toBe(200);
    const magic = sent.find((item) => item.kind === 'magic-link') as OutboundMail;
    const magicRow = await db
      .prepare(
        "SELECT expiresAt, createdAt FROM verification WHERE identifier LIKE 'magic-link:%' ORDER BY createdAt DESC LIMIT 1",
      )
      .first<{ expiresAt: string | number; createdAt: string | number }>();
    const magicTtl =
      Date.parse(String(magicRow?.expiresAt)) - Date.parse(String(magicRow?.createdAt));
    expect(magicTtl).toBeLessThanOrEqual(MAGIC_LINK_TTL_SECONDS * 1000 + 2000);
    const magicUrl = urlIn(magic);
    const magicOnce = await authFetch(env, `${magicUrl.pathname}${magicUrl.search}`, {
      method: 'GET',
      mailer,
    });
    expect(magicOnce.status).toBe(302);
    const magicTwice = await authFetch(env, `${magicUrl.pathname}${magicUrl.search}`, {
      method: 'GET',
      mailer,
    });
    expect(magicTwice.location ?? magicTwice.text).toMatch(/INVALID_TOKEN|error/i);

    const freshLink = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: 'expire-link@example.com', callbackURL: `${ORIGIN}/` }),
      mailer,
      ip: '203.0.113.50',
    });
    expect(freshLink.status).toBe(200);
    await db
      .prepare("UPDATE verification SET expiresAt = ? WHERE identifier LIKE 'magic-link:%'")
      .bind('2000-01-01T00:00:00.000Z')
      .run();
    const expiredLink = sent.find((item) => item.to === 'expire-link@example.com') as OutboundMail;
    const expiredUrl = urlIn(expiredLink);
    const expiredMagic = await authFetch(env, `${expiredUrl.pathname}${expiredUrl.search}`, {
      method: 'GET',
      mailer,
    });
    expect(expiredMagic.location ?? expiredMagic.text).toMatch(/INVALID_TOKEN|error/i);

    const first = await signIn(env, email, PASSWORD, mailer);
    const second = await signIn(env, email, PASSWORD, mailer);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const requested = await authFetch(env, '/api/auth/request-password-reset', {
      body: jsonBody({ email, redirectTo: `${ORIGIN}/` }),
      mailer,
      ip: '203.0.113.51',
    });
    expect(requested.status).toBe(200);
    const resetMail = findLastMail(
      sent,
      (item) => item.kind === 'reset' && item.to === email,
    ) as OutboundMail;
    const resetRow = await db
      .prepare(
        "SELECT expiresAt, createdAt FROM verification WHERE identifier LIKE 'reset-password:%' ORDER BY createdAt DESC LIMIT 1",
      )
      .first<{ expiresAt: string | number; createdAt: string | number }>();
    const resetTtl =
      Date.parse(String(resetRow?.expiresAt)) - Date.parse(String(resetRow?.createdAt));
    expect(resetTtl).toBeLessThanOrEqual(RESET_TTL_SECONDS * 1000 + 2000);
    const token = urlIn(resetMail).pathname.split('/').pop() ?? '';
    const reset = await authFetch(env, '/api/auth/reset-password', {
      body: jsonBody({ newPassword: NEW_PASSWORD, token }),
      mailer,
    });
    expect(reset.status).toBe(200);
    const again = await authFetch(env, '/api/auth/reset-password', {
      body: jsonBody({ newPassword: 'another-password', token }),
      mailer,
    });
    expect(again.status).toBeGreaterThanOrEqual(400);
    const oldOne = await authFetch(env, '/api/auth/get-session', {
      method: 'GET',
      cookie: first.cookies,
      mailer,
    });
    const oldTwo = await authFetch(env, '/api/auth/get-session', {
      method: 'GET',
      cookie: second.cookies,
      mailer,
    });
    expect(JSON.stringify(oldOne.body)).not.toContain(email);
    expect(JSON.stringify(oldTwo.body)).not.toContain(email);

    const expireReset = await authFetch(env, '/api/auth/request-password-reset', {
      body: jsonBody({ email, redirectTo: `${ORIGIN}/` }),
      mailer,
      ip: '203.0.113.52',
    });
    expect(expireReset.status).toBe(200);
    await db
      .prepare("UPDATE verification SET expiresAt = ? WHERE identifier LIKE 'reset-password:%'")
      .bind('2000-01-01T00:00:00.000Z')
      .run();
    const expiredResetMail = findLastMail(
      sent,
      (item) => item.kind === 'reset' && item.to === email,
    ) as OutboundMail;
    const expiredToken = urlIn(expiredResetMail).pathname.split('/').pop() ?? '';
    const expiredReset = await authFetch(env, '/api/auth/reset-password', {
      body: jsonBody({ newPassword: 'expired-password', token: expiredToken }),
      mailer,
    });
    expect(expiredReset.status).toBeGreaterThanOrEqual(400);
    const stillNew = await signIn(env, email, NEW_PASSWORD, mailer);
    expect(stillNew.status).toBe(200);
  });

  it('progress read and write without a session return 401 and do not leak another blob', async () => {
    const { env, mailer, sent } = await boot();
    const secretA = 'SECRET_BLOB_A';
    const secretB = 'SECRET_BLOB_B';
    const missing = await progressFetch(env);
    expect(missing.status).toBe(401);
    expect(missing.text).not.toContain(secretA);
    const missingWrite = await progressFetch(env, {
      method: 'PUT',
      body: jsonBody({ blob: JSON.stringify({ secret: secretA }), revision: 1, resetEpoch: 0 }),
    });
    expect(missingWrite.status).toBe(401);
    expect(missingWrite.text).not.toContain(secretA);

    const cookieA = await verifiedSession(env, 'progress-a@example.com', mailer, sent);
    const cookieB = await verifiedSession(env, 'progress-b@example.com', mailer, sent);
    const writeA = await progressFetch(env, {
      method: 'PUT',
      cookie: cookieA,
      body: jsonBody({
        blob: JSON.stringify({ secret: secretA }),
        revision: 4,
        resetEpoch: 2,
      }),
    });
    expect(writeA.status).toBe(200);
    const readA = await progressFetch(env, { cookie: cookieA });
    expect(readA.text).toContain(secretA);
    expect(readA.body).toMatchObject({ revision: 4, resetEpoch: 2 });

    const readB = await progressFetch(env, { cookie: cookieB });
    expect(readB.status).toBe(200);
    expect(readB.text).not.toContain(secretA);
    const writeB = await progressFetch(env, {
      method: 'PUT',
      cookie: cookieB,
      body: jsonBody({
        blob: JSON.stringify({ secret: secretB }),
        revision: 1,
        resetEpoch: 0,
      }),
    });
    expect(writeB.status).toBe(200);
    const readAAgain = await progressFetch(env, { cookie: cookieA });
    expect(readAAgain.text).toContain(secretA);
    expect(readAAgain.text).not.toContain(secretB);

    const sessionRow = await (env.DB as TestD1)
      .prepare('SELECT expiresAt FROM session LIMIT 1')
      .first<{ expiresAt: string | number }>();
    const past = typeof sessionRow?.expiresAt === 'number' ? 0 : '2000-01-01T00:00:00.000Z';
    await (env.DB as TestD1).prepare('UPDATE session SET expiresAt = ?').bind(past).run();
    const expired = await progressFetch(env, { cookie: cookieA });
    expect(expired.status).toBe(401);
    expect(expired.text).not.toContain(secretA);
    expect(expired.text).not.toContain(secretB);
  });

  it('created user name is empty', async () => {
    const { db, env, mailer } = await boot();
    await signUp(env, 'empty-name@example.com', mailer, 'Ada Lovelace');
    const user = await userByEmail(db, 'empty-name@example.com');
    expect(user?.name).toBe('');
    expect(user?.image).toBeNull();

    await withGithubProfile(
      { email: 'oauth-name@example.com', emailVerified: true, name: 'Provider Display' },
      async () => {
        const callback = await githubSignIn(env, mailer);
        expect(callback.status).toBe(302);
      },
    );
    const oauthUser = await userByEmail(db, 'oauth-name@example.com');
    expect(oauthUser?.name).toBe('');
    expect(oauthUser?.image).toBeNull();
  });

  it('session cookie is httpOnly, Secure, and SameSite=Lax', async () => {
    const { env, mailer, sent } = await boot();
    await signUp(env, 'cookie@example.com', mailer);
    const verified = await verifyEmail(env, sent[0] as OutboundMail, mailer);
    expect(verified.status).toBe(200);
    const response = await handleAuthRequest(
      new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.10',
        },
        body: jsonBody({ email: 'cookie@example.com', password: PASSWORD }),
      }),
      env,
      { mailer },
    );
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie.toLowerCase()).toContain('httponly');
      expect(cookie.toLowerCase()).toContain('secure');
      expect(cookie.toLowerCase()).toContain('samesite=lax');
      expect(cookie.toLowerCase()).not.toMatch(/analytics|marketing|_ga/);
    }
  });

  it('email routes stay disabled when RESEND_API_KEY is missing', async () => {
    const { db, env, mailer, sent } = await boot();
    await signUp(env, 'already@example.com', mailer);
    const known = await authFetch(env, '/api/auth/sign-up/email', {
      body: jsonBody({ name: 'A', email: 'already@example.com', password: PASSWORD }),
      mailer: null,
    });
    const unknown = await authFetch(env, '/api/auth/sign-up/email', {
      body: jsonBody({ name: 'B', email: 'missing@example.com', password: PASSWORD }),
      mailer: null,
    });
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
    expect(await userByEmail(db, 'missing@example.com')).toBeNull();

    const knownLink = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: 'already@example.com', callbackURL: `${ORIGIN}/` }),
      mailer: null,
    });
    const unknownLink = await authFetch(env, '/api/auth/sign-in/magic-link', {
      body: jsonBody({ email: 'missing-link@example.com', callbackURL: `${ORIGIN}/` }),
      mailer: null,
    });
    expect(knownLink.status).toBe(unknownLink.status);
    expect(knownLink.body).toEqual(unknownLink.body);

    const knownReset = await authFetch(env, '/api/auth/request-password-reset', {
      body: jsonBody({ email: 'already@example.com', redirectTo: `${ORIGIN}/` }),
      mailer: null,
    });
    const unknownReset = await authFetch(env, '/api/auth/request-password-reset', {
      body: jsonBody({ email: 'missing-reset@example.com', redirectTo: `${ORIGIN}/` }),
      mailer: null,
    });
    expect(knownReset.status).toBe(unknownReset.status);
    expect(knownReset.body).toEqual(unknownReset.body);
    expect(sent.every((mail) => mail.to !== 'missing@example.com')).toBe(true);
  });

  it('Resend adapter posts from no-reply@ordboj.com only when a key is passed in', async () => {
    const calls: { url: string; authorization: string | null; body: Record<string, unknown> }[] =
      [];
    const mailer = createResendMailer('test-key', async (input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({
        url: requestUrl(input),
        authorization: new Headers(init?.headers).get('authorization'),
        body,
      });
      return new Response(JSON.stringify({ id: 'email_test' }), { status: 200 });
    });
    await mailer.send({
      to: 'person@example.com',
      from: MAIL_FROM,
      subject: 'Verify your email',
      text: 'https://ordboj.com/verify',
      kind: 'verification',
    });
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.authorization).toBe('Bearer test-key');
    expect(calls[0]?.body.from).toBe(MAIL_FROM);
    expect(calls[0]?.body.to).toEqual(['person@example.com']);
  });

  it('D1 jurisdiction eu is in the setup notes', () => {
    const doc = readFileSync(resolve('docs/auth/cloudflare-setup.md'), 'utf8');
    const wrangler = readFileSync(resolve('wrangler.jsonc'), 'utf8');
    expect(`${doc}\n${wrangler}`).toContain('jurisdiction=eu');
    expect(doc).toContain('npx wrangler d1 create ordboj-auth --jurisdiction=eu');
    expect(doc).toContain('npx wrangler d1 create ordboj-auth-preview --jurisdiction=eu');
    expect(doc).toContain('BETTER_AUTH_SECRET');
    expect(doc).toContain('GOOGLE_CLIENT_ID');
    expect(doc).toContain('GOOGLE_CLIENT_SECRET');
    expect(doc).toContain('GITHUB_CLIENT_ID');
    expect(doc).toContain('GITHUB_CLIENT_SECRET');
    expect(doc).toContain('MICROSOFT_CLIENT_ID');
    expect(doc).toContain('MICROSOFT_CLIENT_SECRET');
    expect(doc).toContain('RESEND_API_KEY');
    expect(doc).toContain('https://ordboj.com/api/auth/callback/google');
    expect(doc).toContain('https://ordboj.com/api/auth/callback/github');
    expect(doc).toContain('https://ordboj.com/api/auth/callback/microsoft');
    expect(doc).toContain('npx wrangler d1 migrations apply ordboj-auth --remote');
    expect(doc).toContain('npx wrangler d1 migrations apply ordboj-auth-preview --remote');
  });

  it('preview D1 binding differs from production', () => {
    const doc = readFileSync(resolve('docs/auth/cloudflare-setup.md'), 'utf8');
    const wrangler = readFileSync(resolve('wrangler.jsonc'), 'utf8');
    expect(wrangler).not.toMatch(/"database_id"/);
    expect(wrangler).not.toMatch(/"preview_database_id"/);
    expect(wrangler).toContain('pages_build_output_dir');
    const production = doc.match(/"database_id"\s*:\s*"([^"]+)"/);
    const preview = doc.match(/"preview_database_id"\s*:\s*"([^"]+)"/);
    expect(production?.[1]).toBe('PASTE_PRODUCTION_D1_ID');
    expect(preview?.[1]).toBe('PASTE_PREVIEW_D1_ID');
    expect(preview?.[1]).not.toBe(production?.[1]);
    expect(doc).toContain('ordboj-auth-preview');
  });

  it('auth and progress return 503 when D1 is not bound', async () => {
    const env = { ...testEnv(createSqliteD1()), DB: undefined };
    const auth = await handleAuthRequest(new Request(`${ORIGIN}/api/auth/get-session`), env);
    expect(auth.status).toBe(503);
    const progress = await handleProgressRequest(new Request(`${ORIGIN}/api/progress`), env);
    expect(progress.status).toBe(503);
  });

  it('Apple is not a provider', () => {
    const options = buildAuthOptions(testEnv(createSqliteD1()), {
      mailer: recordingMailer().mailer,
    });
    expect(Object.keys(options.socialProviders ?? {}).sort()).toEqual([
      'github',
      'google',
      'microsoft',
    ]);
    expect(options.socialProviders).not.toHaveProperty('apple');
  });

  it('baseURL and passkey rpID are ordboj.com', async () => {
    expect(AUTH_BASE_URL).toBe('https://ordboj.com');
    expect(PASSKEY_RP_ID).toBe('ordboj.com');
    const { env, mailer, sent } = await boot();
    const options = buildAuthOptions(env, { mailer });
    expect(options.baseURL).toBe('https://ordboj.com');
    expect(options.trustedOrigins).toEqual(['https://ordboj.com']);
    const cookie = await verifiedSession(env, 'passkey-config@example.com', mailer, sent);
    const registration = await authFetch(env, '/api/auth/passkey/generate-register-options', {
      method: 'GET',
      cookie,
      mailer,
    });
    expect(registration.status).toBe(200);
    const body = registration.body as { rp?: { id?: string } };
    expect(body.rp?.id).toBe('ordboj.com');
    expect(body.rp?.id).not.toBe('ordboj.pages.dev');

    const pages = await handleAuthRequest(
      new Request('https://ordboj.pages.dev/api/auth/passkey/generate-register-options', {
        method: 'GET',
        headers: { origin: 'https://ordboj.pages.dev', cookie },
      }),
      env,
      { mailer },
    );
    expect(pages.status).toBe(403);
  });

  it('passkey registration is refused until the email is verified', async () => {
    const { db, env, mailer, sent } = await boot();
    const open = await authFetch(env, '/api/auth/passkey/generate-register-options', {
      method: 'GET',
      mailer,
    });
    expect(open.status).toBe(401);

    const cookie = await verifiedSession(env, 'passkey@example.com', mailer, sent);
    await db
      .prepare('UPDATE user SET emailVerified = 0 WHERE email = ?')
      .bind('passkey@example.com')
      .run();
    const refused = await authFetch(env, '/api/auth/passkey/generate-register-options', {
      method: 'GET',
      cookie,
      mailer,
    });
    expect(refused.status).toBe(403);

    await db
      .prepare('UPDATE user SET emailVerified = 1 WHERE email = ?')
      .bind('passkey@example.com')
      .run();
    const allowed = await authFetch(env, '/api/auth/passkey/generate-register-options', {
      method: 'GET',
      cookie,
      mailer,
    });
    expect(allowed.status).toBe(200);
    expect((allowed.body as { rp?: { id?: string } }).rp?.id).toBe('ordboj.com');
  });

  it('user_progress has blob, revision, and resetEpoch', async () => {
    const { db, env, mailer, sent } = await boot();
    const columns = await db.prepare('PRAGMA table_info(user_progress)').all<{ name: string }>();
    const names = columns.results.map((column) => column.name);
    expect(names).toEqual(
      expect.arrayContaining(['user_id', 'blob', 'revision', 'resetEpoch', 'updated_at']),
    );
    await db
      .prepare(
        'INSERT INTO user_progress (user_id, blob, revision, updated_at) VALUES (?, ?, ?, ?)',
      )
      .bind('default-user', '{}', 1, '2026-11-10T00:00:00.000Z')
      .run();
    const stored = await db
      .prepare('SELECT resetEpoch FROM user_progress WHERE user_id = ?')
      .bind('default-user')
      .first<{ resetEpoch: number }>();
    expect(stored?.resetEpoch).toBe(0);

    const cookie = await verifiedSession(env, 'progress-schema@example.com', mailer, sent);
    const write = await progressFetch(env, {
      method: 'PUT',
      cookie,
      body: jsonBody({ blob: '{"version":3,"items":{}}', revision: 7, resetEpoch: 3 }),
    });
    expect(write.status).toBe(200);
    const row = await db
      .prepare('SELECT blob, revision, resetEpoch FROM user_progress WHERE user_id != ?')
      .bind('default-user')
      .first<{ blob: string; revision: number; resetEpoch: number }>();
    expect(row).toMatchObject({ blob: '{"version":3,"items":{}}', revision: 7, resetEpoch: 3 });
  });
});
