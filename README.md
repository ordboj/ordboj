# Ordböj

> **Hobby project.** I built this to learn and test AI coding tools (Claude Code, multi-agent workflows, and similar). Expect experiments in the commit history and the workflow files — that is part of the point.

A colorful, mobile-friendly web app for practicing Swedish verb conjugations with spaced repetition (SRS). Fun and simple and focused entirely on Swedish verbs.

## Features

- **Verb data** — a built-in set of common Swedish verbs (A1–C2), each tagged with a CEFR level, stored in `src/data/verbData.ts`.
- **All major forms** — infinitive, presens, preteritum, supinum, imperativ.
- **Two practice modes** — typing and multiple choice, switchable in Settings.
- **Pronunciation** — Web Speech API with a Swedish voice when available; autoplay and mute are configurable.
- **SRS scheduling** — an SM-2 (Anki-style) algorithm tracks repetitions, interval, ease factor and due date per verb+form item.
- **Progress page** — due counts, streaks and per-verb scheduling state.
- **Offline-first** — all progress and settings live in `localStorage`; no backend, no account.
- **Playful UI** — single-card layout, large touch targets, progress bar, confetti on perfect answers.

## Tech stack

- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui (Radix primitives)
- React Router, TanStack Query
- `canvas-confetti` for the celebration animation

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
  verb-data/    candidates.csv (promotion queue, not shipped)
```

## Data model

```ts
type Verb = { id: string; infinitive: string; cefr?: string };
type Form = 'infinitive' | 'presens' | 'preteritum' | 'supinum' | 'imperativ';
type SrsState = {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  lastGrade?: number;
};
```

## Settings

Practice mode, example sentences on/off, audio autoplay, mute, interface language (EN / SV), daily goal, and which CEFR levels to draw verbs from.

## Development

Requires Node.js and npm.

```sh
git clone <this-repository-url>
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
```

## Project management

Tasks and status are tracked in [Linear](https://linear.app/ordboj)
(workspace **Ordboj**, team **Ordboj**). GitHub issues remain open for
inbound reports; each migrated Linear issue links back to its GitHub
original.

## License

[MIT](LICENSE)
