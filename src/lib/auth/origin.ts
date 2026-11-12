import { CANONICAL_ORIGIN, resolveAllowedAuthOrigin } from '@/lib/auth/allowed-origin';

export {
  CANONICAL_ORIGIN,
  resolveAllowedAuthOrigin,
  resolveRequestAuthOrigin,
} from '@/lib/auth/allowed-origin';

const CANONICAL_FALLBACK = CANONICAL_ORIGIN;

/**
 * Origin used for auth redirects. Production, an allowed Pages preview host,
 * and loopback stay on themselves. Any other host is rejected (null).
 */
export function resolveAuthBaseURL(origin: string): string | null {
  return resolveAllowedAuthOrigin(origin);
}

function pageOrigin(explicit?: string): string {
  if (explicit !== undefined) return explicit;
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return window.location.origin;
  }
  return CANONICAL_FALLBACK;
}

/**
 * Absolute URL on the current allowed page origin. A path that is not
 * root-relative, and a page origin that is not allowed, stay on
 * https://ordboj.com so an untrusted host is never written into the URL.
 */
export function callbackURL(path: string, explicitOrigin?: string): string {
  const base = resolveAllowedAuthOrigin(pageOrigin(explicitOrigin)) ?? CANONICAL_FALLBACK;
  if (!path.startsWith('/') || path.startsWith('//')) return `${base}/`;
  return `${base}${path}`;
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
