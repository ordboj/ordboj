import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The beacon lives in index.html. The site token is not in git: Vite fills
// CLOUDFLARE_WEB_ANALYTICS_TOKEN at build time, and removes the script when
// that variable is missing. These tests read the source files. They do not
// print a token.

const repoRoot = resolve(__dirname, '../..');
const indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
const viteConfig = readFileSync(resolve(repoRoot, 'vite.config.ts'), 'utf8');

const PLACEHOLDER = '__ORDBOJ_CF_WEB_ANALYTICS__';
const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
const FIXTURE_TOKEN = 'ordboj-test-token-not-real';

describe('index.html Web Analytics beacon', () => {
  it('places the manual snippet immediately before </body>', () => {
    const snippet = `<script
      type="module"
      src="${BEACON_SRC}"
      data-cf-beacon="${PLACEHOLDER}"
    ></script>`;
    const closing = indexHtml.lastIndexOf('</body>');
    expect(closing).toBeGreaterThan(-1);
    expect(indexHtml.slice(0, closing)).toContain(snippet);
    expect(indexHtml.slice(closing)).not.toContain('<script');
    expect(indexHtml.match(/beacon\.min\.js/g)).toHaveLength(1);
  });

  it('does not contain a site token', () => {
    expect(indexHtml).toContain(`data-cf-beacon="${PLACEHOLDER}"`);
    expect(indexHtml).not.toMatch(/data-cf-beacon='\{"token":/);
    expect(indexHtml).not.toContain(FIXTURE_TOKEN);
  });

  it('keeps the CSP meta before every script', () => {
    const cspIndex = indexHtml.indexOf('http-equiv="Content-Security-Policy"');
    const scriptIndex = indexHtml.indexOf('<script');
    expect(cspIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeGreaterThan(cspIndex);
  });
});

describe('vite Web Analytics token wiring', () => {
  it('reads the Pages build env and does not hardcode a token', () => {
    expect(viteConfig).toContain('CLOUDFLARE_WEB_ANALYTICS_TOKEN');
    expect(viteConfig).toContain('applyWebAnalyticsToken');
    expect(viteConfig).not.toContain(PLACEHOLDER);
    expect(viteConfig).not.toContain(FIXTURE_TOKEN);
    expect(viteConfig).not.toMatch(/data-cf-beacon='\{"token":/);
  });
});

describe('applyWebAnalyticsToken', () => {
  const source = `    <script
      type="module"
      src="${BEACON_SRC}"
      data-cf-beacon="${PLACEHOLDER}"
    ></script>
  </body>`;

  async function apply(token: string | undefined): Promise<string> {
    const { applyWebAnalyticsToken } = await import('../lib/webAnalyticsHtml');
    return applyWebAnalyticsToken(source, token);
  }

  it('omits the beacon when the env is missing, blank, or not a token', async () => {
    for (const token of [undefined, '', '   ', 'short', 'has space', "quote'", '<tag>']) {
      const html = await apply(token);
      expect(html).not.toContain('beacon.min.js');
      expect(html).not.toContain(PLACEHOLDER);
      expect(html).not.toContain('data-cf-beacon');
      expect(html).toContain('</body>');
    }
  });

  it('fills the manual snippet just before </body> when the env is set', async () => {
    const html = await apply(FIXTURE_TOKEN);
    expect(html).toContain(
      `<script type="module" src="${BEACON_SRC}" data-cf-beacon='{"token":"${FIXTURE_TOKEN}"}'></script>`,
    );
    expect(html.indexOf('beacon.min.js')).toBeLessThan(html.lastIndexOf('</body>'));
    expect(html).not.toContain(PLACEHOLDER);
    expect(html.match(/beacon\.min\.js/g)).toHaveLength(1);
  });

  it('does not add a snippet that was not already in the html', async () => {
    const { applyWebAnalyticsToken } = await import('../lib/webAnalyticsHtml');
    const plain = '<html><body><p>Hi</p></body></html>';
    expect(applyWebAnalyticsToken(plain, FIXTURE_TOKEN)).toBe(plain);
  });
});
