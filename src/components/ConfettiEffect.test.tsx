import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { ConfettiEffect } from '@/components/ConfettiEffect';

// canvas-confetti is globally mocked as `vi.fn()` in src/test/setup.ts (a
// boundary this suite does not own: real confetti calls
// HTMLCanvasElement#getContext("2d"), which jsdom doesn't implement). The
// mock is the observable surface for "did the animation fire".
const confettiMock = vi.mocked(confetti);

// jsdom's own matchMedia (stubbed in setup.ts) always reports matches:
// false. Override it per-test to control prefers-reduced-motion without
// touching the setup.ts stub other suites rely on.
function setPrefersReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  confettiMock.mockClear();
  setPrefersReducedMotion(false);
});

describe('ConfettiEffect - prefers-reduced-motion (issue #110 AC)', () => {
  it('fires confetti when trigger is already true on initial mount and there is no reduced-motion preference', () => {
    render(<ConfettiEffect trigger={true} />);

    expect(confettiMock).toHaveBeenCalledTimes(1);
  });

  it('does not fire confetti when trigger is false on initial mount', () => {
    render(<ConfettiEffect trigger={false} />);

    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('skips the burst on initial mount when prefers-reduced-motion is set, even though trigger is true', () => {
    setPrefersReducedMotion(true);

    render(<ConfettiEffect trigger={true} />);

    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('fires the confetti burst when trigger becomes true and the OS has not asked for reduced motion', () => {
    setPrefersReducedMotion(false);
    const { rerender } = render(<ConfettiEffect trigger={false} />);
    expect(confettiMock).not.toHaveBeenCalled();

    rerender(<ConfettiEffect trigger={true} />);
    expect(confettiMock).toHaveBeenCalledTimes(1);
  });

  // Regression test: before this fix, ConfettiEffect fired unconditionally
  // on every `trigger` transition to true (100 particles), with no check of
  // prefers-reduced-motion at all.
  it('does not fire the confetti burst when trigger becomes true and prefers-reduced-motion: reduce matches', () => {
    setPrefersReducedMotion(true);
    const { rerender } = render(<ConfettiEffect trigger={false} />);
    expect(confettiMock).not.toHaveBeenCalled();

    rerender(<ConfettiEffect trigger={true} />);
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('still does nothing while trigger stays false, regardless of the motion preference', () => {
    setPrefersReducedMotion(false);
    render(<ConfettiEffect trigger={false} />);
    expect(confettiMock).not.toHaveBeenCalled();
  });
});
