import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount any component tree rendered by the previous test.
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia. src/hooks/use-mobile.tsx and some
// Radix-adjacent UI primitives call it during render.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
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

// canvas-confetti calls HTMLCanvasElement#getContext("2d"), which jsdom does
// not implement ("Not implemented" error). It is a fire-and-forget visual
// effect with no observable behavior worth exercising here, so it is
// neutralized at the module boundary for every test file.
vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));
