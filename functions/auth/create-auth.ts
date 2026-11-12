import { passkey } from '@better-auth/passkey';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins';
import { github, google, microsoft } from 'better-auth/social-providers';
import type { Env } from '../env';
import { consumeMailToken, storeMailToken } from './mail-tokens';
import { sendAuthMail, type Mailer } from './mailer';
import {
  AUTH_BASE_URL,
  MAGIC_LINK_TTL_SECONDS,
  PASSKEY_ORIGIN,
  PASSKEY_RP_ID,
  RESET_TTL_SECONDS,
  VERIFICATION_TTL_SECONDS,
} from './constants';
import { microsoftEmailVerified } from './provider-email';
import { dropUnprovenPassword, markPasswordProvenById } from './unproven-password';

export interface AuthDeps {
  mailer: Mailer | null;
  waitUntil?: (promise: Promise<unknown>) => void;
}

function enqueueMail(deps: AuthDeps, task: () => Promise<void>): void {
  const promise = task().catch(() => {});
  if (deps.waitUntil) deps.waitUntil(promise);
}

interface ProviderUserInfo {
  user?: {
    email?: string | null;
    emailVerified?: boolean | null;
    name?: string | null;
    image?: string | null;
  } | null;
  data?: unknown;
}

function emptyName(): { name: string } {
  return { name: '' };
}

function providerConfig(
  providerId: string,
  factory: (options: {
    clientId: string;
    clientSecret: string;
    mapProfileToUser: () => { name: string };
  }) => { getUserInfo: (token: { accessToken?: string }) => Promise<ProviderUserInfo | null> },
  clientId: string | undefined,
  clientSecret: string | undefined,
  db: D1Database,
) {
  if (!clientId || !clientSecret) return null;
  const base = factory({ clientId, clientSecret, mapProfileToUser: emptyName });
  return {
    clientId,
    clientSecret,
    mapProfileToUser: emptyName,
    async getUserInfo(token: { accessToken?: string }) {
      const info = await base.getUserInfo(token);
      if (!info?.user?.email) return info;
      const profile = info.data as Record<string, unknown> | null | undefined;
      const emailVerified =
        providerId === 'microsoft'
          ? microsoftEmailVerified(profile)
          : Boolean(info.user.emailVerified);
      if (emailVerified) await dropUnprovenPassword(db, info.user.email);
      return {
        ...info,
        user: {
          ...info.user,
          email: info.user.email,
          name: '',
          emailVerified,
        },
      };
    },
  };
}

export function buildAuthOptions(
  env: Env & { DB: D1Database },
  deps: AuthDeps,
  authOrigin: string = AUTH_BASE_URL,
): BetterAuthOptions {
  const socialProviders: NonNullable<BetterAuthOptions['socialProviders']> = {};
  const googleConfig = providerConfig(
    'google',
    google as never,
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.DB,
  );
  const githubConfig = providerConfig(
    'github',
    github as never,
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    env.DB,
  );
  const microsoftConfig = providerConfig(
    'microsoft',
    microsoft as never,
    env.MICROSOFT_CLIENT_ID,
    env.MICROSOFT_CLIENT_SECRET,
    env.DB,
  );
  if (googleConfig)
    socialProviders.google = googleConfig as NonNullable<
      BetterAuthOptions['socialProviders']
    >['google'];
  if (githubConfig)
    socialProviders.github = githubConfig as NonNullable<
      BetterAuthOptions['socialProviders']
    >['github'];
  if (microsoftConfig) {
    socialProviders.microsoft = microsoftConfig as NonNullable<
      BetterAuthOptions['socialProviders']
    >['microsoft'];
  }

  const mailer = deps.mailer;

  const secureCookies = authOrigin.startsWith('https:');
  return {
    appName: 'Ordboj',
    baseURL: authOrigin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [authOrigin],
    telemetry: { enabled: false },
    logger: { level: 'error' },
    socialProviders,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_TTL_SECONDS,
      minPasswordLength: 8,
      customSyntheticUser: ({ coreFields, id }) => ({
        ...coreFields,
        id,
        name: '',
        image: null,
      }),
      sendResetPassword: async ({ user, url }) => {
        if (!mailer) return;
        const parsed = new URL(url);
        if (parsed.pathname.startsWith('/reset-password/')) {
          parsed.pathname = `/api/auth${parsed.pathname}`;
        }
        enqueueMail(deps, () =>
          sendAuthMail(mailer, { kind: 'reset', to: user.email, url: parsed.toString() }),
        );
      },
      onPasswordReset: async ({ user }) => {
        await markPasswordProvenById(env.DB, user.id);
      },
    },
    emailVerification: {
      expiresIn: VERIFICATION_TTL_SECONDS,
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url, token }) => {
        if (!mailer) return;
        await storeMailToken(env.DB, token, VERIFICATION_TTL_SECONDS);
        const parsed = new URL(url);
        if (parsed.pathname === '/verify-email') parsed.pathname = '/api/auth/verify-email';
        enqueueMail(deps, () =>
          sendAuthMail(mailer, {
            kind: 'verification',
            to: user.email,
            url: parsed.toString(),
          }),
        );
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: [],
      },
      updateAccountOnSignIn: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 60,
      customRules: {
        '/get-session': false,
        '/sign-in/email': { window: 600, max: 40 },
        '/sign-up/email': { window: 600, max: 40 },
        '/request-password-reset': { window: 600, max: 40 },
      },
    },
    advanced: {
      useSecureCookies: secureCookies,
      // Tests must run the same origin check as production. Vitest would
      // otherwise skip it, and a foreign callbackURL would look allowed.
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: secureCookies,
        sameSite: 'lax',
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, name: '', image: null },
          }),
        },
        update: {
          before: async (user) => {
            const data: Record<string, unknown> = { ...user };
            if ('name' in data) data.name = '';
            if ('image' in data && data.image) data.image = null;
            return { data };
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            if (account.providerId === 'credential') return { data: account };
            return {
              data: {
                ...account,
                accessToken: null,
                refreshToken: null,
                idToken: null,
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: null,
                scope: null,
              },
            };
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        rateLimit: { window: 600, max: 40 },
        sendMagicLink: async ({ email, url }) => {
          if (!mailer) return;
          enqueueMail(deps, () => sendAuthMail(mailer, { kind: 'magic-link', to: email, url }));
        },
      }),
      passkey({
        rpID: PASSKEY_RP_ID,
        rpName: 'Ordboj',
        origin: PASSKEY_ORIGIN,
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path ?? '';
        const fromQuery = ctx.query?.token;
        const fromUrl = ctx.request ? new URL(ctx.request.url).searchParams.get('token') : null;
        const token = (typeof fromQuery === 'string' ? fromQuery : null) ?? fromUrl;
        if (path === '/verify-email' || path.endsWith('/verify-email')) {
          if (!token) return;
          const consumed = await consumeMailToken(env.DB, token);
          if (!consumed) {
            throw new APIError('UNAUTHORIZED', { message: 'Invalid token' });
          }
          return;
        }
        if (path !== '/magic-link/verify' && !path.endsWith('/magic-link/verify')) return;
        if (!token) return;
        const row = await env.DB.prepare('SELECT value FROM verification WHERE identifier = ?')
          .bind(`magic-link:${token}`)
          .first<{ value: string }>();
        if (!row?.value) return;
        try {
          const parsed = JSON.parse(row.value) as { email?: string };
          if (parsed.email) await dropUnprovenPassword(env.DB, parsed.email);
        } catch {
          return;
        }
      }),
    },
  };
}

export function createAuth(env: Env, deps: AuthDeps, authOrigin: string = AUTH_BASE_URL) {
  if (!env.DB) {
    throw new Error('D1 binding DB is not configured.');
  }
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  }
  return betterAuth(buildAuthOptions({ ...env, DB: env.DB }, deps, authOrigin));
}
