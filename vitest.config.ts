import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Separate from vite.config.ts (per test-engineer ownership boundary), but
// mirrors its resolve.alias so imports behave identically in tests and app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    // e2e/ is Playwright's territory (playwright.config.ts) — it uses
    // @playwright/test's own test()/expect(), which vitest's global
    // injection collides with if it tries to collect those files too.
    exclude: ['**/node_modules/**', '**/e2e/**'],
    // Vitest 4 removed `poolOptions` (moved to top-level options); this is
    // the replacement knob. Real-time waitFor budgets in fake-timer tests
    // get starved when worker count matches high local core counts (e.g.
    // 20 logical cores on a Windows dev box) — CI runners have 2-4 cores,
    // so this cap only bites on big local machines.
    maxWorkers: 8,
  },
});
