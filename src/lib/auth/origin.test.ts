import { describe, expect, it } from 'vitest';
import {
  callbackURL,
  resolveAuthBaseURL,
  resolveRequestAuthOrigin,
  safeNextPath,
} from '@/lib/auth/origin';

const BRANCH = 'https://cursor-ord-109-client-auth-u.ordboj.pages.dev';
const HASHED = 'https://05b54ff5.ordboj.pages.dev';

describe('auth origin', () => {
  it('keeps a Cloudflare preview host as the auth base instead of https://ordboj.com', () => {
    expect(resolveAuthBaseURL(BRANCH)).toBe(BRANCH);
    expect(resolveAuthBaseURL(HASHED)).toBe(HASHED);
    expect(callbackURL('/', BRANCH)).toBe(`${BRANCH}/`);
    expect(callbackURL('/sign-in', HASHED)).toBe(`${HASHED}/sign-in`);
  });

  it('keeps production on https://ordboj.com and rejects unknown hosts', () => {
    expect(callbackURL('/sign-in', 'https://ordboj.com')).toBe('https://ordboj.com/sign-in');
    expect(callbackURL('/', 'https://ordboj.com')).toBe('https://ordboj.com/');
    expect(callbackURL('https://ordboj.pages.dev/practice', 'https://ordboj.com')).toBe(
      'https://ordboj.com/',
    );
    expect(resolveAuthBaseURL('https://ordboj.com')).toBe('https://ordboj.com');
    expect(resolveAuthBaseURL('https://ordboj.com:443/sign-in')).toBe('https://ordboj.com');
    expect(resolveAuthBaseURL('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
    expect(resolveAuthBaseURL('http://localhost:8080')).toBe('http://localhost:8080');
    expect(resolveAuthBaseURL('https://localhost:8788')).toBe('https://localhost:8788');
    expect(resolveAuthBaseURL('https://ordboj.pages.dev')).toBeNull();
    expect(resolveAuthBaseURL('https://evil.example')).toBeNull();
    expect(resolveAuthBaseURL('https://ordboj.com.evil.example')).toBeNull();
    expect(resolveAuthBaseURL('https://notordboj.com')).toBeNull();
    expect(resolveAuthBaseURL('https://a.b.ordboj.pages.dev')).toBeNull();
    expect(resolveAuthBaseURL('https://evilordboj.pages.dev')).toBeNull();
    expect(resolveAuthBaseURL('http://preview.ordboj.pages.dev')).toBeNull();
    expect(resolveAuthBaseURL('https://ordboj.com:444')).toBeNull();
    expect(resolveAuthBaseURL('http://ordboj.com')).toBeNull();
    expect(resolveAuthBaseURL('https://user:pass@ordboj.com/')).toBeNull();
    expect(resolveAuthBaseURL('https://-bad.ordboj.pages.dev')).toBeNull();
    expect(callbackURL('/sign-in', 'https://evil.example')).toBe('https://ordboj.com/sign-in');
    expect(callbackURL('/stolen', 'https://evil.example')).not.toContain('evil.example');
    expect(safeNextPath('https://ordboj.pages.dev/practice')).toBe('/');
    expect(safeNextPath('/practice')).toBe('/practice');
  });

  it('rejects a Host header that does not match the request URL', () => {
    const matched = new Request(`${BRANCH}/api/auth/sign-in/social`, {
      headers: { host: 'cursor-ord-109-client-auth-u.ordboj.pages.dev' },
    });
    expect(resolveRequestAuthOrigin(matched)).toBe(BRANCH);

    const spoofed = new Request('https://ordboj.com/api/auth/sign-in/social', {
      headers: { host: 'evil.example' },
    });
    expect(resolveRequestAuthOrigin(spoofed)).toBeNull();

    const forwarded = new Request('https://ordboj.com/api/auth/get-session', {
      headers: { 'x-forwarded-host': 'evil.example' },
    });
    expect(resolveRequestAuthOrigin(forwarded)).toBe('https://ordboj.com');
  });
});
