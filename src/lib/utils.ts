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
 * A module that fetched fine but threw while evaluating is a code bug, not
 * a chunk-load failure: reloading just reproduces it. Only failures that
 * look like a failed fetch/network problem loading the chunk itself get
 * the reload path. "network" is included alongside the browser-specific
 * dynamic-import failure phrasings because a flaky connection dropping
 * mid-fetch is exactly the transient case retryImport() exists to recover
 * from, and it does not always surface with the word "chunk" or "fetch"
 * in its message.
 */
function isChunkFetchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  return /(failed to fetch|dynamically imported module|error loading|importing a module script failed|chunk|network)/i.test(
    error.message,
  );
}

/**
 * Retries a route chunk's dynamic import with backoff before ever handing
 * a rejected promise to React.lazy(). This can recover a transient
 * chunk-load failure automatically. Note that native ESM records a failed
 * module fetch in the module map keyed on URL, so a retry of the same
 * specifier may replay the cached failure without re-fetching; the
 * reliable recovery for a genuinely unavailable chunk is the full reload
 * in RouteChunk. If every retry still fails - most likely a stale client
 * asking for a chunk hash a fresh deploy has already removed from the
 * server - the final rejection is wrapped in ChunkLoadError so the
 * caller's fallback can offer a full reload instead of a useless soft
 * retry. An error that is not itself a fetch failure (e.g. the module
 * evaluated but threw) is not retried and is not wrapped: it propagates
 * as-is so the caller's ordinary soft reset applies instead of a reload
 * loop that would just reproduce the same code bug.
 */
async function retryImport<T>(
  importFn: () => Promise<T>,
  retriesLeft: number = CHUNK_LOAD_RETRIES,
  delayMs: number = CHUNK_LOAD_RETRY_DELAY_MS,
): Promise<T> {
  try {
    return await importFn();
  } catch (error) {
    if (!isChunkFetchFailure(error)) throw error;
    if (retriesLeft <= 0) throw isChunkFetchFailure(error) ? new ChunkLoadError(error) : error;
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
