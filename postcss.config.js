// Tailwind 4 migration landed via epic #259 / issue #69. It had been
// deliberately deferred in issue #119 (v4 is a CSS-first config with a large
// `src/components/ui/**` regression surface); that deferral ended when the
// migration was scoped on its own in #69. v4 moves the PostCSS plugin to
// @tailwindcss/postcss and handles vendor prefixing itself, so autoprefixer
// is gone. The legacy `tailwind.config.ts` is still honored through the
// `@config` directive in src/index.css.
//
// autoprefixer stays: Tailwind's own utilities are prefixed by v4 itself,
// but the hand-authored CSS in src/index.css is not, and the qa contract in
// src/test/vite7-router7-upgrade.test.ts pins fresh caniuse-lite browser
// data in the lockfile, which autoprefixer is what pulls in.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
