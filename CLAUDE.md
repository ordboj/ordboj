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
| `qa`                | `*.test.ts(x)`, `*.spec.ts`, `src/test/**`, `e2e/**`, `vitest.config.ts`, `playwright.config.ts`                                                                 |
| `learning-designer` | `docs/learning/**` — decision notes only, no production code                                                                                                     |
| `product-manager`   | `docs/product/**` — specs and decisions only, no production code                                                                                                 |

`src/components/ui/**` is generated shadcn/ui. Nobody edits it in place;
compose around it. Exception: `devops` may delete unused primitives during
dependency cleanup, with grep evidence.

## Task tracking — Linear

All tasks live in Linear: workspace **Ordboj**, team **Ordboj**
(<https://linear.app/ordboj>). Status is tracked there, not in chat.

The old GitHub Project board (`orgs/ordboj/projects/1`) is retired. Cloud
sessions cannot reach the Projects v2 API: the GitHub proxy serves only a
pinned set of PR-review GraphQL operations and rejects all other GraphQL
with a 403, for all credentials. Do not try `gh project` or GraphQL for
task tracking.

- Every task an agent defines or receives becomes a Linear issue. Agents
  report new tasks to the lead; **the lead** creates the issue and moves
  statuses with the Linear MCP tools (`mcp__Linear__save_issue`,
  `mcp__Linear__list_issues`). Agents do not manage Linear themselves.
- Issue title: imperative, one line. Description: owner role, acceptance
  criteria, files touched. Label with the owning role (`role:*`) where
  useful.
- Statuses: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`,
  `Canceled`, `Duplicate`. Flow: new task → Todo; dispatched → In
  Progress; verified → Done.
- GitHub issues stay usable for inbound reports, but the Linear issue is
  the tracking record. When work tracked by both is verified, set the
  Linear issue to Done and close the GitHub issue
  (`mcp__github__issue_write`).
- History: the open GitHub issues were migrated to Linear on 2026-08-16.
  Each migrated Linear issue links back to its GitHub original
  ("Migrated from …"). Issue numbers like `#53` in older docs and PRs
  refer to the GitHub originals.

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
- Keep Linear current: new task → issue in Todo; dispatched → In
  Progress; verified → Done.
- **Teammates always run in the background.** Every Agent call for a teammate
  uses `run_in_background: true` (the default) and is never awaited inline.
  Never pass `run_in_background: false` for these agents. The lead keeps the
  main chat responsive, dispatches work, and reports results when the task
  notification arrives.
- **PR watching is event-driven.** When the lead babysits an open PR (a
  pilot merge queue, an auto-merge armed PR, or a PR the human asked to
  watch), it calls `subscribe_pr_activity` for that PR at the start. CI
  failures, reviews and comments then wake the session as events. The
  hourly `send_later` check-in stays as a fallback heartbeat only —
  webhooks can miss CI success and merge-conflict transitions — not as
  the primary polling loop. Unsubscribe (or let the session end) when the
  PR is merged or closed.
- **Parked PRs are a queue, not a graveyard.** A `needs-human` label means
  one open question, not an end state. When a pilot run returns parked
  results, the lead puts each parked question to the human with
  `AskUserQuestion` in the same turn. When the human answers, the lead
  re-runs `ticket-pilot` with that ticket number — the run adopts the open
  PR and continues from review. At the start of any backlog session, list
  open `needs-human` PRs; any of them older than a few days gets re-driven
  (answer + re-run) or closed with a reason, never left open silently.
- **`ready` results merge now, not later.** When ticket-pilot returns
  `ready` and the human's approval is already in the chat, the lead merges
  in the same turn. If the merge must wait, the lead subscribes to the PR
  (`subscribe_pr_activity`) and arms a `send_later` check-in, so the merge
  still happens after the turn ends. A green PR left waiting goes stale
  and dies as a conflict.
- **Raw feature ideas go through `idea-pilot`.** When the human sends idea or
  intention notes ("should we add X?", "what if Y worked like Z?"), the lead
  launches the `idea-pilot` workflow (`.claude/workflows/idea-pilot.js`) with
  the notes as `args.ideas` instead of an ad-hoc discussion. The workflow
  ends at the ticketed epic; the lead then asks the human whether to run
  `ticket-pilot` with the returned run plan. Exceptions: direct bug reports,
  questions, and tasks the human already scoped — those do not need the
  pipeline.

## Known issues to keep in mind

- `swedish_verbs.csv` has ~1537 rows; `VERB_DATA` in `verbData.ts` has ~50.
  They have drifted and only the TS table ships.
- The manifest carries many Radix and utility packages the Lovable scaffold
  installed; several are likely unused.
- The settings store (`swedish-verbs-settings`) is still unversioned. The SRS
  progress store is versioned (`STORAGE_VERSION = 3`, `{version, items}`
  envelope with legacy migration in `useSrsProgress.ts`); new fields there
  mean a v3→v4 bump, not greenfield versioning. `dueAt` is clamped to the
  next local day and `isDue` uses an end-of-local-day boundary (`srs.ts`) —
  the old "due today is ambiguous" issue is resolved. Issue #53 (v2→v3)
  re-keyed items onto the verb's infinitive instead of `String(index + 1)`
  over `VERB_DATA` (`src/lib/verbs.ts`), so stored ids survive the verb table
  being reordered or extended; `itemId` is no longer duplicated inside the
  stored value (it is the map key); and an item that was never practised is
  no longer persisted at all, since it is derivable on load. A one-shot,
  never-overwritten copy of the pre-v3 payload is kept at
  `swedish-verbs-srs-progress-backup-pre-v3` as a migration safety net; it
  has no read/restore path, so "Reset all progress" deletes it too — reset
  means reset (see PR #311).
