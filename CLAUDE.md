# Ordböj — project instructions

Swedish verb conjugation trainer. Vite + React 18 + TypeScript, Tailwind +
shadcn/ui. No backend, no accounts: all progress and settings live in
`localStorage`. Dev server runs on port 8080.

Commands: `npm run dev`, `npm run build`, `npm run lint`,
`npm run typecheck`, `npm test` (Vitest, harness owned by `qa`).

## Two facts that shape every decision

1. **User progress is irreplaceable.** One browser, one `localStorage`, no
   backup. Any change to stored data needs a version field and a forward
   migration.
2. **Wrong Swedish is worse than missing Swedish.** A confidently incorrect
   conjugation teaches the learner something false. Uncertainty gets flagged
   for a human, never guessed.

## The team

The main session is the team lead. Teammates cannot spawn teammates.
Roles: `product-manager` (scope/specs), three business owners
(`srs-engine`, `swedish-linguist`, `learning-designer`), `staff-engineer`
(architecture), `frontend-expert`, `devops`, `qa`.

## File ownership

Agents must not edit files another agent owns. Report the defect to the lead
instead; the lead routes it.

| Owner               | Files                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `swedish-linguist`  | `src/data/verbData.ts`, `public/data/swedish_verbs.csv`, `src/lib/verbs.ts`, Swedish strings                                                                     |
| `srs-engine`        | `src/lib/srs.ts`, `src/hooks/useSrsProgress.ts`                                                                                                                  |
| `staff-engineer`    | `index.html`, `src/main.tsx`, `src/App.tsx`, `tsconfig*.json`, `eslint.config.js`, `src/lib/utils.ts`                                                            |
| `devops`            | `vite.config.ts`, `postcss.config.js`, `package.json`, `.github/**`, PWA/manifest/service worker, deploy config                                                  |
| `frontend-expert`   | `src/pages/**`, `src/components/*.tsx`, `src/hooks/useSettings.ts`, `use-mobile.tsx`, `use-toast.ts`, `src/lib/speech.ts`, `tailwind.config.ts`, `src/index.css` |
| `qa`                | `*.test.ts(x)`, `src/test/**`, `vitest.config.ts`                                                                                                                |
| `learning-designer` | `docs/learning/**` — decision notes only, no production code                                                                                                     |
| `product-manager`   | `docs/product/**` — specs and decisions only, no production code                                                                                                 |

`src/components/ui/**` is generated shadcn/ui. Nobody edits it in place;
compose around it. Exception: `devops` may delete unused primitives during
dependency cleanup, with grep evidence.

## Task tracking — GitHub Projects

All tasks live in the **Ordböj** GitHub Project:
<https://github.com/orgs/ordboj/projects/1> (project number `1`, owner
`ordboj`, linked repo `ordboj/ordboj`). Status is tracked there, not in
chat.

- Every task an agent defines or receives becomes a GitHub Issue added to
  the project. Agents report new tasks to the lead; **the lead** creates the
  issue and project item and moves statuses. Agents do not run `gh` for
  project management themselves.
- Issue title: imperative, one line. Body: owner role, acceptance criteria,
  files touched. Label with the owning role where useful.

Recipes (lead only):

```sh
# create issue + add to project
gh issue create --repo ordboj/ordboj --title "..." --body "..."
gh project item-add 1 --owner ordboj --url <issue-url>

# move status (field/option ids for org project 1)
gh project item-edit --project-id PVT_kwDOEr3qds4BfuEP \
  --id <item-id> --field-id PVTSSF_lADOEr3qds4BfuEPzhZ--ms \
  --single-select-option-id <opt>
# Todo=f75ad846  In Progress=47fc9ee4  Done=98236657

# find <item-id>
gh project item-list 1 --owner ordboj --format json
```

Close the issue (`gh issue close`) when work is verified, then set status
Done.

## Lead responsibilities

- Split work so no two active teammates hold the same file. Cross-cutting
  work is serialized, not parallelized.
- Scope and feature definition go to `product-manager`; pedagogy questions
  go to `learning-designer` for a written decision before `srs-engine` or
  `frontend-expert` implement anything. Engineers do not invent product or
  learning-science policy mid-task.
- Architecture calls, storage-schema changes and cross-owner changes are
  reviewed by `staff-engineer` before merge.
- Bugs found by `qa` are routed to the owning agent with the failing test
  attached. Tests are never weakened to pass.
- Before declaring work done, run `npm run lint`, `npm run typecheck`,
  `npm test` and `npm run build` and paste the real output. No completion
  claims without evidence.
- Data-shape changes to `localStorage` need an explicit migration and the
  human's approval before merge.
- Keep the GitHub Project current: new task → issue in Todo; dispatched →
  In Progress; verified → Done.
- **Teammates always run in the background.** Every Agent call for a teammate
  uses `run_in_background: true` (the default) and is never awaited inline.
  Never pass `run_in_background: false` for these agents. The lead keeps the
  main chat responsive, dispatches work, and reports results when the task
  notification arrives.

## Known issues to keep in mind

- `swedish_verbs.csv` has ~1537 rows; `VERB_DATA` in `verbData.ts` has ~50.
  They have drifted and only the TS table ships.
- SRS conjugation progress is keyed `<infinitive>-<form>` as of #291 (see
  `src/lib/itemIds.ts`), so a stored item stays attached to its verb across a
  reorder or insert in `VERB_DATA`. `Verb.id` (`src/lib/verbs.ts`) is still
  positional (`String(index + 1)`); `conjugationItemId` resolves that
  positional ref to the current infinitive before building the key. The
  follow-up is to make `Verb.id` the infinitive itself, at which point the
  legacy-id resolution branch in `itemIds.ts` can be deleted.
- The manifest carries many Radix and utility packages the Lovable scaffold
  installed; several are likely unused.
- The settings store (`swedish-verbs-settings`) is still unversioned. The SRS
  progress store is versioned (`STORAGE_VERSION = 3`, `{version, items}`
  envelope with legacy migration in `useSrsProgress.ts`); it now carries both
  the original legacy-shape migration and a v2→v3 migration that rewrites
  positional item ids (`1-presens`) to infinitive-based ones
  (`vara-presens`); new fields there mean a v3→v4 bump, not greenfield
  versioning. `dueAt` is clamped to the next local day and `isDue` uses an
  end-of-local-day boundary (`srs.ts`) — the old "due today is ambiguous"
  issue is resolved.
