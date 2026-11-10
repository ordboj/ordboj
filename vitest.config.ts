import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Separate from vite.config.ts (per qa ownership boundary — see CLAUDE.md),
// but mirrors its resolve.alias so imports behave identically in tests and
// app.
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
    // Workers do not inherit the parent process's flags. The Progress heap
    // regression (ORD-71) needs a real GC to tell a retained verb list from
    // garbage that has not been collected yet. --expose-gc only adds
    // global.gc; it does not change assertions in other files.
    execArgv: ['--expose-gc'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    // e2e/ is Playwright's territory (playwright.config.ts) — it uses
    // @playwright/test's own test()/expect(), which vitest's global
    // injection collides with if it tries to collect those files too.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
