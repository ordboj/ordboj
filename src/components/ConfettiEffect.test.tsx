import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { ConfettiEffect } from '@/components/ConfettiEffect';

// canvas-confetti is neutralized globally in src/test/setup.ts (jsdom has
// no canvas 2d context), so `confetti` here is the shared vi.fn() mock —
// exactly the boundary this suite is allowed to assert call counts on,
// since "was the reward animation fired" is the entire contract of
// ConfettiEffect.
const mockedConfetti = vi.mocked(confetti);

function mockPrefersReducedMotion(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  mockedConfetti.mockClear();
});

// Issue #110: confetti is a pure reward animation with 100 particles; it
// must be skipped entirely when the OS asks for reduced motion. (A
// companion "fires normally when motion is not reduced" case was
// considered and dropped: that behavior predates this PR and passes
// against the pre-fix component too, so it would not prove anything about
// this fix — see qa fail-first proof.)
describe('ConfettiEffect - prefers-reduced-motion (issue #110)', () => {
  it('skips the confetti burst entirely when prefers-reduced-motion matches', () => {
    mockPrefersReducedMotion(true);
    const { rerender } = render(<ConfettiEffect trigger={false} />);

    rerender(<ConfettiEffect trigger={true} />);

    expect(mockedConfetti).not.toHaveBeenCalled();
  });
});
