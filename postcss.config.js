// Tailwind 4 upgrade deliberately deferred (see issue #119): v4 is a
// CSS-first config with `tailwind.config.ts` removal and a 50+ file
// `src/components/ui/**` regression surface. Stay on Tailwind 3.4 /
// PostCSS-based config until that migration is scoped on its own.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
