/** Canonical public origin. Never use ordboj.pages.dev for an absolute URL. */
export const CANONICAL_ORIGIN = 'https://ordboj.com';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * API calls from the browser stay on the current origin when that origin is
 * the canonical site or a local dev server. Any other host, including
 * *.pages.dev, uses https://ordboj.com.
 */
export function resolveAuthBaseURL(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === 'ordboj.com' || LOCAL_HOSTS.has(url.hostname)) return url.origin;
  } catch {
    return CANONICAL_ORIGIN;
  }
  return CANONICAL_ORIGIN;
}

export function callbackURL(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return `${CANONICAL_ORIGIN}/`;
  return `${CANONICAL_ORIGIN}${path}`;
}

/** In-app path only. Rejects absolute URLs and protocol-relative URLs. */
export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.includes('://') || value.includes('\\') || value.includes('pages.dev')) return '/';
  return value;
}

export function assignLocation(url: string): void {
  window.location.assign(url);
}
