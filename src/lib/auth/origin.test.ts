import { describe, expect, it } from 'vitest';
import { callbackURL, resolveAuthBaseURL, safeNextPath } from '@/lib/auth/origin';

describe('auth origin', () => {
  it('uses https://ordboj.com for absolute links and never pages.dev', () => {
    expect(callbackURL('/sign-in')).toBe('https://ordboj.com/sign-in');
    expect(callbackURL('/')).toBe('https://ordboj.com/');
    expect(callbackURL('https://ordboj.pages.dev/practice')).toBe('https://ordboj.com/');
    expect(resolveAuthBaseURL('https://ordboj.com')).toBe('https://ordboj.com');
    expect(resolveAuthBaseURL('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
    expect(resolveAuthBaseURL('http://localhost:8080')).toBe('http://localhost:8080');
    expect(resolveAuthBaseURL('https://ordboj.pages.dev')).toBe('https://ordboj.com');
    expect(resolveAuthBaseURL('https://preview.ordboj.pages.dev')).toBe('https://ordboj.com');
    expect(safeNextPath('https://ordboj.pages.dev/practice')).toBe('/');
    expect(safeNextPath('/practice')).toBe('/practice');
  });
});
