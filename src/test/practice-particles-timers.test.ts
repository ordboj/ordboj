import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Pins the #271 fix: PracticeParticles.test.tsx must fake only Date. Tying
// Testing Library's waitFor polling to a fake clock that chased the real host
// clock made findBy* time out at a different point on each full-suite run.
const source = readFileSync(resolve(__dirname, '../pages/PracticeParticles.test.tsx'), 'utf8');

describe('PracticeParticles test clock contract (#271)', () => {
  it('fakes only Date', () => {
    expect(source).toMatch(/vi\.useFakeTimers\(\{[^}]*toFake:\s*\[\s*'Date'\s*\]/);
  });

  it('never re-enables shouldAdvanceTime', () => {
    expect(source).not.toMatch(/shouldAdvanceTime\s*:/);
  });

  it('never couples userEvent to the fake clock', () => {
    expect(source).not.toMatch(/advanceTimers\s*:/);
  });
});
