import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Marks a route chunk import that failed even after every automatic retry
 * in retryImport() below. React.lazy() caches whatever its factory's
 * promise resolves *or rejects* to, permanently: once that promise
 * rejects, every later render of the SAME lazy() component replays the
 * cached rejection, and there is no way to make it re-fetch by
 * re-rendering it (e.g. via an error boundary's plain "Try again" reset).
 * So callers (see RouteChunk in AppErrorBoundary.tsx) can distinguish this
 * failure from an ordinary render crash elsewhere on the page: a
 * ChunkLoadError means the only real fix is a full document reload, not
 * another soft reset against an already-poisoned lazy import.
 */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'ChunkLoadError';
  }
}

/** Automatic retries for a chunk import before it is treated as failed. */
const CHUNK_LOAD_RETRIES = 2;
const CHUNK_LOAD_RETRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a route chunk's dynamic import with backoff before ever handing
 * a rejected promise to React.lazy(). This recovers a transient chunk-load
 * failure (flaky network) automatically, without the user ever seeing a
 * crash. If every retry still fails - most likely a stale client asking
 * for a chunk hash a fresh deploy has already removed from the server -
 * the final rejection is wrapped in ChunkLoadError so the caller's
 * fallback can offer a full reload instead of a useless soft retry.
 */
async function retryImport<T>(
  importFn: () => Promise<T>,
  retriesLeft: number = CHUNK_LOAD_RETRIES,
  delayMs: number = CHUNK_LOAD_RETRY_DELAY_MS,
): Promise<T> {
  try {
    return await importFn();
  } catch (error) {
    if (retriesLeft <= 0) throw new ChunkLoadError(error);
    await delay(delayMs);
    return retryImport(importFn, retriesLeft - 1, delayMs * 2);
  }
}

/**
 * Wraps a route's dynamic import with retryImport() before handing it to
 * React.lazy(). Use this in place of a bare `lazy(() => import(...))` for
 * every route module - it is still called exactly once, at module scope,
 * so it does not itself work around the permanent-rejection-caching issue;
 * pairing it with RouteChunk (AppErrorBoundary.tsx) is what does.
 */
export function lazyRoute<T extends ComponentType>(
  importFn: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => retryImport(importFn));
}
