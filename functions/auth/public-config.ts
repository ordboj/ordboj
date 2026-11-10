import type { Env } from '../env';

/**
 * Public sign-in flags. Booleans only: client ids, client secrets, the Resend
 * key, and BETTER_AUTH_SECRET must never be copied into this object.
 */
export interface PublicAuthConfig {
  oauth: {
    google: boolean;
    github: boolean;
    microsoft: boolean;
  };
  mail: boolean;
}

function pairReady(id: string | undefined, secret: string | undefined): boolean {
  return (
    typeof id === 'string' &&
    id.trim().length > 0 &&
    typeof secret === 'string' &&
    secret.trim().length > 0
  );
}

export function publicAuthConfig(env: Env): PublicAuthConfig {
  return {
    oauth: {
      google: pairReady(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
      github: pairReady(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
      microsoft: pairReady(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET),
    },
    mail: typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.trim().length > 0,
  };
}

export function handleAuthConfigRequest(request: Request, env: Env): Response {
  if (request.method !== 'GET') {
    return Response.json({ message: 'Method not allowed' }, { status: 405 });
  }
  return Response.json(publicAuthConfig(env), {
    headers: { 'cache-control': 'no-store' },
  });
}
