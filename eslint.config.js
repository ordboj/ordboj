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
    name: 'ordboj/ignores',
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
    name: 'ordboj/app',
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
      reactHooks.configs.flat.recommended,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    settings: {
      // Not 'detect': version detection in eslint-plugin-react 7.37 still
      // calls context.getFilename(), which ESLint 10 removed, and crashes.
      // An explicit version skips that code path entirely. Keep in sync
      // with the react dependency's major.minor.
      react: { version: '18.3' },
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // #120: promoted from the plugin default now that the deck-reshuffle
      // and stale-callback bugs it pointed at are fixed (0 current hits) --
      // a new missing dependency must fail CI, not scroll past as a warning.
      'react-hooks/exhaustive-deps': 'error',
      // No PropTypes here: this is a TypeScript codebase, props are typed
      // statically instead.
      'react/prop-types': 'off',
      // TODO(#120): pre-existing hits in files owned by other roles
      // (qa's e2e/csp-violations.spec.ts `VERB`, frontend-expert's
      // PracticeCard `repetitions`). The '^_' patterns exempt deliberate
      // discards (e.g. `_itemId` in src/lib/srs.test.ts): an underscore
      // prefix is the author saying "unused on purpose". Promote to
      // 'error' once the two hits are cleaned up by their owners.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // TODO(#120): react-hooks 7's recommended preset promotes this new
      // rule to 'error'; it flags a real pre-existing reset-state-in-effect
      // pattern in frontend-expert-owned PracticeCard.tsx:226 and
      // useSettings.ts:39. 'warn' keeps the debt visible without this role
      // editing files it doesn't own. Promote back to 'error' once fixed.
      'react-hooks/set-state-in-effect': 'warn',
      // TODO(#120): pre-existing unescaped apostrophes in copy in
      // frontend-expert-owned pages/components (PracticeCard, Practice,
      // Progress, Settings). Same reasoning: 'warn' for visibility,
      // promote to 'error' once those are fixed.
      'react/no-unescaped-entities': 'warn',
      // TODO(#120): jsxA11y.flatConfigs.recommended surfaces a pre-existing
      // autoFocus hit in frontend-expert-owned src/components/PracticeCard.tsx.
      // 'warn' makes the debt visible without requiring this role to edit a
      // file it doesn't own. Promote to 'error' once fixed.
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
    name: 'ordboj/node-configs',
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
