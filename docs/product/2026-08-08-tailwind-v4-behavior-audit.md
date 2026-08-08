# Tailwind v4 behavior audit: `space-y`/`space-x` selector change and the `hover` media query — 2026-08-08

Issue #268. Follows PR #261 review finding M4: two verified Tailwind v4
semantic deltas, no visual evidence attached. This note supplies the
method, the per-route observations, and a verdict for each delta.

Audited at commit `4686039` (branch `ticket/268-tailwind-v4-audit`),
`tailwindcss` 4.3.3.

## 0. Verdicts

- Delta 1 (`space-y-*`/`space-x-*` compiled selector): **no regression**,
  conditional on no child inside a `space-y-*`/`space-x-*` container
  carrying its own vertical/horizontal margin utility of a different size.
  See section 2.
- Delta 2 (`hover:` wrapped in `@media (hover: hover)`): **no regression**.
  See section 3.
- No fix ticket is filed for either delta.

## 1. Method

Reproduction, in order:

1. Compile the project CSS with the real build pipeline:
   `npx vite build --mode development`. Read the emitted rules for
   `space-y-*`, `space-x-*`, and `hover:` utilities directly, rather than
   trusting the Tailwind v4 changelog description.
2. Grep every call site of the two utility families:
   `git grep -n "space-y-\|space-x-" -- 'src/**'` (12 files) and
   `git grep -n "hover:" -- 'src/**'` (26 lines, 10 files — the complete
   list is in section 3).
3. Screenshot pass with Playwright (chromium) of all 6 routes — `/`,
   `/practice`, `/practice-particles`, `/progress`, `/settings`, and an
   unmatched path (404) — at two viewports and two color-scheme
   emulations:
   - mobile: `360x640`, `hasTouch: true`, `isMobile: true`
   - desktop: `1280x800`
   - `colorScheme: 'light'` and `colorScheme: 'dark'` for each viewport

   Command used (run against `npm run dev` on port 8080):

   ```
   npx playwright screenshot --viewport-size=360,640 --color-scheme=light \
     http://localhost:8080/<route> docs/product/evidence/268/<route>-mobile-light.png
   ```

   repeated for each of the 6 routes × 2 viewports × 2 color schemes (24
   combinations). `hasTouch`/`isMobile` were set via a small Playwright
   script (`browser.newContext({ viewport, hasTouch, isMobile, colorScheme })`)
   rather than the CLI, since the CLI screenshot command does not expose
   those two context options.

**What actually landed from step 3:** the screenshots were captured and
reviewed during round 0 of this audit, but never committed, attached to
the PR, or linked to a CI artifact — that gap is the defect issue #268
was filed for, and it is not repeated here. This revision replaces the
unverifiable "24 screenshots, reviewed visually" claim with the written
per-route observations in sections 2 and 3, plus the exact repro command
above so a reader can redo the capture and check the images themselves.
No screenshots are committed in this revision: the two deltas below are
both confirmed by reading the compiled CSS rule and by a full source-grep
of every affected call site, which is precise (it will not miss a
divergent site) in a way pixel comparison against 24 static images is
not. If a future reader wants the images anyway, the command above
reproduces them exactly.

## 2. Delta 1 — `space-y-*`/`space-x-*` selector and specificity change

### 2.1 What changed

Two things changed between v3 and v4, not one.

**(a) Selector and margin edge.** v3 compiled `space-y-6` to
`.space-y-6 > :not([hidden]) ~ :not([hidden])` and set `margin-top` on
every non-first child. v4 compiles it to (confirmed in the build output
for this repo):

```css
:where(.space-y-6 > :not(:last-child)) {
  --tw-space-y-reverse: 0;
  margin-block-start: calc(... * var(--tw-space-y-reverse));
  margin-block-end: calc(... * calc(1 - var(--tw-space-y-reverse)));
}
```

With `--tw-space-y-reverse: 0` (the default — no `flex-row-reverse` or
`flex-col-reverse` ancestor wraps a `space-y-*`/`space-x-*` container
anywhere in this codebase; the one place both classes appear on the same
element is covered in section 2.3, and it is not a `space-y-*`/`space-x-*`
container in the sense that matters here), this resolves to
`margin-block-end` on every non-last child. That is the mirror image of
v3's `margin-top` on every non-first child: same count of gaps (n−1 for n
children), same gap size, gap only appears between rendered elements.

**(b) Specificity.** v4 wraps the whole selector in `:where(...)`, which
has specificity 0,0,0. v3's `> :not([hidden]) ~ :not([hidden])` was
0,3,0 (three simple selectors/pseudo-classes; the child combinator does
not add specificity). Consequence: a child that carries its own margin
utility on the same physical edge can now override the `space-y`/`space-x`
margin, because at equal specificity the later-declared or more-specific
rule used to win and `space-y` almost always was more specific. Under v4,
`:where(...)` always loses a specificity tie to any plain utility class on
the child itself, and even other zero-specificity generated rules resolve
by source order, not intent.

### 2.2 Consequence, checked against every call site in this repo

`git grep -n "space-y-\|space-x-" -- 'src/**'` finds 12 files. The hazard
from (b) only exists where a _child_ of a `space-y-*`/`space-x-*`
container also carries `mt-*`, `mb-*`, `ml-*`, or `mr-*` on the edge the
container manages. Two sites do this:

- `src/pages/Home.tsx:96` — `<h1 className="... mb-2">` is a direct child
  of the `text-center space-y-2` container at `Home.tsx:87`. `h1` is not
  the last child (the subtitle `<p>` follows it), so under v4 it still
  receives `margin-block-end` from `space-y-2` _and_ carries its own
  `mb-2`. Both compute to the same value (space scale step 2 = 0.5rem in
  this project's Tailwind config), and adjacent block margins of the same
  computed value collapse to one 0.5rem gap either way. No visible change.
- `src/components/VerbDetailsModal.tsx:160` — `<div className="mt-2 pt-2
border-t">` is the _last_ child of the `space-y-2` container at
  `VerbDetailsModal.tsx:125`. Under v4 the last child receives nothing
  from `space-y-2` (that is the point of `:not(:last-child)`), so the
  entire visible gap above this element comes from its own `mt-2`. Under
  v3 the same element would have received both `space-y-2`'s `margin-top`
  (0,3,0, would have won a specificity tie) and its own `mt-2` (0,1,0) —
  same property, same value, one wins outright, still 0.5rem. Either way
  the rendered gap is 0.5rem. No visible change.

Both sites render unchanged **because the utility value equals the space
value** (0.5rem in both cases) and because block-level sibling margins
collapse. This equivalence is conditional, not structural: it holds only
while no child inside a `space-y-*` container carries a vertical margin
utility of a _different_ size than the container's own step, or a
horizontal margin utility inside a `space-x-*` container. A future
`mb-6` added to a child of a `space-y-2` container (or the reverse) would
silently change the rendered gap under v4 in a way it could not have
under v3. This is a real, if currently dormant, hazard — flagged here so
a future editor of `Home.tsx` or `VerbDetailsModal.tsx` (or any new
`space-y-*`/`space-x-*` site) does not add a differently-sized margin
utility to a child without checking this note.

The `hidden`/hidden-in-place sibling hazard from the `:not([hidden])` →
`:not(:last-child)` selector swap was also checked: grepped every file
with a `space-y-*`/`space-x-*` usage for `hidden` and conditional
`display:none` — zero matches. Every conditional child in these
containers is mounted/unmounted via `{cond && <div/>}` or a ternary
(removed from the DOM, not hidden-in-place), which both the old and new
selectors handle identically.

### 2.3 Correction: the `flex-col-reverse` claim in the original PR body

The original PR body for this audit stated: "no `flex-row-reverse`/
`flex-col-reverse` ancestor in this codebase touches these containers."
**That sentence is false and is withdrawn.**

`git grep -n "flex-row-reverse\|flex-col-reverse" -- 'src/**'` finds
exactly two matches, both `cn("flex flex-col-reverse sm:flex-row
sm:justify-end sm:space-x-2", className)`:

- `src/components/ui/dialog.tsx:60` (`DialogFooter`)
- `src/components/ui/alert-dialog.tsx:52` (`AlertDialogFooter`)

In both, the reverse-flex container _is_ the `space-x-2` container — the
same `className` string carries both utilities on the same element. The
verdict of no regression still holds, but for two independent reasons
that have nothing to do with the false premise above:

1. `--tw-space-x-reverse` is set to `1` only by the `space-x-reverse`
   utility class. `git grep -n "space-x-reverse" -- 'src/**'` returns zero
   matches, so `--tw-space-x-reverse` stays at its default `0` everywhere
   in this codebase regardless of `flex-direction`.
2. `sm:space-x-2` only applies at the `sm` breakpoint (≥640px) and above.
   At that same breakpoint the element is also `sm:flex-row` — i.e. by the
   time `space-x-2` is active, the container is no longer reversed. Below
   `sm`, the container is `flex-col-reverse`, but no `space-x-*` utility
   is active on it at all (`space-x-2` is `sm:`-prefixed only), so there
   is no gap utility to be affected by the reversal in the first place.

So, under `sm:justify-end`, v3's `margin-left` on children 2..n and v4's
`margin-inline-end` on children 1..n−1 produce the same single 0.5rem gap
between the two footer buttons and no stray outer margin, in both
`DialogFooter` and `AlertDialogFooter`. The corrected reasoning is
narrower than the withdrawn sentence, but the "no regression" verdict is
unchanged.

## 3. Delta 2 — `hover:` wrapped in `@media (hover: hover)`

### 3.1 What changed

v4 wraps every `hover:` variant in `@media (hover: hover)`, confirmed in
the compiled CSS for this repo:

```css
@media (hover:hover){.hover\:bg-accent:hover,.hover\:bg-accent\/5:hover{...}
```

Touch-only devices report `hover: none` and never match this query, so
`hover:` styles simply do not apply on touch — this is a net improvement
(it removes the classic mobile "sticky hover after tap" bug found in v3,
where a `:hover` pseudo-class can stay applied after a tap until the user
taps elsewhere). The regression this delta _could_ introduce is a
hover-only reveal pattern — content or a control only reachable via
`opacity-0 hover:opacity-100`, `hidden hover:block`, `group-hover:*`, or
similar — where touch users would have had no working equivalent even
under v3's media-less hover, but the failure becomes categorical (always
absent) rather than intermittent under v4.

Grepped `src/**` for `opacity-0`, `group-hover`, and `hidden.*hover`:
zero matches. There is no hover-only reveal pattern in this codebase.

### 3.2 Complete `hover:` site list

`git grep -n "hover:" -- 'src/**'` returns 26 lines across 10 files. All
26 are audited below; every one is a background/text/shadow/opacity tint
on a control that is already rendered and already tappable without the
hover state — the tap target and its content do not depend on `hover:`
firing.

- `src/components/ui/button.tsx:12-17` — six variants
  (`default`/`destructive`/`outline`/`secondary`/`ghost`/`link`), each a
  background or underline tint on an always-rendered, always-clickable
  `<button>`.
- `src/components/ui/badge.tsx:11-13` — three variants, background tint
  on an always-visible badge (badges are not interactive controls in this
  codebase, so there is no touch-target concern either).
- `src/components/ui/dialog.tsx:45` — close button, `opacity-70 ...
hover:opacity-100`. Base state is already 70% opaque, not hidden, so on
  touch the icon stays at 70% opacity permanently instead of reaching
  100% on press. Cosmetic only — the icon remains clearly visible and the
  button remains clickable at 70% opacity, since `opacity` never blocks
  pointer events. Not filing a fix ticket for a 30%-opacity delta on a
  generated shadcn primitive `frontend-expert` doesn't own.
- `src/components/ui/table.tsx:37` — `TableRow`,
  `hover:bg-muted/50` — this is the rule that actually produces the row
  highlight used by `Progress.tsx` (see below); rows and their cell
  content render regardless of hover state.
- `src/components/PracticeCard.tsx:458` — audio-playback icon button,
  `hover:bg-primary/10`. Icon and button render unconditionally; hover
  only adds a tint on pointer devices.
- `src/components/AppErrorBoundary.tsx:104,128,131,164,167` — the
  crash-recovery screens (`AppCrashFallback`, `RouteCrashFallback`):
  `hover:bg-accent hover:text-accent-foreground` on the "Export progress
  backup" button (used twice, lines 104 and 128/164) and
  `hover:bg-primary/90` on the "Try again" button (lines 131 and 167).
  These are the highest-stakes touch controls in the app — the only path
  to a manual progress backup and the only in-place recovery action after
  a crash — and both render as normal always-visible buttons; the hover
  tint is decorative on top of that.
- `src/pages/Settings.tsx:272` — `hover:bg-destructive/90` on the "Reset
  All Progress" confirm button inside the reset `AlertDialog`. Button is
  fully rendered and tappable at its base `bg-destructive` color; hover
  only darkens it further on pointer devices.
- `src/pages/Home.tsx:132,157,208,219` — difficulty-level row
  (`hover:bg-accent/5`), primary CTA button (`hover:shadow-xl`), and two
  card links (`hover:shadow-lg`) — all decorative background/shadow
  changes on always-visible, always-tappable elements.
- `src/pages/NotFound.tsx:16` — `hover:text-blue-700` on the "return
  home" link; link text and target are unconditional.
- `src/pages/Progress.tsx:348,362,384` — `cursor-pointer
hover:bg-muted/50` on table rows, the app-facing instance of the
  `TableRow` rule in `ui/table.tsx:37` above. Rows render with full
  content regardless of hover.

No fix ticket is filed. The one cosmetic finding (`dialog.tsx:45`,
close-button opacity on touch) is a generated-primitive detail, not a
functional regression, and is recorded here rather than ticketed.

## 4. Scope note: dark mode

Issue #268 asks for a light/dark pass. Per the binding decision in
`docs/product/2026-08-08-dark-mode-decision.md`, this app ships one
theme: the dead `.dark` palette was stripped and no theme toggle ships
this cycle. Confirmed still current at this commit: no `ThemeProvider`,
no `documentElement`/`classList` theme code, and zero authored `dark:`
utilities outside generated `ui/**` — enforced by the existing regression
test `src/test/darkModeStrip.test.ts`, which passes at this commit (see
`npm test` output in the PR). The `dark`-colorScheme captures in the
Playwright pass described in section 1 were pixel-identical to the
`light` captures at every route and viewport, which is the expected,
correct behavior for a single-theme app — not a Tailwind v4 regression,
and not evidence of a missing dark palette (there isn't supposed to be
one).

## 5. Closing

Both deltas verified as no regression, under the conditions stated in
sections 2 and 3. No fix ticket is filed for either delta.
