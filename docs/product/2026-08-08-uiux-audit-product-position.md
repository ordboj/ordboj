# Product position for the UI/UX audit — 2026-08-08

Owner: `product-manager`. Binding on the `ui-ux-expert` audit and the design
critic's review. Outcome of this round is tickets only, no implementation.

## 0. Decision

The audit is scoped to **trust, mobile usability, and identity consistency on
the four screens that already exist**. Maximum **12 tickets**, of which at
most **4 may be P1**. No redesign, no new features, no ideas that require a
server. A finding that says "the app should do X instead" is out of scope; a
finding that says "the app claims X and does Y" is exactly what we want.

Runner-up framing, and why it lost: a full heuristic audit of the whole
experience with an unbounded ticket list. It loses because this is a
solo-maintained app with one learner and a real content gap (~50 of ~1537
verbs ship). Fifty design tickets would outnumber the engineering capacity for
the quarter and would compete with the content and id-migration work that
actually determines whether the product teaches anything.

## 1. Who this is for, and the proportionate quality bar

1.1 One learner, one phone, one browser. No accounts, no backend, no cohort.
Progress lives in `localStorage` and nowhere else.

1.2 The unit of use is a two-minute session on a phone, standing up, probably
one-handed. Everything is judged against that.

1.3 The quality bar is **"credible and honest," not "polished."** Concretely:

- Every control does what its label says, or it is removed.
- Nothing suggests the learner's progress is safer than it is.
- Nothing suggests coverage is broader than it is.
- Type is legible and tap targets are thumb-reachable at 375px width.
- Swedish shown to the learner is correct (owned by `swedish-linguist`, not
  by this audit).

1.4 The bar explicitly **does not** include: brand system, illustration style,
motion language, dark-mode parity, animation polish, or visual differentiation
from competitors. There is no market to differentiate in.

## 2. Prioritization frame for design tickets

The critic enforces these definitions. A ticket that does not fit a tier is
not a ticket.

**P1 — the interface lies, or the learner can lose data.**
A control that stores a value nothing reads. A screen that implies progress is
backed up when it is one browser-clear from gone. A destructive action without
adequate confirmation. Coverage or "due" counts presented as facts when the
underlying number is ambiguous. These ship first because they cost the learner
trust or data, and both are unrecoverable.

Confirmed examples already found while reading the code, offered to the audit
as seeds rather than as its findings:

- `src/pages/Settings.tsx:124-139` renders an "Interface Language"
  English/Svenska select. `interfaceLanguage` is written to settings and read
  by **no UI code anywhere** (grep: only the hook default, the tests, and this
  select). The learner can switch the app to Swedish and nothing happens.
- `src/pages/Settings.tsx:208-210` says "All data is stored locally on your
  device" as reassurance. Correct but misleading in tone: local is the risk,
  not the safeguard. Export exists directly above it and is never recommended.
- `src/pages/Settings.tsx:53-62` resets all progress on a second click within
  a 5-second window, on the same button, with no distinct confirm surface.

**P2 — the interface costs the learner time or accuracy on a phone.**
Tap targets under 44px, the 3-across CEFR grid at 375px
(`src/pages/Home.tsx:114`), the disabled "No Cards Due" dead end with no
alternative action (`Home.tsx:141-154`), progress/feedback legibility during
practice, keyboard behavior in typing mode. Real cost, recoverable, ship after
P1.

**P3 — cosmetic consistency.**
Tone and copy consistency, emoji use ("All caught up! Great work! 🎉",
"Practicing Swedish verbs with confidence ✨"), spacing rhythm, heading scale,
gradient repetition across all four screens. Batch these into as few tickets
as possible. One "copy and tone pass" ticket beats six.

**Not a ticket.** Anything of the form "consider adding," "it would be nice
if," or "users expect." One learner, known. There is no "users."

## 3. Scope guardrails

**In scope for this cycle:**

3.1 The four existing routes and their components: `src/pages/Home.tsx`,
`Practice.tsx`, `Progress.tsx`, `Settings.tsx`, plus `PracticeCard`.

3.2 Honesty defects — labels, counts, reassurances, and controls that do not
match behavior.

3.3 Mobile ergonomics at 375px and 390px widths, portrait, one-handed.

3.4 Identity consistency at the level defined in section 4: the app has a name
in `index.html` (`Ordböj`) but the header on `src/pages/Home.tsx:80` says
"Svenska Verb". Two names for one product is an in-scope defect.

3.5 First-run and empty states, since a new browser hits them immediately.

**Out of scope, and the critic should reject these on sight:**

3.6 Redesigns, new navigation models, tab bars, onboarding flows, or any
proposal whose diff touches more than the file it critiques.

3.7 New features. Streaks, achievements, leaderboards, notifications, widgets,
audio recording, and "gamification" are all feature requests wearing a design
costume. Route them to me as backlog items, not audit tickets.

3.8 Anything requiring a server, an account, sync, or analytics. There is no
backend and there will not be one. If the finding is real, the audit must
propose the closest local-only version or drop it.

3.9 Pedagogy. Card format, grading scale, session length, interval feel, and
what counts as "due" belong to `learning-designer`. A design ticket may report
that the interval feels wrong; it may not specify the fix.

3.10 Verb content, translations, and Swedish strings. `swedish-linguist` owns
those. The audit may flag "this string looks wrong" and stop there.

3.11 Dark mode as a project. Contrast failures in the shipped theme are P2;
building a second theme is not this cycle.

## 4. Identity: how much do the app icon and org logo matter, honestly

4.1 The org logo matters **very little**. Nobody is evaluating this product on
GitHub. It is not competing for stars or contributors. One ticket maximum, P3,
and only if the audit can point at something actively embarrassing.

4.2 The app icon matters **more than its aesthetic quality suggests**, for one
non-aesthetic reason: `public/` contains only `favicon.ico` and `robots.txt`.
There is no manifest, no `apple-touch-icon`, and `index.html` has no icon link
or `theme-color` at all. If the learner adds this to their phone home screen —
the intended two-minute-a-day behavior — they get a default browser tile with
no name. That is a **usability** defect on the primary use path, not a branding
one, and it qualifies as P2. The fix is owned by `devops` (manifest, icons,
head tags), not by whoever draws the picture.

4.3 The visual design of the icon itself is P3. Something legible at 48px with
the ö is sufficient. Do not spend a ticket on iterating a mark.

4.4 The name collision in 3.4 is worth more than the icon. Pick one name and
use it everywhere. That is a one-line change and a real trust signal.

## 5. Ticket budget and format

5.1 **Maximum 12 tickets.** At most 4 P1, at most 5 P2, at most 3 P3. If the
audit finds more, it merges or drops; it does not exceed. The critic's first
job is enforcing this number, before critiquing any individual finding.

5.2 Each ticket states: the observed behavior with a `file:line` citation, why
it costs the learner trust/time/data, the proposed change in one sentence, the
owning role from the file-ownership table in `CLAUDE.md`, and its tier.

5.3 Tickets with no `file:line` citation are speculation and get cut.

5.4 Sequencing note the audit must respect: verb ids are array-index derived
and `dueAt` is a raw timestamp rather than a local day boundary. Any design
proposal that depends on stable ids or on a real "today" is **blocked** behind
the id migration and the day-boundary fix. Such a ticket may be written, but it
must be marked blocked and does not count against the P1 allowance.

## 6. Ownership handoff

Findings land as tickets addressed to: `frontend-expert` (pages, components,
copy in UI, styling), `devops` (manifest, icons, head tags, bundle),
`swedish-linguist` (any Swedish string), `srs-engine` (only if a finding is
really about scheduling data), `learning-designer` (pedagogy questions raised
but not answered). The lead creates the GitHub issues; the audit does not.
