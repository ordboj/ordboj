# Ordböj

A colorful, mobile-friendly web app for practicing Swedish verb conjugations with spaced repetition (SRS). Fun and simple, like Memrise — but focused entirely on Swedish verbs.

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
  data/         verbData.ts (hardcoded verb table)
public/
  data/         swedish_verbs.csv (source data the verb table was generated from)
```

## Data model

```ts
type Verb = { id: string; infinitive: string; cefr?: string };
type Form = "infinitive" | "presens" | "preteritum" | "supinum" | "imperativ";
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
```
