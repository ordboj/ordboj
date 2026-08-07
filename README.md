# ordboj

Build a colorful, mobile-friendly web app to help users practice Swedish verb conjugations using an SRS (Spaced Repetition System).
The app should feel fun and simple, like Memrise — but focused entirely on Swedish verbs.
Include typing practice, multiple-choice mode, and Swedish pronunciation for each form.

🧠 Core Functionality

1. Built-in Verb List (Hardcoded Data)
The app includes a preloaded JSON array of common Swedish verbs (A1–B1).
Example seed:

const verbs = [
  { infinitive: "vara" },
  { infinitive: "ha" },
  { infinitive: "gå" },
  { infinitive: "komma" },
  { infinitive: "skriva" },
  { infinitive: "läsa" },
  { infinitive: "säga" },
  { infinitive: "få" },
  { infinitive: "kunna" },
  { infinitive: "vilja" }
];


The structure should make it easy to extend this list later (up to ~1000 verbs).

2. Automatic Conjugation Generation
For each infinitive, automatically generate all major Swedish forms:

Infinitive

Presens

Preteritum

Supinum

Imperativ
Optionally show Perfekt (har + supinum) examples.
If a form cannot be generated, show “(not available yet)” instead of failing.

3. Practice Modes
Two modes for each exercise:

Typing: user types the correct conjugation.

Multiple Choice: user selects one of four options.

After each answer:

Give visual feedback (green ✅ / red ❌).

Play pronunciation for the correct form using Web Speech API (Swedish voice if available).

Optionally display an example sentence (toggle in settings).

4. SRS Scheduling
Use a lightweight SM-2 algorithm (Anki-style).
Each verb+form item stores:

repetitions

intervalDays

easeFactor

dueAt

lastGrade

After each attempt, update scheduling according to user accuracy (Again / Hard / Good / Easy).
Show “Due now” count on home screen.

5. Local Progress Storage
Store all user progress locally using IndexedDB or localStorage.

Works fully offline.

Keep user’s SRS schedule, answers, and preferences persistent.

Include “Backup / Restore” buttons in Settings (export/import JSON).

6. UI & UX

Colorful and playful, optimized for phones and iPads.

Single-card layout per question:

verb prompt at top,

input or options in middle,

feedback + Next button at bottom.

Progress bar at top.

Rounded edges, soft shadows, large touch-friendly buttons.

Confetti animation for perfect answers.

Minimal navigation: Home → Practice → Settings.

Optional light/dark theme toggle.

🧩 Settings

Mode toggle (Typing / Multiple Choice)

Example sentences on/off

Audio autoplay on/off

Interface language (EN / SV)

Daily goal (optional, no gamification)

📦 Persistence Model

Use these entities internally:

type Verb = { id: string; infinitive: string; };
type Form = "infinitive" | "presens" | "preteritum" | "supinum" | "imperativ";
type SrsState = {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  dueAt: number;
  lastGrade?: number;
};

✅ Acceptance Criteria

I can open the app on my phone or iPad and immediately practice verbs.

The app generates Swedish conjugations automatically.

I can type or select answers and hear Swedish pronunciation.

My progress and SRS data persist between sessions, even offline.

The interface is colorful, simple, and touch-friendly.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ordboj.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/13d3d930-a1b8-4969-b581-4eccf57aa707).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
