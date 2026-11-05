// Issue #474 / ORD-86. The synthetic suite in discriminationVariant.test.ts
// never imports the dataset, and particleVerbData.test.ts builds its option
// set with a local helper rather than selectDiscriminationVariant. This file
// runs the real selector over every certified frame in PARTICLE_VERB_DATA.
//
// A frame is certified when the entry is verified and the example carries at
// least two excludedParticles (docs/learning/2026-08-12-sentence-completion-
// distractors.md, "Ambiguity" item 4). The introduced set is exactly those
// excluded particles, so every authored lure is eligible and the rendered
// card is the one the selector would show a learner who has met them.

import { describe, expect, it } from 'vitest';
import { PARTICLE_VERB_DATA, type ParticleVerbData } from '@/data/particleVerbData';
import { selectDiscriminationVariant, type DiscriminationFrame } from './discriminationVariant';

const CERTIFIED_DEPTH = 2;
const BUILD_GATE_FRAMES = 8;
const BUILD_GATE_BASES = 5;

// Trigger repetitions from the floor through two full k%3 cycles.
const TRIGGER_REPETITIONS = [3, 6, 9, 12, 15, 18];
// One step off the trigger, so a certified frame still renders typed cloze.
const OFF_TRIGGER_REPETITIONS = [4, 5, 7, 8, 10];
// k = 1, 2, 0. With a stable 2-lure set the rotation must visit three positions.
const POSITION_REPETITIONS = [3, 6, 9];

interface CertifiedFrame {
  id: string;
  base: string;
  reflexive: ParticleVerbData['reflexive'];
  acceptedParticles: readonly string[];
  excluded: readonly string[];
  sentence: string;
}

function certifiedFrames(): CertifiedFrame[] {
  const frames: CertifiedFrame[] = [];
  for (const entry of PARTICLE_VERB_DATA) {
    if (!entry.verified) continue;
    for (const example of entry.examples) {
      const excluded = example.excludedParticles ?? [];
      if (excluded.length < CERTIFIED_DEPTH) continue;
      frames.push({
        id: entry.id,
        base: entry.baseInfinitive,
        reflexive: entry.reflexive,
        acceptedParticles: entry.acceptedParticles,
        excluded,
        sentence: example.sv,
      });
    }
  }
  return frames;
}

function asFrame(frame: CertifiedFrame): DiscriminationFrame {
  return {
    reflexive: frame.reflexive,
    acceptedParticles: frame.acceptedParticles,
    excludedParticles: frame.excluded,
  };
}

function introducedFor(frame: CertifiedFrame): Set<string> {
  return new Set(frame.excluded);
}

function label(frame: CertifiedFrame, repetitions: number): string {
  return `${frame.id} "${frame.sentence}" repetitions ${repetitions}`;
}

const frames = certifiedFrames();

describe('selectDiscriminationVariant over every certified frame (#474)', () => {
  it('is non-vacuous: at least the build-gate number of frames and bases', () => {
    expect(frames.length).toBeGreaterThanOrEqual(BUILD_GATE_FRAMES);
    expect(new Set(frames.map((frame) => frame.base)).size).toBeGreaterThanOrEqual(
      BUILD_GATE_BASES,
    );
  });

  it('returns the same variant, with k = floor(repetitions / 3), for the same inputs', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const frame of frames) {
      if (frame.reflexive !== 'none') continue;
      checked += 1;
      const introduced = introducedFor(frame);
      for (const repetitions of TRIGGER_REPETITIONS) {
        const first = selectDiscriminationVariant(asFrame(frame), repetitions, introduced);
        const second = selectDiscriminationVariant(asFrame(frame), repetitions, introduced);
        const where = label(frame, repetitions);
        if (first === null) {
          offenders.push(`${where}: selector returned null`);
          continue;
        }
        if (JSON.stringify(second) !== JSON.stringify(first)) {
          offenders.push(`${where}: two calls differed`);
        }
        if (first.renderIndex !== Math.floor(repetitions / 3)) {
          offenders.push(`${where}: renderIndex ${first.renderIndex} !== floor(repetitions / 3)`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('returns null off the one-in-three trigger', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const frame of frames) {
      checked += 1;
      const introduced = introducedFor(frame);
      for (const repetitions of OFF_TRIGGER_REPETITIONS) {
        const variant = selectDiscriminationVariant(asFrame(frame), repetitions, introduced);
        if (variant !== null) {
          offenders.push(`${label(frame, repetitions)}: rendered a card off the trigger`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('marks exactly one of three options correct', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const frame of frames) {
      if (frame.reflexive !== 'none') continue;
      checked += 1;
      const introduced = introducedFor(frame);
      for (const repetitions of TRIGGER_REPETITIONS) {
        const variant = selectDiscriminationVariant(asFrame(frame), repetitions, introduced);
        const where = label(frame, repetitions);
        if (variant === null) {
          offenders.push(`${where}: selector returned null`);
          continue;
        }
        const correct = variant.options.filter((option) => option.correct);
        const particles = variant.options.map((option) => option.particle);
        if (variant.options.length !== 3 || correct.length !== 1) {
          offenders.push(`${where}: ${variant.options.length} options, ${correct.length} correct`);
        }
        if (new Set(particles).size !== particles.length) {
          offenders.push(`${where}: duplicate option labels ${JSON.stringify(particles)}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('keeps the answer key out of excludedParticles and intersects acceptedParticles once', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const frame of frames) {
      if (frame.reflexive !== 'none') continue;
      checked += 1;
      const introduced = introducedFor(frame);
      for (const repetitions of TRIGGER_REPETITIONS) {
        const variant = selectDiscriminationVariant(asFrame(frame), repetitions, introduced);
        const where = label(frame, repetitions);
        if (variant === null) {
          offenders.push(`${where}: selector returned null`);
          continue;
        }
        const correct = variant.options.filter((option) => option.correct);
        const correctParticle = correct[0]?.particle;
        const optionParticles = variant.options.map((option) => option.particle);
        const acceptedHits = optionParticles.filter((particle) =>
          frame.acceptedParticles.includes(particle),
        );
        const lures = variant.options
          .filter((option) => !option.correct)
          .map((option) => option.particle);
        if (correctParticle !== frame.acceptedParticles[0]) {
          offenders.push(
            `${where}: correct option ${String(correctParticle)} is not acceptedParticles[0] (${frame.acceptedParticles[0]})`,
          );
        }
        if (correctParticle !== undefined && frame.excluded.includes(correctParticle)) {
          offenders.push(`${where}: answer key "${correctParticle}" is in excludedParticles`);
        }
        if (acceptedHits.length !== 1) {
          offenders.push(
            `${where}: option set intersects acceptedParticles ${acceptedHits.length} times (${JSON.stringify(acceptedHits)})`,
          );
        }
        for (const alternate of frame.acceptedParticles.slice(1)) {
          if (optionParticles.includes(alternate)) {
            offenders.push(`${where}: second accepted spelling "${alternate}" is an option`);
          }
        }
        for (const lure of lures) {
          if (!frame.excluded.includes(lure)) {
            offenders.push(`${where}: lure "${lure}" is not an excludedParticle`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('does not park the correct option at a fixed position across successive render indexes', () => {
    const offenders: string[] = [];
    let twoLureFrames = 0;
    for (const frame of frames) {
      if (frame.reflexive !== 'none') continue;
      // More than two eligible lures moves the window as well as the
      // rotation, and the selector's own comment records that a position
      // can then repeat. Every certified frame today has exactly two.
      if (frame.excluded.length !== 2) continue;
      twoLureFrames += 1;
      const introduced = introducedFor(frame);
      const positions: number[] = [];
      for (const repetitions of POSITION_REPETITIONS) {
        const variant = selectDiscriminationVariant(asFrame(frame), repetitions, introduced);
        if (variant === null) {
          offenders.push(`${label(frame, repetitions)}: selector returned null`);
          continue;
        }
        positions.push(variant.options.findIndex((option) => option.correct));
      }
      if (new Set(positions).size !== positions.length) {
        offenders.push(
          `${frame.id}: correct option positions ${positions.join(', ')} are not all different`,
        );
      }
    }
    expect(twoLureFrames).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
