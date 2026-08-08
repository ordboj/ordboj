import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import Practice from '@/pages/Practice';

// Issue #26 acceptance criteria, exercised end-to-end against the REAL
// useSrsProgress + useSettings hooks (not mocked) - this is the "what a
// user actually sees" level of coverage: dailyGoal default 50 / range 5-120
// (docs/learning/session-shape-and-daily-goal.md), session ends at
// answeredToday >= dailyGoal OR queue.length === 0, answeredToday persisted
// as {date, count}, header shows "n / dailyGoal".
// Only the verbs module (swedish-linguist, real ~50-verb A1 table) is left
// unmocked deliberately, so the queue is large enough to prove the
// goal-based ending fires well before the queue would ever empty.
const SETTINGS_KEY = 'swedish-verbs-settings';
const DAILY_COUNT_KEY = 'swedish-verbs-daily-count';

async function answerCardWrong(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByPlaceholderText('Type your answer...');
  await user.type(input, 'zzz-not-a-real-answer');
  await user.click(screen.getByRole('button', { name: /check answer/i }));
  expect(await screen.findByText(/not quite/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /next card/i }));
}

beforeEach(() => {
  localStorage.clear();
});

describe('Practice page - bounded session integration (issue #26, real hooks)', () => {
  it('ends the session once answeredToday reaches dailyGoal, even though many due items remain', async () => {
    // 5 is DAILY_GOAL_MIN: the smallest goal that survives the load-time
    // sanitization (anything lower coerces to the default 50).
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        practiceMode: 'typing',
        showExamples: false,
        autoplayAudio: false,
        muteAudio: true,
        dailyGoal: 5,
        cefrLevels: ['A1'],
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText('0 / 5')).toBeInTheDocument();

    for (let i = 0; i < 5; i++) {
      await answerCardWrong(user);
    }

    // Bounded by dailyGoal, not by the due queue (the real A1 table has far
    // more than 5 due items available).
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem(DAILY_COUNT_KEY) as string);
    expect(stored.count).toBe(5);
  });

  it("does not re-show a completed day's session: a fresh mount with answeredToday already at dailyGoal goes straight to the completion screen", async () => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        practiceMode: 'typing',
        showExamples: false,
        autoplayAudio: false,
        muteAudio: true,
        dailyGoal: 5,
        cefrLevels: ['A1'],
      }),
    );
    localStorage.setItem(DAILY_COUNT_KEY, JSON.stringify({ version: 1, date: todayKey, count: 5 }));

    renderWithProviders(<Practice />, { route: '/practice' });

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Type your answer...')).not.toBeInTheDocument();
  });
});
