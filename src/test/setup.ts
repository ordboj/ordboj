import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount any component tree rendered by the previous test.
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia. src/hooks/use-mobile.tsx and some
// Radix-adjacent UI primitives call it during render.
//
// This is a plain function, not a vi.fn(), as defensive hardening: it makes
// this stub immune to any future restoreMocks/spy interaction, whatever
// that interaction turns out to be. It is not a fix for a real wipe -
// vitest's restoreMocks (mockRestore()) only resets vi.spyOn() spies back to
// their original implementation; a vi.fn().mockImplementation(...) here
// would have kept its implementation across tests exactly like this plain
// function does. The App.test.tsx failure this was chasing was actually
// fixed by removing that file's `vi.mock('sonner', ...)`: sonner.tsx reads
// window.matchMedia() itself when its `theme={theme}` prop is `"system"`,
// and the mock was preventing that branch (and this matchMedia stub) from
// ever being exercised in the first place.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// canvas-confetti calls HTMLCanvasElement#getContext("2d"), which jsdom does
// not implement ("Not implemented" error). It is a fire-and-forget visual
// effect with no observable behavior worth exercising here, so it is
// neutralized at the module boundary for every test file.
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));
