import { getAuthSnapshot } from '@/lib/auth/session';
import type { Form } from '@/lib/verbs';

// Practice events are buffered and sent in one POST. A round end, a page
// hide, or a hidden tab flushes the buffer. One answer does not send a
// request. Guests never send. An account that has objected never sends.

export type PracticeSurface = 'conjugation' | 'particle';
export type PracticeSessionKind = 'due' | 'extra' | 'free';
export type PracticeEventName = 'practice_start' | 'answer' | 'practice_complete';

export interface PracticeEventPayload {
  roundId: string;
  event: PracticeEventName;
  occurredAt: string;
  surface: PracticeSurface;
  sessionKind?: PracticeSessionKind;
  practiceMode?: 'typing' | 'multiple-choice';
  modality?: 'typed' | 'choice';
  form?: Form;
  particleKind?: 'cloze' | 'recall';
  correct?: 0 | 1;
  wasNew?: 0 | 1;
  isRequeue?: 0 | 1;
  itemCount?: number;
  correctCount?: number;
  durationMs?: number;
}

export interface RoundBeginInput {
  sessionKind: PracticeSessionKind;
  practiceMode?: 'typing' | 'multiple-choice';
}

export interface RoundAnswerInput {
  sessionKind: PracticeSessionKind;
  practiceMode?: 'typing' | 'multiple-choice';
  modality?: 'typed' | 'choice';
  form?: Form;
  particleKind?: 'cloze' | 'recall';
  correct: 0 | 1;
  wasNew: 0 | 1;
  isRequeue: 0 | 1;
}

export interface RoundTracker {
  begin(input: RoundBeginInput): void;
  answer(input: RoundAnswerInput): void;
  finish(): void;
}

type PreferenceStatus = 'unknown' | 'ready' | 'unavailable';

export interface PracticeEventPreference {
  status: PreferenceStatus;
  optedOut: boolean;
}

const MAX_BATCH = 80;
const MAX_BUFFER = 100;

let buffer: PracticeEventPayload[] = [];
let sending = false;
let optedOut = false;
let preferenceSnapshot: PracticeEventPreference = { status: 'unknown', optedOut: false };
let loadPromise: Promise<void> | null = null;
let listening = false;
let onPageHide: (() => void) | null = null;
let onVisibility: (() => void) | null = null;

const listeners = new Set<() => void>();

function recordingEnabled(): boolean {
  if (optedOut) return false;
  return getAuthSnapshot().status === 'authenticated';
}

function publish(next: PracticeEventPreference): void {
  if (next.status === preferenceSnapshot.status && next.optedOut === preferenceSnapshot.optedOut) {
    return;
  }
  preferenceSnapshot = next;
  for (const listener of listeners) listener();
}

export function subscribePracticeEventPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPracticeEventPreferenceSnapshot(): PracticeEventPreference {
  return preferenceSnapshot;
}

export function getPracticeEventPreferenceServerSnapshot(): PracticeEventPreference {
  return { status: 'unknown', optedOut: false };
}

export function practiceEventsOptedOut(): boolean {
  return optedOut;
}

function compact(event: PracticeEventPayload): PracticeEventPayload {
  const payload: PracticeEventPayload = {
    roundId: event.roundId,
    event: event.event,
    occurredAt: event.occurredAt,
    surface: event.surface,
  };
  if (event.sessionKind !== undefined) payload.sessionKind = event.sessionKind;
  if (event.practiceMode !== undefined) payload.practiceMode = event.practiceMode;
  if (event.modality !== undefined) payload.modality = event.modality;
  if (event.form !== undefined) payload.form = event.form;
  if (event.particleKind !== undefined) payload.particleKind = event.particleKind;
  if (event.correct !== undefined) payload.correct = event.correct;
  if (event.wasNew !== undefined) payload.wasNew = event.wasNew;
  if (event.isRequeue !== undefined) payload.isRequeue = event.isRequeue;
  if (event.itemCount !== undefined) payload.itemCount = event.itemCount;
  if (event.correctCount !== undefined) payload.correctCount = event.correctCount;
  if (event.durationMs !== undefined) payload.durationMs = event.durationMs;
  return payload;
}

function enqueue(event: PracticeEventPayload): void {
  if (!recordingEnabled()) return;
  if (buffer.length >= MAX_BATCH) flushPracticeEvents();
  buffer.push(compact(event));
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
}

function requeue(events: PracticeEventPayload[]): void {
  buffer = [...events, ...buffer].slice(0, MAX_BUFFER);
}

async function deliver(events: PracticeEventPayload[]): Promise<void> {
  sending = true;
  let failed = false;
  try {
    const response = await fetch('/api/events', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (response.status === 401 || response.status === 400) return;
    if (!response.ok) {
      failed = true;
      requeue(events);
      return;
    }
    try {
      const body = (await response.json()) as { optedOut?: unknown };
      if (body.optedOut === true) {
        optedOut = true;
        buffer = [];
        publish({ status: 'ready', optedOut: true });
      }
    } catch {
      // The rows were accepted. A body we cannot read is not a reason to send them again.
    }
  } catch {
    failed = true;
    requeue(events);
  } finally {
    sending = false;
    // A round that finished while a send was in flight still needs to leave.
    // A start event for the next round waits for that round's own end.
    const roundEnded = buffer.some((event) => event.event === 'practice_complete');
    if (!failed && !optedOut && (roundEnded || buffer.length >= MAX_BATCH)) {
      flushPracticeEvents();
    }
  }
}

export function flushPracticeEvents(): void {
  if (optedOut) {
    buffer = [];
    return;
  }
  const snap = getAuthSnapshot();
  if (snap.status !== 'authenticated') {
    if (snap.status === 'anonymous' || snap.status === 'offline-anonymous') buffer = [];
    return;
  }
  if (sending || buffer.length === 0) return;
  const events = buffer.splice(0, MAX_BATCH);
  void deliver(events);
}

export function installPracticeEventListeners(): void {
  if (listening || typeof window === 'undefined' || typeof document === 'undefined') return;
  listening = true;
  onPageHide = () => flushPracticeEvents();
  onVisibility = () => {
    if (document.visibilityState === 'hidden') flushPracticeEvents();
  };
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);
}

export function loadPracticeEventPreference(): Promise<void> {
  const snap = getAuthSnapshot();
  if (snap.status !== 'authenticated' || snap.offline) return Promise.resolve();
  if (preferenceSnapshot.status === 'ready') return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = fetch('/api/events', {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) {
        publish({ status: 'unavailable', optedOut });
        return;
      }
      const body = (await response.json()) as { optedOut?: unknown };
      optedOut = body.optedOut === true;
      if (optedOut) buffer = [];
      publish({ status: 'ready', optedOut });
    })
    .catch(() => {
      publish({ status: 'unavailable', optedOut });
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

export async function savePracticeEventOptOut(next: boolean): Promise<boolean> {
  const snap = getAuthSnapshot();
  if (snap.status !== 'authenticated' || snap.offline) return false;
  try {
    const response = await fetch('/api/events', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ optedOut: next }),
    });
    if (!response.ok) return false;
    optedOut = next;
    if (next) buffer = [];
    publish({ status: 'ready', optedOut: next });
    return true;
  } catch {
    return false;
  }
}

export function createRoundTracker(surface: PracticeSurface): RoundTracker {
  installPracticeEventListeners();
  let roundId: string | null = null;
  let startedAt = 0;
  let cardStartedAt = 0;
  let sessionKind: PracticeSessionKind = 'due';
  let practiceMode: 'typing' | 'multiple-choice' | undefined;
  let itemCount = 0;
  let correctCount = 0;

  const finish = (): void => {
    if (!roundId) return;
    const id = roundId;
    const durationMs = Math.max(0, Date.now() - startedAt);
    const count = itemCount;
    const correct = correctCount;
    const kind = sessionKind;
    const mode = practiceMode;
    roundId = null;
    itemCount = 0;
    correctCount = 0;
    if (!recordingEnabled()) return;
    enqueue({
      roundId: id,
      event: 'practice_complete',
      occurredAt: new Date().toISOString(),
      surface,
      sessionKind: kind,
      practiceMode: mode,
      itemCount: count,
      correctCount: correct,
      durationMs,
    });
    flushPracticeEvents();
  };

  return {
    begin(input) {
      if (roundId) finish();
      if (!recordingEnabled()) return;
      roundId = crypto.randomUUID();
      startedAt = Date.now();
      cardStartedAt = startedAt;
      sessionKind = input.sessionKind;
      practiceMode = input.practiceMode;
      itemCount = 0;
      correctCount = 0;
      enqueue({
        roundId,
        event: 'practice_start',
        occurredAt: new Date().toISOString(),
        surface,
        sessionKind: input.sessionKind,
        practiceMode: input.practiceMode,
      });
    },
    answer(input) {
      if (!roundId || !recordingEnabled()) return;
      const now = Date.now();
      itemCount += 1;
      if (input.correct === 1) correctCount += 1;
      enqueue({
        roundId,
        event: 'answer',
        occurredAt: new Date().toISOString(),
        surface,
        sessionKind: input.sessionKind,
        practiceMode: input.practiceMode,
        modality: input.modality,
        form: input.form,
        particleKind: input.particleKind,
        correct: input.correct,
        wasNew: input.wasNew,
        isRequeue: input.isRequeue,
        durationMs: Math.max(0, now - cardStartedAt),
      });
      cardStartedAt = now;
    },
    finish,
  };
}

/** Test isolation. Drops the buffer, the objection flag, and the page listeners. */
export function resetPracticeEventsForTests(): void {
  buffer = [];
  sending = false;
  optedOut = false;
  preferenceSnapshot = { status: 'unknown', optedOut: false };
  loadPromise = null;
  if (typeof window !== 'undefined' && onPageHide) {
    window.removeEventListener('pagehide', onPageHide);
  }
  if (typeof document !== 'undefined' && onVisibility) {
    document.removeEventListener('visibilitychange', onVisibility);
  }
  onPageHide = null;
  onVisibility = null;
  listening = false;
  for (const listener of listeners) listener();
}
