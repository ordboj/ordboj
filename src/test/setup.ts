import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { releaseJsdomSelectorCache } from '@/test/releaseJsdomSelectorCache';

// Unmount any component tree rendered by the previous test, then drop
// jsdom's selector-engine handles on the detached nodes (ORD-71).
afterEach(() => {
  cleanup();
  releaseJsdomSelectorCache();
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

// jsdom does not implement URL.createObjectURL/revokeObjectURL. Export flows
// (Settings "Export Progress") build a Blob and call this to produce a
// download link; without a stub, exercising that click throws
// "URL.createObjectURL is not a function" for reasons unrelated to the
// behavior under test.
//
// Vitest's jsdom environment does install a createObjectURL, so a
// "only if missing" guard is not enough. That wrapper reads the Blob impl
// off the first own symbol (`blob[implSymbol]._buffer`). jsdom 30.1 moved
// the impl into a private field, the symbol is undefined, and the call
// throws "Cannot read properties of undefined (reading '_buffer')". React
// reports that click-dispatch exception as an unhandled error, which fails
// the run after the test assertions have already passed. Always replace the
// method. Tests only need a URL string here.
//
// configurable: true matches the deliberately-configurable local stub
// pattern in AppErrorBoundary.test.tsx (which vi.spyOn()s these same
// properties per-test): a non-configurable global stub here would silently
// pre-empt that file's own `if (!('createObjectURL' in URL))` guard and
// leave the property unable to be cleanly reconfigured/restored.
Object.defineProperty(window.URL, 'createObjectURL', {
  writable: true,
  configurable: true,
  value: vi.fn(() => 'blob:mock-url'),
});
if (!window.URL.revokeObjectURL) {
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
}

// jsdom does not implement the Web Speech API either (no
// window.speechSynthesis / SpeechSynthesisUtterance), same as the gaps
// above. Unlike those, no fake is installed globally here: src/test/
// speechMock.ts's installSpeechSynthesisMock() is opt-in per file (see its
// header comment), so suites that never call it keep observing
// `'speechSynthesis' in window === false`, exactly as before this file
// existed.
