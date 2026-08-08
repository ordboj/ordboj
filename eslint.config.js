import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
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
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      // react-jsx runtime (tsconfig "jsx": "react-jsx") means React does not
      // need to be in scope, so the base "recommended" config's
      // react-in-jsx-scope/jsx-uses-react rules are switched off by the
      // jsx-runtime config layered on top.
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      jsxA11y.flatConfigs.recommended,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // No PropTypes here: this is a TypeScript codebase, props are typed
      // statically instead.
      'react/prop-types': 'off',
      // TODO(#120): 3 pre-existing hits live in files owned by other roles
      // (csp-violations.spec.ts, src/hooks/use-toast.ts,
      // src/hooks/useSrsProgress.ts). Promote to 'error' once those are
      // cleaned up so CI enforces it the way exhaustive-deps will below.
      '@typescript-eslint/no-unused-vars': 'warn',
      // TODO(#120): enabling react.configs.flat.recommended surfaces 2
      // pre-existing hits (unescaped apostrophe in copy) in
      // frontend-expert-owned src/pages/Practice.tsx and Progress.tsx.
      // 'warn' makes the debt visible without breaking CI or requiring
      // this role to edit files it doesn't own. Promote to 'error' once
      // those two are fixed.
      'react/no-unescaped-entities': 'warn',
      // TODO(#120): jsxA11y.flatConfigs.recommended surfaces 1 pre-existing
      // hit (autoFocus) in frontend-expert-owned src/components/PracticeCard.tsx.
      // Same reasoning as above: 'warn' for visibility, promote to 'error'
      // once fixed.
      'jsx-a11y/no-autofocus': 'warn',
    },
  },
  {
    // Root-level Node config files (commitlint, eslint itself, postcss,
    // ...). Previously outside lint scope entirely, so syntax and dead
    // code here were invisible to tooling.
    extends: [js.configs.recommended],
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
  },
  prettierConfig,
);
