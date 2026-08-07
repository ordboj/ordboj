import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Separate from vite.config.ts (per test-engineer ownership boundary), but
// mirrors its resolve.alias so imports behave identically in tests and app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
  },
});
