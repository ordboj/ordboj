// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleAuthRequest } from './handler';
import { handleEventsRequest, retentionCutoffIso } from './events';
import type { Mailer, OutboundMail } from './mailer';
import { applyMigrations } from '../test/migrate';
import { createSqliteD1, type TestD1 } from '../test/sqlite-d1';
import type { Env } from '../env';

const ORIGIN = 'https://ordboj.com';
const PASSWORD = 'correct-horse';

const PRACTICE_EVENT_SQL = `CREATE TABLE practice_event (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  round_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('practice_start','answer','practice_complete')),
  occurred_at TEXT NOT NULL,
  surface TEXT NOT NULL CHECK (surface IN ('conjugation','particle')),
  session_kind TEXT CHECK (session_kind IN ('due','extra','free')),
  practice_mode TEXT CHECK (practice_mode IN ('typing','multiple-choice')),
  modality TEXT CHECK (modality IN ('typed','choice')),
  form TEXT CHECK (form IN ('infinitive','presens','preteritum','supinum','imperativ')),
  particle_kind TEXT CHECK (particle_kind IN ('cloze','recall')),
  correct INTEGER CHECK (correct IN (0,1)),
  was_new INTEGER CHECK (was_new IN (0,1)),
  is_requeue INTEGER CHECK (is_requeue IN (0,1)),
  item_count INTEGER, correct_count INTEGER, duration_ms INTEGER
);
CREATE INDEX practice_event_user_time_idx ON practice_event (user_id, occurred_at);
CREATE INDEX practice_event_event_time_idx ON practice_event (event, occurred_at);`;

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

async function boot() {
  const db = createSqliteD1();
  await applyMigrations(db);
  const box = recordingMailer();
  const env = testEnv(db);
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
  body: Record<string, unknown> | null;
  text: string;
  cookies: string;
}> {
  const text = await response.text();
  let body: Record<string, unknown> | null = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = null;
    }
  }
  return { status: response.status, body, text, cookies: cookieHeader(response) };
}

async function authFetch(
  env: Env,
  path: string,
  init: RequestInit & { cookie?: string; mailer?: Mailer | null } = {},
) {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) headers.set('origin', ORIGIN);
  if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', '203.0.113.10');
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

async function eventsFetch(
  env: Env,
  init: RequestInit & { cookie?: string; ip?: string; userAgent?: string } = {},
) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.ip) headers.set('cf-connecting-ip', init.ip);
  if (init.userAgent) headers.set('user-agent', init.userAgent);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const request = new Request(`${ORIGIN}/api/events`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
  });
  const response = await handleEventsRequest(request, env);
  return readBody(response);
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

function urlIn(mail: OutboundMail): URL {
  const match = mail.text.match(/https:\/\/ordboj\.com\S+/);
  if (!match?.[0]) throw new Error(`No URL in ${mail.kind} mail`);
  return new URL(match[0]);
}

async function verifiedSession(env: Env, email: string, mailer: Mailer, sent: OutboundMail[]) {
  const before = sent.length;
  const created = await authFetch(env, '/api/auth/sign-up/email', {
    body: jsonBody({
      name: 'Ada Lovelace',
      email,
      password: PASSWORD,
      callbackURL: `${ORIGIN}/`,
    }),
    mailer,
  });
  expect(created.status).toBe(200);
  const mail = sent.slice(before).find((item) => item.kind === 'verification');
  expect(mail).toBeTruthy();
  const token = urlIn(mail as OutboundMail).searchParams.get('token');
  expect(token).toBeTruthy();
  const verified = await authFetch(
    env,
    `/api/auth/verify-email?token=${encodeURIComponent(token ?? '')}`,
    { method: 'GET', mailer },
  );
  expect(verified.status).toBe(200);
  const signedIn = await authFetch(env, '/api/auth/sign-in/email', {
    body: jsonBody({ email, password: PASSWORD }),
    mailer,
  });
  expect(signedIn.status).toBe(200);
  expect(signedIn.cookies).toContain('=');
  return signedIn.cookies;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function validEvent(overrides: Record<string, unknown> = {}) {
  return {
    roundId: 'round-1234',
    event: 'answer',
    occurredAt: new Date().toISOString(),
    surface: 'conjugation',
    sessionKind: 'due',
    practiceMode: 'typing',
    modality: 'typed',
    form: 'presens',
    correct: 1,
    wasNew: 1,
    isRequeue: 0,
    durationMs: 1500,
    ...overrides,
  };
}

async function countEvents(db: TestD1): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM practice_event').first<{ n: number }>();
  return Number(row?.n ?? 0);
}

async function eventRows(db: TestD1) {
  const result = await db
    .prepare(
      `SELECT user_id, round_id, event, occurred_at, surface, session_kind, practice_mode,
              modality, form, particle_kind, correct, was_new, is_requeue,
              item_count, correct_count, duration_ms
       FROM practice_event ORDER BY id`,
    )
    .all<Record<string, unknown>>();
  return result.results;
}

describe('practice_event migration', () => {
  it('defines the table with the ticket columns, checks, and indexes', () => {
    const sql = readFileSync(resolve('migrations/0004_practice_event.sql'), 'utf8');
    expect(sql).toContain(PRACTICE_EVENT_SQL);
    expect(sql).not.toMatch(/CREATE TABLE[^;]*\bitem_id\b/);
    expect(sql).not.toMatch(/\buser_progress\b/);
  });

  it('rejects invalid event, surface, form, and the other checks', async () => {
    const { db } = await boot();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
         VALUES (?, '', 'check@example.com', 1, ?, ?)`,
      )
      .bind('user-check', now, now)
      .run();

    const insert = (column: string, value: unknown) =>
      db
        .prepare(
          `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface, ${column})
           VALUES ('user-check', 'round-1234', 'answer', ?, 'conjugation', ?)`,
        )
        .bind(now, value)
        .run();

    await expect(
      db
        .prepare(
          `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface)
           VALUES ('user-check', 'round-1234', 'login', ?, 'conjugation')`,
        )
        .bind(now)
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface)
           VALUES ('user-check', 'round-1234', 'answer', ?, 'home')`,
        )
        .bind(now)
        .run(),
    ).rejects.toThrow();
    await expect(insert('form', 'perfekt')).rejects.toThrow();
    await expect(insert('session_kind', 'scheduled')).rejects.toThrow();
    await expect(insert('practice_mode', 'voice')).rejects.toThrow();
    await expect(insert('modality', 'speech')).rejects.toThrow();
    await expect(insert('particle_kind', 'introduction')).rejects.toThrow();
    await expect(insert('correct', 2)).rejects.toThrow();
    await expect(insert('was_new', 2)).rejects.toThrow();
    await expect(insert('is_requeue', 2)).rejects.toThrow();
    expect(await countEvents(db)).toBe(0);

    await db
      .prepare(
        `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface)
         VALUES ('user-check', 'round-1234', 'practice_start', ?, 'particle')`,
      )
      .bind(now)
      .run();
    expect(await countEvents(db)).toBe(1);
  });

  it('deletes practice events and the objection row when the account is deleted', async () => {
    const { db } = await boot();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
         VALUES ('user-check', '', 'check@example.com', 1, ?, ?)`,
      )
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface)
         VALUES ('user-check', 'round-1234', 'practice_start', ?, 'conjugation')`,
      )
      .bind(now)
      .run();
    await db
      .prepare(
        `INSERT INTO practice_event_opt_out (user_id, opted_out, updated_at) VALUES ('user-check', 1, ?)`,
      )
      .bind(now)
      .run();

    await db.prepare('DELETE FROM "user" WHERE "id" = ?').bind('user-check').run();
    expect(await countEvents(db)).toBe(0);
    const optOut = await db
      .prepare('SELECT COUNT(*) AS n FROM practice_event_opt_out')
      .first<{ n: number }>();
    expect(Number(optOut?.n ?? 0)).toBe(0);
  });
});

describe('retention cutoff', () => {
  it('is 13 calendar months earlier and clamps the day', () => {
    expect(retentionCutoffIso(new Date('2026-03-31T12:00:00.000Z'))).toBe(
      '2025-02-28T12:00:00.000Z',
    );
    expect(retentionCutoffIso(new Date('2024-03-31T00:00:00.000Z'))).toBe(
      '2023-02-28T00:00:00.000Z',
    );
  });
});

describe('expired session', () => {
  it('returns 401 and writes nothing when the session has expired', async () => {
    const started = await boot();
    const cookie = await verifiedSession(
      started.env,
      'expired@example.com',
      started.mailer,
      started.sent,
    );
    const user = await started.db
      .prepare('SELECT id FROM "user" WHERE email = ?')
      .bind('expired@example.com')
      .first<{ id: string }>();
    const now = new Date().toISOString();
    await started.db
      .prepare(
        `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface)
         VALUES (?, 'round-kept', 'answer', ?, 'conjugation')`,
      )
      .bind(user?.id, now)
      .run();
    const sessionRow = await started.db
      .prepare('SELECT expiresAt FROM session LIMIT 1')
      .first<{ expiresAt: string | number }>();
    const past = typeof sessionRow?.expiresAt === 'number' ? 0 : '2000-01-01T00:00:00.000Z';
    await started.db.prepare('UPDATE session SET expiresAt = ?').bind(past).run();
    const expired = await eventsFetch(started.env, {
      method: 'POST',
      cookie,
      body: jsonBody({ events: [validEvent({ roundId: 'round-new1' })] }),
    });
    expect(expired.status).toBe(401);
    const rows = await eventRows(started.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.round_id).toBe('round-kept');
  });
});

describe('POST /api/events', () => {
  let db: TestD1;
  let env: Env;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    const started = await boot();
    db = started.db;
    env = started.env;
    cookie = await verifiedSession(started.env, 'events@example.com', started.mailer, started.sent);
    const user = await db
      .prepare('SELECT id FROM "user" WHERE email = ?')
      .bind('events@example.com')
      .first<{ id: string }>();
    userId = user?.id ?? '';
    expect(userId).not.toBe('');
  });

  async function clearEvents() {
    await db.prepare('DELETE FROM practice_event').run();
    await db.prepare('DELETE FROM practice_event_opt_out').run();
  }

  it('returns 401 and writes nothing when there is no session', async () => {
    await clearEvents();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface)
         VALUES (?, 'round-1234', 'practice_start', ?, 'conjugation')`,
      )
      .bind(userId, now)
      .run();
    const missing = await eventsFetch(env, {
      method: 'POST',
      body: jsonBody({ events: [validEvent()] }),
    });
    expect(missing.status).toBe(401);
    expect(await countEvents(db)).toBe(1);
    const rows = await eventRows(db);
    expect(rows[0]?.event).toBe('practice_start');
  });

  it('stores a batch for the session user and not a client-supplied user id', async () => {
    await clearEvents();
    const occurredAt = new Date().toISOString();
    const posted = await eventsFetch(env, {
      method: 'POST',
      cookie,
      ip: '198.51.100.20',
      userAgent: 'SecretBrowser/9.0',
      body: jsonBody({
        events: [
          validEvent({
            event: 'practice_start',
            occurredAt,
            correct: undefined,
            wasNew: undefined,
            isRequeue: undefined,
            modality: undefined,
            form: undefined,
            durationMs: undefined,
          }),
          validEvent({ occurredAt }),
          validEvent({
            event: 'answer',
            occurredAt,
            surface: 'particle',
            sessionKind: 'free',
            practiceMode: undefined,
            modality: 'choice',
            form: undefined,
            particleKind: 'cloze',
            correct: 0,
            wasNew: 0,
            isRequeue: 0,
          }),
          validEvent({
            event: 'practice_complete',
            occurredAt,
            sessionKind: 'extra',
            practiceMode: 'multiple-choice',
            modality: undefined,
            form: undefined,
            itemCount: 4,
            correctCount: 3,
            durationMs: 20000,
            correct: undefined,
            wasNew: undefined,
            isRequeue: undefined,
          }),
        ],
      }),
    });
    expect(posted.status).toBe(200);
    expect(posted.body).toMatchObject({ stored: 4, optedOut: false });
    const rows = await eventRows(db);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.user_id === userId)).toBe(true);
    expect(rows.map((row) => row.event)).toEqual([
      'practice_start',
      'answer',
      'answer',
      'practice_complete',
    ]);
    expect(rows[1]).toMatchObject({
      surface: 'conjugation',
      session_kind: 'due',
      practice_mode: 'typing',
      modality: 'typed',
      form: 'presens',
      correct: 1,
      was_new: 1,
      is_requeue: 0,
      duration_ms: 1500,
    });
    expect(rows[2]).toMatchObject({
      surface: 'particle',
      session_kind: 'free',
      particle_kind: 'cloze',
      modality: 'choice',
      correct: 0,
      was_new: 0,
    });
    expect(rows[3]).toMatchObject({
      session_kind: 'extra',
      practice_mode: 'multiple-choice',
      item_count: 4,
      correct_count: 3,
      duration_ms: 20000,
    });
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain('198.51.100.20');
    expect(stored).not.toContain('SecretBrowser/9.0');
    expect(stored).not.toContain('events@example.com');
  });

  it('rejects a client-supplied user id and does not store that id', async () => {
    await clearEvents();
    const posted = await eventsFetch(env, {
      method: 'POST',
      cookie,
      body: jsonBody({ events: [validEvent({ userId: 'someone-else' })] }),
    });
    expect(posted.status).toBe(400);
    expect(await countEvents(db)).toBe(0);
    expect(posted.text).not.toContain('someone-else');
  });

  it.each([
    ['event', 'login'],
    ['surface', 'home'],
    ['form', 'perfekt'],
    ['sessionKind', 'scheduled'],
    ['practiceMode', 'voice'],
    ['modality', 'speech'],
    ['particleKind', 'introduction'],
    ['correct', 2],
    ['wasNew', 3],
    ['isRequeue', -1],
  ])('rejects an invalid %s and writes no row', async (field, value) => {
    await clearEvents();
    const posted = await eventsFetch(env, {
      method: 'POST',
      cookie,
      body: jsonBody({ events: [validEvent({ [field]: value })] }),
    });
    expect(posted.status).toBe(400);
    expect(await countEvents(db)).toBe(0);
  });

  it('does not store email, name, IP, user agent, or typed answer text', async () => {
    await clearEvents();
    const secrets = {
      email: 'secret-learner@example.com',
      name: 'Secret Name',
      ip: '203.0.113.55',
      userAgent: 'SecretBrowser/9',
      typedAnswer: 'TYPED_ANSWER_SHOULD_NOT_STORE',
    };
    const posted = await eventsFetch(env, {
      method: 'POST',
      cookie,
      ip: secrets.ip,
      userAgent: secrets.userAgent,
      body: jsonBody({
        email: secrets.email,
        name: secrets.name,
        events: [validEvent({ typedAnswer: secrets.typedAnswer, answer: 'jag' })],
      }),
    });
    expect(posted.status).toBe(400);
    expect(await countEvents(db)).toBe(0);
    expect(posted.text).not.toContain(secrets.email);
    expect(posted.text).not.toContain(secrets.name);
    expect(posted.text).not.toContain(secrets.ip);
    expect(posted.text).not.toContain(secrets.userAgent);
    expect(posted.text).not.toContain(secrets.typedAnswer);
    const rows = JSON.stringify(await eventRows(db));
    expect(rows).not.toContain(secrets.email);
    expect(rows).not.toContain(secrets.typedAnswer);
  });

  it('deletes events older than 13 months when a signed-in user writes', async () => {
    await clearEvents();
    const insert = (roundId: string, occurredAt: string) =>
      db
        .prepare(
          `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface)
           VALUES (?, ?, 'practice_start', ?, 'conjugation')`,
        )
        .bind(userId, roundId, occurredAt)
        .run();
    await insert('round-old1', isoDaysAgo(430));
    await insert('round-keep', isoDaysAgo(200));
    const posted = await eventsFetch(env, {
      method: 'POST',
      cookie,
      body: jsonBody({
        events: [
          validEvent({ roundId: 'round-now1', event: 'practice_start' }),
          validEvent({ roundId: 'round-aged', event: 'answer', occurredAt: isoDaysAgo(430) }),
        ],
      }),
    });
    expect(posted.status).toBe(200);
    const rows = await eventRows(db);
    const roundIds = rows.map((row) => row.round_id);
    expect(roundIds).toContain('round-keep');
    expect(roundIds).toContain('round-now1');
    expect(roundIds).not.toContain('round-old1');
    expect(roundIds).not.toContain('round-aged');
  });

  it('stops writing and deletes stored events when the account objects', async () => {
    await clearEvents();
    const otherNow = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
         VALUES ('other-user', '', 'other@example.com', 1, ?, ?)`,
      )
      .bind(otherNow, otherNow)
      .run();
    await db
      .prepare(
        `INSERT INTO practice_event (user_id, round_id, event, occurred_at, surface)
         VALUES ('other-user', 'round-oth1', 'answer', ?, 'conjugation')`,
      )
      .bind(otherNow)
      .run();

    const first = await eventsFetch(env, {
      method: 'POST',
      cookie,
      body: jsonBody({ events: [validEvent({ roundId: 'round-mine' })] }),
    });
    expect(first.status).toBe(200);
    expect(await countEvents(db)).toBe(2);

    const objection = await eventsFetch(env, {
      method: 'PUT',
      cookie,
      body: jsonBody({ optedOut: true }),
    });
    expect(objection.status).toBe(200);
    expect(objection.body).toMatchObject({ optedOut: true });
    const afterObjection = await eventRows(db);
    expect(afterObjection.map((row) => row.user_id)).toEqual(['other-user']);

    const blocked = await eventsFetch(env, {
      method: 'POST',
      cookie,
      body: jsonBody({ events: [validEvent({ roundId: 'round-new2' })] }),
    });
    expect(blocked.status).toBe(200);
    expect(blocked.body).toMatchObject({ stored: 0, optedOut: true });
    expect((await eventRows(db)).map((row) => row.round_id)).toEqual(['round-oth1']);

    const preference = await eventsFetch(env, { method: 'GET', cookie });
    expect(preference.status).toBe(200);
    expect(preference.body).toMatchObject({ optedOut: true });

    const resume = await eventsFetch(env, {
      method: 'PUT',
      cookie,
      body: jsonBody({ optedOut: false }),
    });
    expect(resume.status).toBe(200);
    const again = await eventsFetch(env, {
      method: 'POST',
      cookie,
      body: jsonBody({ events: [validEvent({ roundId: 'round-back' })] }),
    });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ stored: 1, optedOut: false });
    const roundIds = (await eventRows(db)).map((row) => row.round_id);
    expect(roundIds).toContain('round-back');
    expect(roundIds).toContain('round-oth1');
  });

  it('returns 401 for a preference read with no session', async () => {
    const missing = await eventsFetch(env, { method: 'GET' });
    expect(missing.status).toBe(401);
  });
});
