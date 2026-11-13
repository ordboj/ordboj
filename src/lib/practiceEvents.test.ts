import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRoundTracker,
  flushPracticeEvents,
  resetPracticeEventsForTests,
  savePracticeEventOptOut,
} from '@/lib/practiceEvents';

const auth = vi.hoisted(() => ({
  status: 'anonymous' as 'anonymous' | 'authenticated' | 'loading',
  offline: false,
}));

vi.mock('@/lib/auth/session', () => ({
  getAuthSnapshot: () => {
    if (auth.status === 'authenticated') {
      return {
        status: 'authenticated' as const,
        offline: auth.offline,
        user: { id: 'user-1', email: 'ada@example.com', emailVerified: true },
      };
    }
    if (auth.status === 'anonymous') return { status: 'anonymous' as const };
    return { status: 'loading' as const };
  },
}));

const calls: { method: string; body: string | null }[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  auth.status = 'anonymous';
  auth.offline = false;
  calls.length = 0;
  resetPracticeEventsForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : null;
      calls.push({ method, body });
      if (method === 'GET') return jsonResponse({ optedOut: false });
      if (method === 'PUT') return jsonResponse({ optedOut: body?.includes('"optedOut":true') });
      return jsonResponse({ stored: 1, optedOut: false });
    }),
  );
});

afterEach(() => {
  resetPracticeEventsForTests();
  vi.unstubAllGlobals();
});

function answer(round: ReturnType<typeof createRoundTracker>) {
  round.answer({
    sessionKind: 'due',
    practiceMode: 'typing',
    modality: 'typed',
    form: 'presens',
    correct: 1,
    wasNew: 1,
    isRequeue: 0,
  });
}

describe('practice event batching', () => {
  it('does not send events for a signed-out learner', () => {
    const round = createRoundTracker('conjugation');
    round.begin({ sessionKind: 'due', practiceMode: 'typing' });
    answer(round);
    round.finish();
    flushPracticeEvents();
    window.dispatchEvent(new Event('pagehide'));
    expect(calls).toEqual([]);
  });

  it('keeps start, answer, and complete in one request until the round ends', () => {
    auth.status = 'authenticated';
    const round = createRoundTracker('conjugation');
    round.begin({ sessionKind: 'due', practiceMode: 'typing' });
    answer(round);
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    round.finish();
    const posts = calls.filter((call) => call.method === 'POST');
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0]?.body ?? '{}') as { events: { event: string }[] };
    expect(body.events.map((event) => event.event)).toEqual([
      'practice_start',
      'answer',
      'practice_complete',
    ]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('ada@example.com');
    expect(serialized).not.toContain('user-1');
    expect(serialized).not.toContain('typedAnswer');
  });

  it('flushes the open round on pagehide without a request per answer', () => {
    auth.status = 'authenticated';
    const round = createRoundTracker('conjugation');
    round.begin({ sessionKind: 'due', practiceMode: 'typing' });
    answer(round);
    answer(round);
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    window.dispatchEvent(new Event('pagehide'));
    const posts = calls.filter((call) => call.method === 'POST');
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0]?.body ?? '{}') as { events: { event: string }[] };
    expect(body.events.map((event) => event.event)).toEqual(['practice_start', 'answer', 'answer']);
  });

  it('does not send after the learner objects', async () => {
    auth.status = 'authenticated';
    const saved = await savePracticeEventOptOut(true);
    expect(saved).toBe(true);
    const round = createRoundTracker('conjugation');
    round.begin({ sessionKind: 'due', practiceMode: 'typing' });
    answer(round);
    round.finish();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect(
      calls.some((call) => call.method === 'PUT' && call.body?.includes('"optedOut":true')),
    ).toBe(true);
  });
});
