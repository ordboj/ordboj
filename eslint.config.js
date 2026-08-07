import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      // Generated shadcn/ui primitives. Nobody edits these in place, so
      // linting them only produces noise we are not allowed to fix.
      'src/components/ui/**',
      // Claude Code Workflow orchestration scripts. They execute inside an
      // implicit async function, so top-level return/await is legal there
      // but not valid ESM; the default parser rightly rejects it. Not app
      // source, so keep them out of lint scope entirely.
      '.claude/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  prettierConfig,
);
