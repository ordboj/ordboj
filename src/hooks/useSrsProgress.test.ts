import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSrsProgress } from "@/hooks/useSrsProgress";
import type { ConjugatedVerb, Verb } from "@/lib/verbs";

const STORAGE_KEY = "swedish-verbs-srs-progress";

// This suite mocks the swedish-linguist-owned '@/lib/verbs' boundary so the
// SRS wiring (owned by srs-engine) can be tested against a small, known,
// deterministic verb set instead of the real ~50-verb table. The real table
// currently has every verb at cefr "A1" (see verbs.realdata.test.ts), which
// makes the cefrLevels filter untestable against real data.
const FIXTURE_VERBS: Verb[] = [
  { id: "1", infinitive: "testa", cefr: "A1" },
  { id: "2", infinitive: "prova", cefr: "B1" },
];

const FIXTURE_CONJUGATIONS: Record<string, ConjugatedVerb> = {
  testa: {
    id: "1",
    infinitive: "testa",
    cefr: "A1",
    presens: "testar",
    preteritum: "testade",
    supinum: "testat",
    imperativ: "testa",
  },
  prova: {
    id: "2",
    infinitive: "prova",
    cefr: "B1",
    presens: "provar",
    preteritum: "provade",
    supinum: "provat",
    // "prova" has no attested imperativ in this fixture; the hook's
    // getDueItems must skip this form entirely.
    imperativ: "(not available)",
  },
};

vi.mock("@/lib/verbs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/verbs")>();
  return {
    ...actual,
    getVerbs: vi.fn(async () => FIXTURE_VERBS),
    conjugateVerb: vi.fn(async (infinitive: string) => {
      return (
        FIXTURE_CONJUGATIONS[infinitive] ?? {
          id: "unknown",
          infinitive,
          presens: "(not available)",
          preteritum: "(not available)",
          supinum: "(not available)",
          imperativ: "(not available)",
        }
      );
    }),
  };
});

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z").getTime();
const ALL_ITEM_IDS = [
  "1-presens",
  "1-preteritum",
  "1-supinum",
  "1-imperativ",
  "2-presens",
  "2-preteritum",
  "2-supinum",
  "2-imperativ",
];

beforeEach(() => {
  localStorage.clear();
  // Only fake Date: RTL's waitFor polls with real setTimeout/MutationObserver
  // internally, so faking timers wholesale would freeze that polling too.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cold start", () => {
  it("initializes every verb x form combination when localStorage is empty", async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(Object.keys(result.current.srsStates).sort()).toEqual(ALL_ITEM_IDS.sort());
    for (const itemId of ALL_ITEM_IDS) {
      const state = result.current.srsStates[itemId];
      expect(state).toMatchObject({ itemId, repetitions: 0, intervalDays: 0, easeFactor: 2.5, dueAt: FIXED_NOW });
    }
  });
});

describe("persistence - the irreplaceable-progress invariant", () => {
  it("writes state to the documented localStorage key and re-reads it verbatim on remount", async () => {
    const first = renderHook(() => useSrsProgress());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    act(() => {
      first.result.current.recordAnswer("1-presens", 5);
    });
    await waitFor(() => expect(first.result.current.srsStates["1-presens"].repetitions).toBe(1));

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed["1-presens"].repetitions).toBe(1);

    first.unmount();

    // Advance the clock so a fresh initialization (a bug) would produce a
    // different dueAt than the one already persisted (correct behavior).
    vi.setSystemTime(FIXED_NOW + 60_000);

    const second = renderHook(() => useSrsProgress());
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(second.result.current.srsStates["1-presens"]).toEqual(parsed["1-presens"]);
  });
});

describe("recordAnswer", () => {
  it("moves an item out of the due set once it has been answered", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = await result.current.getDueItems();
    expect(before.map((i) => i.itemId)).toContain("1-presens");

    act(() => {
      result.current.recordAnswer("1-presens", 5);
    });
    await waitFor(() => expect(result.current.srsStates["1-presens"].repetitions).toBe(1));

    const after = await result.current.getDueItems();
    expect(after.map((i) => i.itemId)).not.toContain("1-presens");
    // Its sibling items, untouched, are still due.
    expect(after.map((i) => i.itemId)).toContain("1-preteritum");
  });
});

describe("getDueItems filtering", () => {
  it("respects the cefrLevels filter", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress(["B1"]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    expect(due.every((item) => item.verbId === "2")).toBe(true);
    expect(due.some((item) => item.verbId === "1")).toBe(false);
  });

  it('skips forms whose conjugation is "(not available)"', async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress(["B1"]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const due = await result.current.getDueItems();
    expect(due.map((i) => i.itemId)).not.toContain("2-imperativ");
    expect(due.map((i) => i.itemId).sort()).toEqual(["2-presens", "2-preteritum", "2-supinum"].sort());
  });

  it("shuffles deterministically when Math.random is stubbed", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = await result.current.getDueItems();
    const second = await result.current.getDueItems();
    expect(first.map((i) => i.itemId)).toEqual(second.map((i) => i.itemId));
  });
});

describe("corrupt localStorage", () => {
  it("does not throw on garbage JSON and initializes fresh state instead of leaving the app stuck", async () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json!!");

    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(Object.keys(result.current.srsStates).sort()).toEqual(ALL_ITEM_IDS.sort());
  });
});

describe("importData", () => {
  it("returns false and leaves in-memory state intact when given malformed JSON", async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.recordAnswer("1-presens", 5);
    });
    await waitFor(() => expect(result.current.srsStates["1-presens"].repetitions).toBe(1));

    const snapshot = JSON.parse(JSON.stringify(result.current.srsStates));

    let importResult: boolean | undefined;
    act(() => {
      importResult = result.current.importData("{this is not json");
    });

    expect(importResult).toBe(false);
    expect(result.current.srsStates).toEqual(snapshot);
  });
});

describe("quota exceeded on write", () => {
  // BUG: src/hooks/useSrsProgress.ts around line 57 calls
  // `localStorage.setItem(STORAGE_KEY, ...)` inside a plain useEffect with no
  // try/catch. When the browser's storage quota is exceeded, setItem throws
  // a DOMException synchronously inside that effect, which propagates as an
  // uncaught render-phase error instead of being handled gracefully. Given
  // "user progress is irreplaceable" (CLAUDE.md), a full write failure
  // should be caught and surfaced, not allowed to crash the tree.
  // Owner: srs-engine (src/hooks/useSrsProgress.ts).
  it.fails("does not crash the component tree when localStorage.setItem throws (quota exceeded)", async () => {
    const { result } = renderHook(() => useSrsProgress());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    expect(() => {
      act(() => {
        result.current.recordAnswer("1-presens", 5);
      });
    }).not.toThrow();
  });
});
