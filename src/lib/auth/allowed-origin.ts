/**
 * Auth origins this app will use for Better Auth baseURL, OAuth callbacks,
 * and the state cookie. The request URL is the source. A Host header is
 * accepted only when it names that same host. Any other host is rejected.
 */
export const CANONICAL_ORIGIN = 'https://ordboj.com';

const PREVIEW_SUFFIX = '.ordboj.pages.dev';
const PREVIEW_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const LOOPBACK = new Set(['localhost', '127.0.0.1']);

export function resolveAllowedAuthOrigin(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.username !== '' || url.password !== '') return null;
  const hostname = url.hostname;

  if (hostname === 'ordboj.com') {
    if (url.protocol !== 'https:' || url.port !== '') return null;
    return CANONICAL_ORIGIN;
  }

  if (hostname.endsWith(PREVIEW_SUFFIX)) {
    if (url.protocol !== 'https:' || url.port !== '') return null;
    const label = hostname.slice(0, -PREVIEW_SUFFIX.length);
    if (!PREVIEW_LABEL.test(label)) return null;
    return `https://${label}${PREVIEW_SUFFIX}`;
  }

  if (LOOPBACK.has(hostname)) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  }

  return null;
}

/** Origin from request.url. A present Host header must match that URL. */
export function resolveRequestAuthOrigin(request: Request): string | null {
  const fromUrl = resolveAllowedAuthOrigin(request.url);
  if (!fromUrl) return null;
  const hostHeader = request.headers.get('host');
  if (hostHeader === null) return fromUrl;
  let headerHost: string;
  try {
    headerHost = new URL(`${new URL(request.url).protocol}//${hostHeader.trim()}`).host;
  } catch {
    return null;
  }
  if (headerHost.toLowerCase() !== new URL(request.url).host.toLowerCase()) return null;
  return fromUrl;
}
