import { defineConfig, devices } from '@playwright/test';

// Owned by test-engineer (see CLAUDE.md). Separate from vitest.config.ts:
// this drives real-browser smoke journeys, not unit/integration tests.
//
// Port 4173 (not 8080) so this never collides with a `npm run dev` a human
// already has open while writing/debugging tests.
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Ordböj is phone-first; the primary project pins a 360x640 mobile
  // viewport with touch emulation rather than testing desktop chrome by
  // default. Based on Pixel 7 (real device fingerprint/UA) with the
  // viewport overridden to the CLAUDE.md-mandated 360x640.
  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 640 },
      },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
