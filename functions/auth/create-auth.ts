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
import { dropUnprovenPassword } from './unproven-password';

export interface AuthDeps {
  mailer: Mailer | null;
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

export function buildAuthOptions(env: Env & { DB: D1Database }, deps: AuthDeps): BetterAuthOptions {
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

  return {
    appName: 'Ordboj',
    baseURL: AUTH_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [AUTH_BASE_URL],
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
        await sendAuthMail(mailer, { kind: 'reset', to: user.email, url: parsed.toString() });
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
        await sendAuthMail(mailer, {
          kind: 'verification',
          to: user.email,
          url: parsed.toString(),
        });
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
      useSecureCookies: true,
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
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
          await sendAuthMail(mailer, { kind: 'magic-link', to: email, url });
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
        if (path !== '/verify-email' && !path.endsWith('/verify-email')) return;
        const fromQuery = ctx.query?.token;
        const fromUrl = ctx.request ? new URL(ctx.request.url).searchParams.get('token') : null;
        const token = (typeof fromQuery === 'string' ? fromQuery : null) ?? fromUrl;
        if (!token) return;
        const consumed = await consumeMailToken(env.DB, token);
        if (!consumed) {
          throw new APIError('UNAUTHORIZED', { message: 'Invalid token' });
        }
      }),
    },
  };
}

export function createAuth(env: Env, deps: AuthDeps) {
  if (!env.DB) {
    throw new Error('D1 binding DB is not configured.');
  }
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  }
  return betterAuth(buildAuthOptions({ ...env, DB: env.DB }, deps));
}
