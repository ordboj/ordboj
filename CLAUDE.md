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

| Owner | Files |
|---|---|
| `swedish-linguist` | `src/data/verbData.ts`, `public/data/swedish_verbs.csv`, `src/lib/verbs.ts`, Swedish strings |
| `srs-engine` | `src/lib/srs.ts`, `src/hooks/useSrsProgress.ts` |
| `staff-engineer` | `index.html`, `src/main.tsx`, `src/App.tsx`, `tsconfig*.json`, `eslint.config.js`, `src/lib/utils.ts` |
| `devops` | `vite.config.ts`, `postcss.config.js`, `package.json`, `.github/**`, PWA/manifest/service worker, deploy config |
| `frontend-expert` | `src/pages/**`, `src/components/*.tsx`, `src/hooks/useSettings.ts`, `use-mobile.tsx`, `use-toast.ts`, `src/lib/speech.ts`, `tailwind.config.ts`, `src/index.css` |
| `qa` | `*.test.ts(x)`, `src/test/**`, `vitest.config.ts` |
| `learning-designer` | `docs/learning/**` — decision notes only, no production code |
| `product-manager` | `docs/product/**` — specs and decisions only, no production code |

`src/components/ui/**` is generated shadcn/ui. Nobody edits it in place;
compose around it. Exception: `devops` may delete unused primitives during
dependency cleanup, with grep evidence.

## Task tracking — GitHub Projects

All tasks live in the **Ordböj** GitHub Project:
<https://github.com/users/tugrulcan/projects/2> (project number `2`, owner
`tugrulcan`, linked repo `tugrulcan/ordboj`). Status is tracked there, not in
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
gh issue create --repo tugrulcan/ordboj --title "..." --body "..."
gh project item-add 2 --owner tugrulcan --url <issue-url>

# move status (field/option ids for project 2)
gh project item-edit --project-id PVT_kwHOAMCITM4Bft1t \
  --id <item-id> --field-id PVTSSF_lAHOAMCITM4Bft1tzhZ-xp0 \
  --single-select-option-id <opt>
# Todo=f75ad846  In Progress=47fc9ee4  Done=98236657

# find <item-id>
gh project item-list 2 --owner tugrulcan --format json
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
- Verb ids come from array index (`String(index + 1)`), so SRS items keyed on
  them break if the verb table is reordered or extended.
- `dueAt` is `Date.now() + interval`, not a local day boundary, so "due
  today" is ambiguous.
- The manifest carries many Radix and utility packages the Lovable scaffold
  installed; several are likely unused.
- Neither localStorage store (`swedish-verbs-settings`, SRS progress) is
  versioned yet.
