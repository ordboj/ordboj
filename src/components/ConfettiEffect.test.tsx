import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { ConfettiEffect } from '@/components/ConfettiEffect';

// canvas-confetti is mocked globally in src/test/setup.ts (jsdom has no
// canvas 2d context). `restoreMocks: true` clears call history between
// tests but keeps it callable, so `confetti` here is the same vi.fn() the
// component calls.
const confettiMock = confetti as unknown as ReturnType<typeof vi.fn>;

function mockPrefersReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('ConfettiEffect', () => {
  beforeEach(() => {
    // `restoreMocks: true` (vitest.config.ts) only affects vi.spyOn spies;
    // it is a documented no-op on a plain vi.fn() like the one returned by
    // this vi.mock() factory, so its call history must be cleared by hand.
    confettiMock.mockClear();
    mockPrefersReducedMotion(false);
  });

  it('fires confetti when triggered and the user has no reduced-motion preference', () => {
    render(<ConfettiEffect trigger={true} />);

    expect(confettiMock).toHaveBeenCalledTimes(1);
  });

  it('does not fire confetti when trigger is false', () => {
    render(<ConfettiEffect trigger={false} />);

    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('skips the burst entirely when prefers-reduced-motion is set, even though trigger is true', () => {
    mockPrefersReducedMotion(true);

    render(<ConfettiEffect trigger={true} />);

    expect(confettiMock).not.toHaveBeenCalled();
  });

  it('checks prefers-reduced-motion at the moment it fires, not once globally', () => {
    // A stale/cached reduced-motion read would be a subtle a11y bug: a user
    // could toggle the OS setting mid-session. Flipping trigger false->true
    // after the preference is set must still respect it.
    mockPrefersReducedMotion(true);
    const { rerender } = render(<ConfettiEffect trigger={false} />);
    expect(confettiMock).not.toHaveBeenCalled();

    rerender(<ConfettiEffect trigger={true} />);
    expect(confettiMock).not.toHaveBeenCalled();
  });
});
