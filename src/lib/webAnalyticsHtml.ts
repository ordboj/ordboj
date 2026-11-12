// Build-time fill-in for the Cloudflare Web Analytics beacon in index.html.
// The site token is CLOUDFLARE_WEB_ANALYTICS_TOKEN, a Pages build variable.
// It is not written here. A missing or malformed value removes the beacon
// so the page does not ship an empty token.

export const WEB_ANALYTICS_TOKEN_ENV = 'CLOUDFLARE_WEB_ANALYTICS_TOKEN';
export const WEB_ANALYTICS_PLACEHOLDER = '__ORDBOJ_CF_WEB_ANALYTICS__';

const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

function beaconBlock(): RegExp {
  const src = BEACON_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `[ \\t]*<script\\b[^>]*\\bsrc="${src}"[^>]*\\bdata-cf-beacon="${WEB_ANALYTICS_PLACEHOLDER}"[^>]*>\\s*<\\/script>`,
    'g',
  );
}

export function applyWebAnalyticsToken(html: string, token: string | undefined): string {
  const block = beaconBlock();
  if (!block.test(html)) return html;
  const trimmed = token?.trim() ?? '';
  if (!TOKEN_SHAPE.test(trimmed)) return html.replace(beaconBlock(), '');
  const script = `<script type="module" src="${BEACON_SRC}" data-cf-beacon='{"token":${JSON.stringify(trimmed)}}'></script>`;
  return html.replace(beaconBlock(), script);
}
