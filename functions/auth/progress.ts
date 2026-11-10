import type { Env } from '../env';
import { PROGRESS_BLOB_MAX_CHARS } from './constants';
import { createAuth } from './create-auth';

interface ProgressBody {
  blob: string;
  revision: number;
  resetEpoch: number;
}

function unauthorized(): Response {
  return Response.json({ message: 'Unauthorized' }, { status: 401 });
}

function badRequest(message: string): Response {
  return Response.json({ message }, { status: 400 });
}

function isProgressBody(value: unknown): value is ProgressBody {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  if (
    typeof body.blob !== 'string' ||
    body.blob.length === 0 ||
    body.blob.length > PROGRESS_BLOB_MAX_CHARS
  ) {
    return false;
  }
  if (!Number.isInteger(body.revision) || (body.revision as number) < 0) return false;
  if (!Number.isInteger(body.resetEpoch) || (body.resetEpoch as number) < 0) return false;
  try {
    const parsed = JSON.parse(body.blob) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export async function handleProgressRequest(request: Request, env: Env): Promise<Response> {
  if (!env.DB || !env.BETTER_AUTH_SECRET) {
    return Response.json({ message: 'Service unavailable' }, { status: 503 });
  }
  const auth = createAuth(env, { mailer: null });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return unauthorized();
  const userId = session.user.id;

  if (request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT blob, revision, resetEpoch, updated_at FROM user_progress WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ blob: string; revision: number; resetEpoch: number; updated_at: string }>();
    if (!row) return Response.json({ blob: null, revision: 0, resetEpoch: 0 });
    return Response.json({
      blob: row.blob,
      revision: row.revision,
      resetEpoch: row.resetEpoch,
      updatedAt: row.updated_at,
    });
  }

  if (request.method === 'PUT') {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return badRequest('Progress body must be JSON.');
    }
    if (!isProgressBody(payload)) return badRequest('Progress body is not valid.');
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO user_progress (user_id, blob, revision, resetEpoch, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         blob = excluded.blob,
         revision = excluded.revision,
         resetEpoch = excluded.resetEpoch,
         updated_at = excluded.updated_at`,
    )
      .bind(userId, payload.blob, payload.revision, payload.resetEpoch, updatedAt)
      .run();
    return Response.json({
      blob: payload.blob,
      revision: payload.revision,
      resetEpoch: payload.resetEpoch,
      updatedAt,
    });
  }

  return Response.json({ message: 'Method not allowed' }, { status: 405 });
}
