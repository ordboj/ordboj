import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import Practice from "@/pages/Practice";

// Practice.tsx composes useSrsProgress (srs-engine) and useSettings
// (srs-engine) with PracticeCard (ui-craft). Those two hooks are mocked here
// as boundaries this suite does not own, driven by hoisted mutable state so
// each test can steer them without re-declaring vi.mock. The real
// conjugateVerb() lookup (swedish-linguist) is left untouched, so the actual
// answer-checking wiring between the page and the card is exercised
// end-to-end, not just the page's own state machine.
const mocks = vi.hoisted(() => {
  return {
    recordAnswer: vi.fn(),
    dueItems: [] as Array<{ verbId: string; infinitive: string; form: string; itemId: string }>,
    srsLoading: false,
    settingsLoading: false,
  };
});

vi.mock("@/hooks/useSrsProgress", () => ({
  useSrsProgress: () => ({
    isLoading: mocks.srsLoading,
    getDueItems: async () => mocks.dueItems,
    recordAnswer: mocks.recordAnswer,
    exportData: () => "{}",
    importData: () => true,
    resetProgress: () => undefined,
    srsStates: {},
    initializeAllItems: () => undefined,
  }),
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    isLoading: mocks.settingsLoading,
    settings: {
      practiceMode: "typing",
      showExamples: false,
      autoplayAudio: false,
      muteAudio: true,
      dailyGoal: 20,
      cefrLevels: ["A1"],
    },
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.recordAnswer.mockClear();
  mocks.srsLoading = false;
  mocks.settingsLoading = false;
  mocks.dueItems = [
    { verbId: "1", infinitive: "vara", form: "presens", itemId: "1-presens" },
    { verbId: "1", infinitive: "vara", form: "preteritum", itemId: "1-preteritum" },
  ];
});

describe("Practice page - one full session", () => {
  it("walks through both due cards and lands on the completion screen, recording each answer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Practice />, { route: "/practice" });

    // Card 1 of 2: "vara" presens -> "är"
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    const firstInput = await screen.findByPlaceholderText("Type your answer...");
    await user.type(firstInput, "är");
    expect(await screen.findByText("Correct!")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next card/i }));

    // Card 2 of 2: "vara" preteritum -> "var"
    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    const secondInput = await screen.findByPlaceholderText("Type your answer...");
    await user.type(secondInput, "var");
    expect(await screen.findByText("Correct!")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next card/i }));

    // Session complete screen.
    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
    expect(screen.getByText(/completed all due cards/i)).toBeInTheDocument();

    expect(mocks.recordAnswer).toHaveBeenCalledTimes(2);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(1, "1-presens", 5);
    expect(mocks.recordAnswer).toHaveBeenNthCalledWith(2, "1-preteritum", 5);
  });

  it("shows the completion screen immediately when there are no due cards", async () => {
    mocks.dueItems = [];
    renderWithProviders(<Practice />, { route: "/practice" });

    expect(await screen.findByText(/Great Work/i)).toBeInTheDocument();
  });

  it("shows a loading state before settings and progress have loaded", async () => {
    mocks.settingsLoading = true;
    renderWithProviders(<Practice />, { route: "/practice" });

    expect(screen.getByText(/Loading practice cards/i)).toBeInTheDocument();
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();
  });
});
