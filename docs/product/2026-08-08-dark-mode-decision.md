# Dark mode: strip the dead palette, do not ship a toggle — 2026-08-08

Ticket #140. Owner: `product-manager`. Binding on PR #149 and PR #160.

## 0. Decision

**Strip.** The unreachable `.dark` palette comes out; no theme toggle ships
this cycle. PR #160 is the vehicle, corrected per section 4 — it must keep
`darkMode: 'class'` in the Tailwind config, not delete it. PR #149 is closed
unmerged. Dark mode returns as a project only under the re-entry condition in
section 8.

This is not a new position. `docs/product/2026-08-08-uiux-audit-product-position.md`
already ruled it twice: §1.4 excludes "dark-mode parity" from the quality bar,
and §3.11 says "Contrast failures in the shipped theme are P2; building a
second theme is not this cycle." PR #149 was decided by an engineer against a
written product position. This document exists to make that ruling explicit
rather than to change it.

**Runner-up: ship the toggle after fixing `NotFound.tsx` and running a browser
contrast pass.** It lost because the toggle's cost is not the fix list — it is
the permanent doubling of the review surface. Every future screen, every
future component, every future copy change would need a second palette check
forever, in exchange for a preference feature for one known learner. The
invisible 404 is the evidence that this tax is already going unpaid on the
four screens that exist today.

## 1. What the code actually does today

- `tailwind.config.ts:5` — `darkMode: ['class']`.
- `src/index.css:61-100` — a complete `.dark` palette overriding all 20-odd
  design tokens.
- **Nothing applies the `.dark` class.** Grepping `src/` (excluding generated
  `src/components/ui/**`) for `classList`, `documentElement`, `theme`, `Theme`
  and `prefers-color-scheme` returns zero matches. There is no theme provider
  and no theme field in `useSettings.ts` (`src/hooks/useSettings.ts:3-10`).
- **Zero authored `dark:` utilities in app code.** Grepping `src/` excluding
  `ui/**` for `dark:` returns zero matches.

So the palette is genuinely dead code, not merely unused-for-now.

## 2. Sizing the `media` footgun honestly

The reviewer on PR #160 is right in principle and I am confirming the
mechanism, but the blast radius today is smaller than stated and worth
recording accurately so nobody re-litigates it later.

Deleting `darkMode: ['class']` makes Tailwind v3 fall back to its `media`
default, at which point every authored `dark:` utility compiles into a
`@media (prefers-color-scheme: dark)` block and fires for OS-dark users with
no palette behind it. Inside the repo there are exactly two `dark`-related
things in generated code:

- `src/components/ui/alert.tsx:12` — `dark:border-destructive`, the only real
  authored `dark:` utility in the codebase.
- `src/components/ui/chart.tsx:7` — `const THEMES = { light: "", dark: ".dark" }`,
  a selector string, not a Tailwind variant.

Neither `alert` nor `chart` is imported by any app code (grep for
`from '@/components/ui/(alert|chart)'` in `src/`: no matches). So the visible
regression today is zero pixels.

That does **not** make the deletion safe. It makes it a latent trap: the day
someone composes a screen out of a shadcn primitive carrying `dark:` classes,
OS-dark learners get a half-themed interface and nobody will connect it to a
config line deleted months earlier. The line costs nothing to keep. Keep it.

## 3. Why strip beats keep-and-ignore

Leaving 40 lines of dead CSS in place is the third option and it loses to
both. It ships bytes that render nothing, and — more importantly — it reads as
an invitation. It is precisely what made an engineer believe a toggle was a
40-line finishing touch rather than a product decision. Removing the palette
and leaving a comment that says why converts an invitation into a tripwire.

## 4. Implementation constraints for the corrected PR #160

These are binding. A strip PR that violates C1 is a regression, not a cleanup.

**C1. Keep `darkMode` set to the class strategy in `tailwind.config.ts`.** Do
not delete line 5. Normalizing `['class']` to `'class'` is allowed (identical
behavior); removing it is not.

**C2. Add a comment above it explaining the non-obvious constraint**, so the
next cleanup pass does not repeat this. Something to the effect of: no dark
palette ships, and this line must stay — deleting it switches Tailwind to the
`media` default and activates `dark:` utilities for OS-dark users with no
palette to back them.

**C3. Delete `src/index.css:61-100`,** the entire `.dark` block, and nothing
else in that file.

**C4. Do not modify any file under `src/components/ui/`.** Per `CLAUDE.md`,
that directory is generated and edited by nobody in place. `alert.tsx:12`'s
`dark:border-destructive` stays and is inert under the class strategy.

**C5. Scope is those two files only.** `tailwind.config.ts` is `devops`-owned
and `src/index.css` is `frontend-expert`-owned, so this PR crosses an
ownership boundary and needs both owners plus `staff-engineer` on the review,
per the lead's routing.

**C6. No storage change.** Nothing about this touches `localStorage`. No
version field, no migration, no human data approval needed.

## 5. Acceptance criteria

QA can take these verbatim.

1. `tailwind.config.ts` contains a `darkMode` key whose value is `'class'` or
   `['class']` after the change.
2. `src/index.css` contains no `.dark` selector.
3. The production CSS bundle (`npm run build`) contains no
   `@media (prefers-color-scheme: dark)` rule. **This is the regression test
   for C1** — it fails if someone deletes the `darkMode` line.
4. The production CSS bundle contains no `--background: 210 40% 10%` (the dark
   palette's signature value).
5. With the OS forced to dark, Home, Practice, Progress and Settings render
   pixel-identically to OS-light at 375px width.
6. `git diff --stat` on the PR touches exactly `tailwind.config.ts` and
   `src/index.css`, and no file under `src/components/ui/`.
7. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all
   pass.

## 6. Companion ticket, not part of this PR

`src/pages/NotFound.tsx:12-18` hardcodes `bg-gray-100`, `text-gray-600` and
`text-blue-500`. Those are raw Tailwind palette colors, not design tokens —
they are already off-theme in **light** mode, which is the shipped theme. The
dark-invisibility that PR #149 exposed is a symptom; the defect is that this
page opted out of the token system entirely.

Separate P3 ticket for `frontend-expert`: convert `NotFound.tsx` to
`bg-background`, `text-muted-foreground` and `text-primary`. It is a four-line
change, it is worth doing whether or not dark mode ever returns, and it must
not be bundled into the strip PR (different owner, different risk).

## 7. Out of scope, and why

- **A theme toggle in Settings.** Section 0. Adding a `theme` field to
  `Settings` would also grow an unversioned `localStorage` store
  (`useSettings.ts:21`) for a preference we have decided not to support.
- **Respecting `prefers-color-scheme` automatically, without a toggle.** Same
  cost as a toggle — it still requires a second reviewed palette — minus the
  learner's ability to turn it off.
- **A contrast audit of a second theme.** There is no second theme.
- **Contrast failures in the shipped light theme.** Still in scope as P2 per
  the audit position §3.11, tracked separately.

## 8. Re-entry condition

Reopen dark mode as a project when, and only when, the learner asks for it
directly, or evening use becomes the dominant session time. Not on aesthetic
grounds, and not because a component library happens to support it. When it
reopens it is a full ticket with a contrast pass across all four screens, not
a config line.

## 9. Ownership

| Part                                 | Owner                              |
| ------------------------------------ | ---------------------------------- |
| `tailwind.config.ts` change (C1, C2) | `devops`                           |
| `src/index.css` deletion (C3)        | `frontend-expert`                  |
| Cross-owner review                   | `staff-engineer`                   |
| `NotFound.tsx` token fix (§6)        | `frontend-expert`, separate ticket |
| Acceptance criteria §5               | `qa`                               |
| Closing #149, sequencing #160        | lead                               |
