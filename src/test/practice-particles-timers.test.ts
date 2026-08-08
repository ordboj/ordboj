import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Pins the #271 fix: PracticeParticles.test.tsx must fake only Date. Tying
// Testing Library's waitFor polling to a fake clock that chased the real host
// clock made findBy* time out at a different point on each full-suite run.
const source = readFileSync(resolve(__dirname, '../pages/PracticeParticles.test.tsx'), 'utf8');

// Every call site, not just the first: a bare `vi.useFakeTimers()` added inside
// a single test fakes setTimeout again and reinstates the exact #271 coupling,
// which an "at least one call sets toFake" check would wave through.
const fakeTimerCalls = source.match(/vi\.useFakeTimers\([^)]*\)/g) ?? [];

describe('PracticeParticles test clock contract (#271)', () => {
  it('fakes only Date, at every useFakeTimers call site', () => {
    expect(fakeTimerCalls.length).toBeGreaterThan(0);
    for (const call of fakeTimerCalls) {
      expect(call).toMatch(/toFake:\s*\[\s*'Date'\s*\]/);
    }
  });

  it('never re-enables shouldAdvanceTime', () => {
    expect(source).not.toMatch(/shouldAdvanceTime\s*:/);
  });

  it('never couples userEvent to the fake clock', () => {
    expect(source).not.toMatch(/advanceTimers\s*:/);
  });
});
