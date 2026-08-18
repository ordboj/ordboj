// Tests for discrimination-variant selection logic (issue #472).
//
// Synthetic frames only — this suite never imports src/data/particleVerbData.ts.
// DiscriminationFrame is a structural subset of ParticleVerbData /
// ParticleVerbExample, so a plain object literal satisfies it without that
// import (see discriminationVariant.ts's own module comment).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  selectDiscriminationVariant,
  isDiscriminationEligible,
  getEligibleLures,
  type DiscriminationFrame,
} from './discriminationVariant';

/** A frame with 2 eligible lures, reflexive 'none' — the minimum shape that
 * clears isDiscriminationEligible from repetitions 3 onward. */
function eligibleFrame(overrides: Partial<DiscriminationFrame> = {}): DiscriminationFrame {
  return {
    reflexive: 'none',
    acceptedParticles: ['ner', 'ned'],
    excludedParticles: ['in', 'upp'],
    ...overrides,
  };
}
const introducedForEligibleFrame = new Set(['in', 'upp', 'ner', 'ned']);

describe('isDiscriminationEligible', () => {
  it('is false below the repetitions floor', () => {
    expect(isDiscriminationEligible(eligibleFrame(), 0, introducedForEligibleFrame)).toBe(false);
    expect(isDiscriminationEligible(eligibleFrame(), 2, introducedForEligibleFrame)).toBe(false);
  });

  it('is true once repetitions reaches the floor', () => {
    expect(isDiscriminationEligible(eligibleFrame(), 3, introducedForEligibleFrame)).toBe(true);
  });

  it('is false for a reflexive entry positioned before the particle', () => {
    const frame = eligibleFrame({ reflexive: 'beforeParticle' });
    expect(isDiscriminationEligible(frame, 3, introducedForEligibleFrame)).toBe(false);
  });

  it('is false for a reflexive entry positioned after the particle', () => {
    const frame = eligibleFrame({ reflexive: 'afterParticle' });
    expect(isDiscriminationEligible(frame, 3, introducedForEligibleFrame)).toBe(false);
  });

  it('is false with only 1 eligible lure', () => {
    const frame = eligibleFrame({ excludedParticles: ['in', 'upp'] });
    const introduced = new Set(['in']); // 'upp' not introduced
    expect(isDiscriminationEligible(frame, 3, introduced)).toBe(false);
  });

  it('is true with exactly 2 eligible lures', () => {
    const frame = eligibleFrame({ excludedParticles: ['in', 'upp'] });
    const introduced = new Set(['in', 'upp']);
    expect(isDiscriminationEligible(frame, 3, introduced)).toBe(true);
  });

  it('is false when excludedParticles is undefined', () => {
    const frame = eligibleFrame({ excludedParticles: undefined });
    expect(isDiscriminationEligible(frame, 3, introducedForEligibleFrame)).toBe(false);
  });
});

describe('getEligibleLures', () => {
  it('keeps the authored order and drops particles not yet introduced', () => {
    const frame = { excludedParticles: ['x', 'y', 'z'] };
    const introduced = new Set(['z', 'x']); // 'y' missing, order given differently
    expect(getEligibleLures(frame, introduced)).toEqual(['x', 'z']);
  });
});

describe('selectDiscriminationVariant — trigger', () => {
  const frame = eligibleFrame();

  it('is null on repetitions not divisible by 3, even when eligible', () => {
    for (const rep of [4, 5, 7, 8]) {
      expect(selectDiscriminationVariant(frame, rep, introducedForEligibleFrame)).toBeNull();
    }
  });

  it('returns a variant on repetitions divisible by 3, from the floor onward', () => {
    for (const rep of [3, 6, 9, 12]) {
      expect(selectDiscriminationVariant(frame, rep, introducedForEligibleFrame)).not.toBeNull();
    }
  });
});

describe('selectDiscriminationVariant — renderIndex', () => {
  const frame = eligibleFrame();

  it('equals Math.floor(repetitions / 3)', () => {
    const cases: Array<[number, number]> = [
      [3, 1],
      [6, 2],
      [12, 4],
    ];
    for (const [rep, expected] of cases) {
      const variant = selectDiscriminationVariant(frame, rep, introducedForEligibleFrame);
      expect(variant?.renderIndex).toBe(expected);
    }
  });
});

describe('selectDiscriminationVariant — option-set shape', () => {
  it('every returned variant has exactly 3 options and exactly one correct:true', () => {
    const frame = eligibleFrame();
    for (let rep = 3; rep <= 30; rep += 3) {
      const variant = selectDiscriminationVariant(frame, rep, introducedForEligibleFrame);
      expect(variant).not.toBeNull();
      expect(variant?.options).toHaveLength(3);
      expect(variant?.options.filter((o) => o.correct)).toHaveLength(1);
    }
  });
});

describe('selectDiscriminationVariant — answer key', () => {
  it('uses only the target and eligible lures, never the second accepted spelling', () => {
    const frame: DiscriminationFrame = {
      reflexive: 'none',
      acceptedParticles: ['ner', 'ned'],
      excludedParticles: ['in', 'upp'],
    };
    const introduced = new Set(['in', 'upp', 'ner', 'ned']);

    for (const rep of [3, 6, 9, 12]) {
      const variant = selectDiscriminationVariant(frame, rep, introduced);
      expect(variant).not.toBeNull();
      const particles = variant!.options.map((o) => o.particle).sort();
      expect(particles).toEqual(['in', 'ner', 'upp']);
      expect(particles).not.toContain('ned');
      const correct = variant!.options.filter((o) => o.correct);
      expect(correct).toEqual([{ particle: 'ner', correct: true }]);
    }
  });
});

describe('selectDiscriminationVariant — defect guard', () => {
  it('returns null when excludedParticles contains an accepted particle', () => {
    // 'ned' is both an accepted spelling and (erroneously) an excluded
    // particle here — a data defect the module must refuse to render rather
    // than show a card with two "correct" options.
    const frame: DiscriminationFrame = {
      reflexive: 'none',
      acceptedParticles: ['ner', 'ned'],
      excludedParticles: ['ned', 'upp'],
    };
    const introduced = new Set(['ned', 'upp', 'ner']);

    for (const rep of [3, 6, 9, 12, 15]) {
      expect(selectDiscriminationVariant(frame, rep, introduced)).toBeNull();
    }
  });
});

describe('selectDiscriminationVariant — cyclic lure window', () => {
  const frame: DiscriminationFrame = {
    reflexive: 'none',
    acceptedParticles: ['göra'],
    excludedParticles: ['ut', 'emot', 'av', 'på'],
  };
  const introduced = new Set(['ut', 'emot', 'av', 'på']);

  it('picks the expected 2-lure window as renderIndex advances', () => {
    const cases: Array<[number, string[]]> = [
      [3, ['emot', 'av']],
      [6, ['av', 'på']],
      [9, ['på', 'ut']],
      [12, ['ut', 'emot']],
    ];
    for (const [rep, expectedPair] of cases) {
      const variant = selectDiscriminationVariant(frame, rep, introduced);
      expect(variant).not.toBeNull();
      const lures = variant!.options
        .filter((o) => !o.correct)
        .map((o) => o.particle)
        .sort();
      expect(lures).toEqual([...expectedPair].sort());
    }
  });
});

describe('selectDiscriminationVariant — rotation', () => {
  // Target 'm' sorts strictly between lures 'a' and 'z' under localeCompare,
  // so its position in the sorted-then-rotated option list is not fixed at
  // either end — this exercises the middle case as well as the wraparound.
  const frame: DiscriminationFrame = {
    reflexive: 'none',
    acceptedParticles: ['m'],
    excludedParticles: ['a', 'z'],
  };
  const introduced = new Set(['a', 'z', 'm']);

  it('rotates the target position at repetitions 3,6,9,12,15,18', () => {
    const reps = [3, 6, 9, 12, 15, 18];
    const positions = reps.map((rep) => {
      const variant = selectDiscriminationVariant(frame, rep, introduced);
      expect(variant).not.toBeNull();
      return variant!.options.findIndex((o) => o.correct);
    });
    expect(positions).toEqual([0, 2, 1, 0, 2, 1]);
  });

  it('never repeats the target position between consecutive renders', () => {
    const reps = [3, 6, 9, 12, 15, 18];
    const positions = reps.map((rep) => {
      const variant = selectDiscriminationVariant(frame, rep, introduced);
      return variant!.options.findIndex((o) => o.correct);
    });
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).not.toBe(positions[i - 1]);
    }
  });
});

describe('selectDiscriminationVariant — determinism', () => {
  it('returns a deep-equal result across repeated calls with identical args, for repetitions 3..30', () => {
    const frame: DiscriminationFrame = {
      reflexive: 'none',
      acceptedParticles: ['göra'],
      excludedParticles: ['ut', 'emot', 'av', 'på'],
    };
    const introduced = new Set(['ut', 'emot', 'av', 'på']);

    for (let rep = 3; rep <= 30; rep++) {
      const first = selectDiscriminationVariant(frame, rep, introduced);
      const second = selectDiscriminationVariant(frame, rep, introduced);
      expect(second).toEqual(first);
    }
  });
});

describe('selectDiscriminationVariant — purity', () => {
  it('never calls Math.random or Date, so its output cannot depend on wall-clock time or chance', () => {
    // Matches actual call sites (`Math.random(`, `new Date(`, `Date.now(`),
    // not the module's own doc-comment prose that names them as forbidden.
    const source = readFileSync(
      path.resolve(import.meta.dirname, './discriminationVariant.ts'),
      'utf-8',
    );
    const codeOnly = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/Math\.random\s*\(/);
    expect(codeOnly).not.toMatch(/new Date\s*\(/);
    expect(codeOnly).not.toMatch(/Date\.now\s*\(/);
  });

  it('produces identical output across calls even while Math.random is stubbed to a shifting value', () => {
    const frame = eligibleFrame();
    let counter = 0;
    const randomSpy = () => {
      counter += 1;
      return (counter % 10) / 10;
    };
    const original = Math.random;
    Math.random = randomSpy;
    try {
      const first = selectDiscriminationVariant(frame, 9, introducedForEligibleFrame);
      const second = selectDiscriminationVariant(frame, 9, introducedForEligibleFrame);
      expect(second).toEqual(first);
    } finally {
      Math.random = original;
    }
  });
});
