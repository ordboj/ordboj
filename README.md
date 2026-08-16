# Ordböj

[![CI](https://github.com/ordboj/ordboj/actions/workflows/ci.yml/badge.svg)](https://github.com/ordboj/ordboj/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Built with Claude Code](https://img.shields.io/badge/built_with-Claude_Code-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React 18](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)

Ordböj is a colorful, mobile-friendly web app that teaches Swedish verb
conjugation with spaced repetition (SRS). It runs fully in the browser.
There is no backend and no account. All progress stays in `localStorage`.

> **Hobby project.** I built Ordböj to learn how to work with AI coding
> agents. A team of Claude Code agents writes almost all of the code, and
> the commit history shows the experiments. See
> [How the AI team works](docs/AI-WORKFLOW.md).

## Features

- A built-in set of common Swedish verbs (CEFR A1–C2), stored in
  `src/data/verbData.ts`.
- All major forms: infinitive, presens, preteritum, supinum, imperativ.
- Two practice modes: typing and multiple choice.
- SM-2 (Anki-style) spaced repetition per verb form, with due dates,
  intervals, and ease factors.
- Pronunciation through the Web Speech API, with a Swedish voice when one
  is available.
- A progress page with due counts, streaks, and per-verb schedule state.
- Offline-first: progress and settings live in `localStorage`.
- Playful UI: single-card layout, large touch targets, and confetti on
  perfect answers.
- Settings for practice mode, example sentences, audio, interface language
  (EN / SV), daily goal, and CEFR levels.

## Built with AI agents

A Claude Code lead session and ten specialist agents build this project.
Each agent owns its own files. For example, the Swedish linguist owns the
verb data, and the SRS engineer owns the scheduler. New ideas go through a
review pipeline before any agent writes code. A human reviews the results
and approves every merge.

[How the AI team works](docs/AI-WORKFLOW.md) describes the team, the
automated pipelines, and the Claude Code features behind them.

## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui (Radix primitives)
- React Router, TanStack Query
- Vitest and Playwright for tests
- `canvas-confetti` for the celebration animation

## Development

You need Node.js and npm.

```sh
git clone https://github.com/ordboj/ordboj.git
cd ordboj
npm install
npm run dev
```

The dev server runs on port 8080.

```sh
npm run build     # production build
npm run preview   # serve the build locally
npm run lint      # eslint
npm run typecheck # tsc --noEmit
npm test          # vitest (unit + component tests)
npm run test:e2e  # playwright (end-to-end tests)
```

## Project layout

```
src/
  pages/        Home, Practice, Progress, Settings, NotFound
  components/   PracticeCard, VerbDetailsModal, ConfettiEffect
  components/ui shadcn/ui primitives
  hooks/        useSettings, useSrsProgress
  lib/          srs.ts (SM-2), verbs.ts (conjugation + lookup), speech.ts
  data/         verbData.ts (single source of truth for shipped verb data)
docs/
  AI-WORKFLOW.md  how the AI agent team builds this project
  verb-data/      candidates.csv (promotion queue, not shipped)
.claude/
  agents/       the specialist agent roles
  workflows/    idea-pilot, ticket-pilot, deps-pilot
  skills/       project skills (writing style, token budget)
```

## Project management

Tasks and status are tracked in [Linear](https://linear.app/ordboj)
(workspace **Ordboj**, team **Ordboj**). GitHub issues stay open for
inbound reports. Each migrated Linear issue links back to its GitHub
original.

## License

[MIT](LICENSE)
