import type { Env } from '../env';
import { createAuth } from './create-auth';

/** Practice events are kept for 13 months, then deleted on the next write. */
export const PRACTICE_EVENT_RETENTION_MONTHS = 13;

const MAX_EVENTS = 100;
const MAX_BODY_CHARS = 65_536;
const ROUND_ID = /^[A-Za-z0-9-]{8,64}$/;
const OCCURRED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_COUNT = 10_000;

const EVENT_NAMES = new Set(['practice_start', 'answer', 'practice_complete']);
const SURFACES = new Set(['conjugation', 'particle']);
const SESSION_KINDS = new Set(['due', 'extra', 'free']);
const PRACTICE_MODES = new Set(['typing', 'multiple-choice']);
const MODALITIES = new Set(['typed', 'choice']);
const FORMS = new Set(['infinitive', 'presens', 'preteritum', 'supinum', 'imperativ']);
const PARTICLE_KINDS = new Set(['cloze', 'recall']);

const EVENT_KEYS = new Set([
  'roundId',
  'event',
  'occurredAt',
  'surface',
  'sessionKind',
  'practiceMode',
  'modality',
  'form',
  'particleKind',
  'correct',
  'wasNew',
  'isRequeue',
  'itemCount',
  'correctCount',
  'durationMs',
]);

// Normalized (letters and digits only, lower case) so Email, user_agent,
// and typed-answer all hit the same gate. These values are never stored.
const FORBIDDEN_KEYS = new Set([
  'email',
  'name',
  'ip',
  'ipaddress',
  'useragent',
  'ua',
  'answer',
  'answertext',
  'typedanswer',
  'typedtext',
  'response',
  'input',
  'userid',
]);

export interface ParsedPracticeEvent {
  roundId: string;
  event: 'practice_start' | 'answer' | 'practice_complete';
  occurredAt: string;
  surface: 'conjugation' | 'particle';
  sessionKind: string | null;
  practiceMode: string | null;
  modality: string | null;
  form: string | null;
  particleKind: string | null;
  correct: number | null;
  wasNew: number | null;
  isRequeue: number | null;
  itemCount: number | null;
  correctCount: number | null;
  durationMs: number | null;
}

function unauthorized(): Response {
  return Response.json({ message: 'Unauthorized' }, { status: 401 });
}

function badRequest(): Response {
  return Response.json({ message: 'Event payload is not valid.' }, { status: 400 });
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function containsForbiddenEventField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsForbiddenEventField(item));
  if (!value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(normalizeKey(key))) return true;
    if (containsForbiddenEventField(child)) return true;
  }
  return false;
}

/**
 * ISO instant 13 calendar months before `now`. Day-of-month clamps to the
 * target month so 31 March does not spill into March of the previous year.
 * The result is `toISOString()`, which sorts in the same order as time.
 */
export function retentionCutoffIso(now: Date): string {
  const monthIndex = now.getUTCMonth() - PRACTICE_EVENT_RETENTION_MONTHS;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), monthIndex, 1));
  const daysInMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth(),
      Math.min(now.getUTCDate(), daysInMonth),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  ).toISOString();
}

function optionalEnum(value: unknown, allowed: Set<string>): string | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !allowed.has(value)) return false;
  return value;
}

function optionalBit(value: unknown): 0 | 1 | null | false {
  if (value === undefined || value === null) return null;
  if (value === 0 || value === 1) return value;
  return false;
}

function optionalCount(value: unknown, max: number): number | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    return false;
  }
  return value;
}

function parseOccurredAt(value: unknown, nowMs: number): string | null {
  if (typeof value !== 'string' || !OCCURRED_AT.test(value)) return null;
  const parsed = new Date(value);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) return null;
  if (time > nowMs + FUTURE_SKEW_MS) return null;
  return parsed.toISOString();
}

export function parsePracticeEvent(value: unknown, nowMs: number): ParsedPracticeEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!EVENT_KEYS.has(key)) return null;
  }
  if (typeof body.roundId !== 'string' || !ROUND_ID.test(body.roundId)) return null;
  if (typeof body.event !== 'string' || !EVENT_NAMES.has(body.event)) return null;
  if (typeof body.surface !== 'string' || !SURFACES.has(body.surface)) return null;
  const occurredAt = parseOccurredAt(body.occurredAt, nowMs);
  if (!occurredAt) return null;

  const sessionKind = optionalEnum(body.sessionKind, SESSION_KINDS);
  const practiceMode = optionalEnum(body.practiceMode, PRACTICE_MODES);
  const modality = optionalEnum(body.modality, MODALITIES);
  const form = optionalEnum(body.form, FORMS);
  const particleKind = optionalEnum(body.particleKind, PARTICLE_KINDS);
  const correct = optionalBit(body.correct);
  const wasNew = optionalBit(body.wasNew);
  const isRequeue = optionalBit(body.isRequeue);
  const itemCount = optionalCount(body.itemCount, MAX_COUNT);
  const correctCount = optionalCount(body.correctCount, MAX_COUNT);
  const durationMs = optionalCount(body.durationMs, MAX_DURATION_MS);
  if (
    sessionKind === false ||
    practiceMode === false ||
    modality === false ||
    form === false ||
    particleKind === false ||
    correct === false ||
    wasNew === false ||
    isRequeue === false ||
    itemCount === false ||
    correctCount === false ||
    durationMs === false
  ) {
    return null;
  }

  return {
    roundId: body.roundId,
    event: body.event as ParsedPracticeEvent['event'],
    occurredAt,
    surface: body.surface as ParsedPracticeEvent['surface'],
    sessionKind,
    practiceMode,
    modality,
    form,
    particleKind,
    correct,
    wasNew,
    isRequeue,
    itemCount,
    correctCount,
    durationMs,
  };
}

const INSERT_SQL = `INSERT INTO practice_event (
  user_id, round_id, event, occurred_at, surface,
  session_kind, practice_mode, modality, form, particle_kind,
  correct, was_new, is_requeue, item_count, correct_count, duration_ms
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertStatement(db: D1Database, userId: string, event: ParsedPracticeEvent) {
  return db
    .prepare(INSERT_SQL)
    .bind(
      userId,
      event.roundId,
      event.event,
      event.occurredAt,
      event.surface,
      event.sessionKind,
      event.practiceMode,
      event.modality,
      event.form,
      event.particleKind,
      event.correct,
      event.wasNew,
      event.isRequeue,
      event.itemCount,
      event.correctCount,
      event.durationMs,
    );
}

async function isOptedOut(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT opted_out FROM practice_event_opt_out WHERE user_id = ?')
    .bind(userId)
    .first<{ opted_out: number }>();
  return Number(row?.opted_out) === 1;
}

export async function handleEventsRequest(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.BETTER_AUTH_SECRET) {
    return Response.json({ message: 'Service unavailable' }, { status: 503 });
  }
  const auth = createAuth(env, { mailer: null });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return unauthorized();
  const userId = session.user.id;
  const db = env.DB;

  if (request.method === 'GET') {
    const optedOut = await isOptedOut(db, userId);
    return Response.json({ optedOut });
  }

  if (request.method === 'PUT') {
    const payload = await readJson(request);
    if (payload instanceof Response) return payload;
    if (containsForbiddenEventField(payload)) return badRequest();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return badRequest();
    const body = payload as Record<string, unknown>;
    if (Object.keys(body).length !== 1 || typeof body.optedOut !== 'boolean') return badRequest();
    const optedOut = body.optedOut;
    const updatedAt = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO practice_event_opt_out (user_id, opted_out, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             opted_out = excluded.opted_out,
             updated_at = excluded.updated_at`,
        )
        .bind(userId, optedOut ? 1 : 0, updatedAt),
    ];
    if (optedOut) {
      statements.push(db.prepare('DELETE FROM practice_event WHERE user_id = ?').bind(userId));
    }
    try {
      await db.batch(statements);
    } catch {
      return Response.json({ message: 'Service unavailable' }, { status: 503 });
    }
    return Response.json({ optedOut });
  }

  if (request.method === 'POST') {
    const payload = await readJson(request);
    if (payload instanceof Response) return payload;
    if (containsForbiddenEventField(payload)) return badRequest();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return badRequest();
    const body = payload as Record<string, unknown>;
    if (Object.keys(body).length !== 1 || !Array.isArray(body.events)) return badRequest();
    if (body.events.length < 1 || body.events.length > MAX_EVENTS) return badRequest();

    const nowMs = Date.now();
    const events: ParsedPracticeEvent[] = [];
    for (const item of body.events) {
      const parsed = parsePracticeEvent(item, nowMs);
      if (!parsed) return badRequest();
      events.push(parsed);
    }

    if (await isOptedOut(db, userId)) {
      try {
        await db.prepare('DELETE FROM practice_event WHERE user_id = ?').bind(userId).run();
      } catch {
        return Response.json({ message: 'Service unavailable' }, { status: 503 });
      }
      return Response.json({ stored: 0, optedOut: true });
    }

    const cutoff = retentionCutoffIso(new Date(nowMs));
    const kept = events.filter((event) => event.occurredAt >= cutoff);
    const statements: D1PreparedStatement[] = [
      db.prepare('DELETE FROM practice_event WHERE occurred_at < ?').bind(cutoff),
      ...kept.map((event) => insertStatement(db, userId, event)),
    ];
    try {
      await db.batch(statements);
    } catch {
      return Response.json({ message: 'Service unavailable' }, { status: 503 });
    }
    return Response.json({ stored: kept.length, optedOut: false });
  }

  return Response.json({ message: 'Method not allowed' }, { status: 405 });
}

async function readJson(request: Request): Promise<unknown | Response> {
  const claimed = request.headers.get('content-length');
  if (claimed && Number(claimed) > MAX_BODY_CHARS) return badRequest();
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return badRequest();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return badRequest();
  }
}
