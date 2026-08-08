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
      // TODO(#120): pre-existing hits live in files owned by other roles
      // (run `npx eslint .` for the current list). Promote to 'error' once
      // those are cleaned up. The '^_' patterns exempt deliberate discards
      // (e.g. `_itemId` in src/lib/srs.test.ts): an underscore prefix is
      // the author saying "unused on purpose", which is not debt worth
      // warning about.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // TODO(#120): enabling react.configs.flat.recommended surfaces
      // pre-existing hits (unescaped apostrophes in copy) in
      // frontend-expert-owned pages/components. 'warn' makes the debt
      // visible without breaking CI or requiring this role to edit files
      // it doesn't own. Promote to 'error' once those are fixed.
      'react/no-unescaped-entities': 'warn',
      // TODO(#120): jsxA11y.flatConfigs.recommended surfaces a pre-existing
      // autoFocus hit in frontend-expert-owned src/components/PracticeCard.tsx.
      // Same reasoning as above: 'warn' for visibility, promote to 'error'
      // once fixed.
      'jsx-a11y/no-autofocus': 'warn',
    },
  },
  {
    // Root-level Node config files (commitlint, eslint itself, postcss,
    // ...) and repo scripts. Previously outside lint scope entirely, so
    // syntax and dead code here were invisible to tooling. The .mjs/.cjs
    // extensions matter: `*.js` alone would silently drop any config or
    // script that picks an explicit module flavor, reopening the gap this
    // block exists to close (scripts/validate-verb-forms.mjs already does).
    extends: [js.configs.recommended],
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      // TODO(#120): bringing scripts/ into scope surfaces 1 pre-existing
      // hit: an unnecessary `\/` escape in a regex character class in
      // swedish-linguist-owned scripts/validate-verb-forms.mjs:35. 'warn'
      // instead of the recommended-config 'error' so widening lint scope
      // does not break CI on a file this role must not edit. Restore to
      // 'error' once that escape is removed.
      'no-useless-escape': 'warn',
    },
  },
  prettierConfig,
);
