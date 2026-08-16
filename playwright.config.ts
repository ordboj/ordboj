import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Portability fallback, not an intended pin: a network-restricted sandbox
// cannot `npx playwright install` a newer Chromium revision when the
// installed @playwright/test package bumps its expected build id, and the
// box may only have an older revision pre-provisioned under
// PLAYWRIGHT_BROWSERS_PATH. Rather than every spec failing to launch a
// browser at all, fall back to whatever chromium-<rev> build is actually on
// disk there. On a normally-provisioned host (the version this
// @playwright/test build expects is already installed) this resolves to
// that same, correct build, so it changes nothing there — it only matters
// when the exact expected revision is missing.
function resolveLocalChromiumExecutable(): string | undefined {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath || !fs.existsSync(browsersPath)) return undefined;
  const revisions = fs
    .readdirSync(browsersPath)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const revision of revisions) {
    const candidate = path.join(browsersPath, revision, 'chrome-linux', 'chrome');
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}
const LOCAL_CHROMIUM_EXECUTABLE = resolveLocalChromiumExecutable();

// Owned by qa (see CLAUDE.md). Separate from vitest.config.ts:
// this drives real-browser smoke journeys, not unit/integration tests.
//
// Port 4173 (not 8080) so this never collides with a `npm run dev` a human
// already has open while writing/debugging tests.
const PORT = 4173;
// 127.0.0.1, not "localhost": some sandboxes/CI hosts have no IPv6 stack at
// all (EAFNOSUPPORT on a bare `::` bind), and Vite's default dev/preview
// bind is dual-stack. Binding the servers to an explicit IPv4 loopback
// (`--host 127.0.0.1` below) and pointing the baseURL at the same literal
// address keeps this config working on both kinds of host instead of
// depending on how the local resolver treats "localhost".
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

// Everything except CSP runs against `npm run dev`: fast rebuilds matter
// more than exact parity for the rest of the suite. But the CSP meta tag in
// index.html is deliberately placed to stay ahead of Vite's dev-mode
// preamble script (see the comment in index.html), which means dev serves
// a *weaker* effective policy than a static host does in production. A
// spec asserting "no CSP violations" against `npm run dev` would pass even
// if the built output regressed — dev never proves what a browser enforces
// against `dist/`. So the CSP spec gets its own project + its own
// webServer, pointed at a real `vite build` + `vite preview` (the
// production artifact, CSP meta and all) on a different port, and is
// excluded from the default mobile-chrome project to keep the rest of the
// suite on the faster dev server.
const PROD_PORT = 4174;
const PROD_BASE_URL = `http://${HOST}:${PROD_PORT}`;
const CSP_SPEC = /csp-violations\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(LOCAL_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: LOCAL_CHROMIUM_EXECUTABLE } }
      : {}),
  },

  // Ordböj is phone-first; the primary project pins a 360x640 mobile
  // viewport with touch emulation rather than testing desktop chrome by
  // default. Based on Pixel 7 (real device fingerprint/UA) with the
  // viewport overridden to the CLAUDE.md-mandated 360x640.
  projects: [
    {
      name: 'mobile-chrome',
      testIgnore: CSP_SPEC,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 640 },
      },
    },
    {
      name: 'csp-prod-build',
      testMatch: CSP_SPEC,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 640 },
        baseURL: PROD_BASE_URL,
      },
    },
  ],

  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort --host ${HOST}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // `vite preview` serves `dist/` as-is (no dev preamble, no HMR
      // client), so this is the closest thing to what a static host
      // actually ships — the CSP spec needs exactly that, not the dev
      // server. The build step is intentionally part of the webServer
      // command rather than a separate CI step: `reuseExistingServer`
      // still short-circuits it locally once `dist/` + the preview server
      // are already up.
      command: `npm run build && npm run preview -- --port ${PROD_PORT} --strictPort --host ${HOST}`,
      url: PROD_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
