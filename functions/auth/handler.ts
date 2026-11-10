import type { Env } from '../env';
import { GENERIC_MAIL_BODY, MAIL_LIMIT_BODY, PASSKEY_ORIGIN } from './constants';
import { createAuth } from './create-auth';
import { mailSendAllowed, recordMailSend } from './mail-quota';
import { resolveMailer, type Mailer } from './mailer';
import { markPasswordProven } from './unproven-password';

const MAIL_PATHS = new Set([
  '/api/auth/sign-up/email',
  '/api/auth/sign-in/magic-link',
  '/api/auth/request-password-reset',
  '/api/auth/send-verification-email',
]);

const PASSKEY_REGISTRATION_PATHS = new Set([
  '/api/auth/passkey/generate-register-options',
  '/api/auth/passkey/verify-registration',
]);

export interface AuthHandlerOptions {
  mailer?: Mailer | null;
  now?: () => Date;
  waitUntil?: (promise: Promise<unknown>) => void;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

function passkeyHostAllowed(request: Request): boolean {
  const url = new URL(request.url);
  if (url.origin !== PASSKEY_ORIGIN) return false;
  const origin = request.headers.get('origin');
  if (origin && origin !== PASSKEY_ORIGIN) return false;
  return true;
}

async function readEmail(request: Request): Promise<string> {
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    return typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

export async function handleAuthRequest(
  request: Request,
  env: Env,
  options: AuthHandlerOptions = {},
): Promise<Response> {
  if (!env.DB || !env.BETTER_AUTH_SECRET) {
    return json({ message: 'Service unavailable' }, 503);
  }
  const db = env.DB;
  const url = new URL(request.url);
  const mailer = resolveMailer(env, options.mailer);
  const now = options.now ?? (() => new Date());

  if (url.pathname.startsWith('/api/auth/passkey/')) {
    if (!passkeyHostAllowed(request)) {
      return json({ message: 'Passkeys are only available on ordboj.com' }, 403);
    }
  }

  const authDeps = { mailer, waitUntil: options.waitUntil };
  const passwordSignIn =
    request.method === 'POST' && url.pathname === '/api/auth/sign-in/email'
      ? await readEmail(request)
      : '';

  if (PASSKEY_REGISTRATION_PATHS.has(url.pathname)) {
    const auth = createAuth(env, authDeps);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return json({ message: 'Unauthorized' }, 401);
    if (!session.user.emailVerified) return json({ message: 'Verified sign-in required' }, 403);
  }

  if (request.method === 'POST' && MAIL_PATHS.has(url.pathname)) {
    if (!mailer) return json(GENERIC_MAIL_BODY, 200);
    const email = await readEmail(request);
    const ip = clientIp(request);
    const stamp = now();
    const allowed = await mailSendAllowed(db, { now: stamp, email, ip });
    if (!allowed) return json(MAIL_LIMIT_BODY, 429);
    // Count the request itself. A missing account sends no mail, and that
    // must not leave its counter behind an existing account.
    await recordMailSend(db, { now: stamp, email, ip });
    const auth = createAuth(env, authDeps);
    return auth.handler(request);
  }

  const auth = createAuth(env, authDeps);
  const response = await auth.handler(request);
  if (response.status === 200 && passwordSignIn) await markPasswordProven(db, passwordSignIn);
  return response;
}
