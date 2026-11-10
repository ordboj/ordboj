// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { handleAuthConfigRequest, publicAuthConfig } from './public-config';

const BETTER_AUTH_SECRET = 'better-auth-secret-value-do-not-leak-0123456789';
const GOOGLE_CLIENT_ID = 'google-client-id-do-not-leak';
const GOOGLE_CLIENT_SECRET = 'google-client-secret-do-not-leak';
const GITHUB_CLIENT_ID = 'github-client-id-do-not-leak';
const GITHUB_CLIENT_SECRET = 'github-client-secret-do-not-leak';
const MICROSOFT_CLIENT_ID = 'microsoft-client-id-do-not-leak';
const MICROSOFT_CLIENT_SECRET = 'microsoft-client-secret-do-not-leak';
const RESEND_API_KEY = 'resend-api-key-do-not-leak';

function env(overrides: Partial<Env> = {}): Env {
  return {
    BETTER_AUTH_SECRET,
    ...overrides,
  };
}

function forbiddenValues(value: Env): string[] {
  return [
    value.BETTER_AUTH_SECRET,
    value.GOOGLE_CLIENT_ID,
    value.GOOGLE_CLIENT_SECRET,
    value.GITHUB_CLIENT_ID,
    value.GITHUB_CLIENT_SECRET,
    value.MICROSOFT_CLIENT_ID,
    value.MICROSOFT_CLIENT_SECRET,
    value.RESEND_API_KEY,
  ].filter((item): item is string => typeof item === 'string' && item.length > 0);
}

describe('GET /api/auth-config', () => {
  it('reports which providers and mail are configured, and never returns a secret', async () => {
    const configured = env({
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET,
      MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET,
      RESEND_API_KEY,
    });
    const body = publicAuthConfig(configured);
    const encoded = JSON.stringify(body);

    expect(body).toEqual({
      oauth: { google: true, github: true, microsoft: true },
      mail: true,
    });
    expect(Object.keys(body).sort()).toEqual(['mail', 'oauth']);
    expect(Object.keys(body.oauth).sort()).toEqual(['github', 'google', 'microsoft']);
    expect(encoded).not.toContain('apple');
    for (const secret of forbiddenValues(configured)) {
      expect(encoded).not.toContain(secret);
    }

    const response = handleAuthConfigRequest(
      new Request('https://ordboj.com/api/auth-config'),
      configured,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    expect(JSON.parse(text)).toEqual(body);
    for (const secret of forbiddenValues(configured)) {
      expect(text).not.toContain(secret);
    }
  });

  it('hides a provider when either key is missing, and hides mail when the Resend key is missing', () => {
    expect(
      publicAuthConfig(
        env({
          GOOGLE_CLIENT_ID,
          GITHUB_CLIENT_SECRET,
          MICROSOFT_CLIENT_ID: '   ',
          MICROSOFT_CLIENT_SECRET,
        }),
      ),
    ).toEqual({
      oauth: { google: false, github: false, microsoft: false },
      mail: false,
    });

    const response = handleAuthConfigRequest(
      new Request('https://ordboj.com/api/auth-config'),
      env(),
    );
    expect(response.status).toBe(200);
  });

  it('rejects non-GET requests without reading secrets into the body', async () => {
    const response = handleAuthConfigRequest(
      new Request('https://ordboj.com/api/auth-config', { method: 'POST' }),
      env({ RESEND_API_KEY, GOOGLE_CLIENT_SECRET }),
    );
    expect(response.status).toBe(405);
    const text = await response.text();
    expect(text).not.toContain(RESEND_API_KEY);
    expect(text).not.toContain(GOOGLE_CLIENT_SECRET);
    expect(text).not.toContain(BETTER_AUTH_SECRET);
  });
});
